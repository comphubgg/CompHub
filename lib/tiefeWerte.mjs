/*
 * Deep Stats (/deep-stats): Auswertungen je Spieltag, die nur das voll gelesene Replay hergibt (Betreiber, 26.11.2026 - eine eigene Seite, NICHT unter
 * /statistics):
 *
 *   1. Schaden je Waffe     jeder Treffer der Waffe des Schuetzen zugeordnet
 *   2. Treffer              Treffer, Kopftreffer, abgegebene Schuesse (wo das Inventar sie fuehrt)
 *   3. Third Partys         wer in fremde Kaempfe eingreift, und wen es trifft
 *   4. Lande- und Todesorte als Waermebild auf der Karte
 *
 * Zwei Haelften, beide ohne Abhaengigkeiten (gebraucht von lib/vollMatch.mjs im Ablauf und von lib/tiefeStats.ts auf dem Server):
 *
 *   tiefBeitrag(voll, id)       aus EINEM gelesenen Match (Ausgabe von tools/replay-voll, oder die Datei unter replay-voll/) ein kleiner Beitrag -
 *                               ein paar Kilobyte statt 1,6 MB; ein Match aendert sich nie, der Beitrag also auch nicht
 *   tiefZusammen(beitraege, k)  die Beitraege eines Spieltags zusammen
 *
 * DIE TREFFER (tools/replay-voll, TrefferListe): [Zeit, Schuetze, Ziel, Schaden, Kopftreffer, Ziel am Boden, toedlich, auf den Schild]. Der Schaden ist der
 * wirksame (Knock- und Kill-Schuss nur bis Leben + Schild des Gegners), auf Umgehauene zaehlt er nicht - genau so entsteht "Damage" der Player Stats
 * (lib/vollSchaden.mjs, dmg = gemachtOhneBoden). Die Summe je Waffe ergibt darum die Summe des Spielers (bis auf das Runden je Treffer).
 *
 * WELCHE WAFFE: hat der Treffer eine neunte Stelle >= 0 (Nummer in waffenNamen - SourceWeapon, Leser ab Fassung 19, 26.11.2026), gilt die. Sonst, was der
 * Schuetze im Augenblick des Treffers in der Hand hielt (hand: [Zeit, Nr in waffenNamen]). Ein Treffer kommt einen Moment nach dem Schuss an; hielt er da
 * schon Bauwerkzeug, Heilung oder Munition, zaehlt die zuletzt gehaltene Waffe bis 3 s davor (im Performance-Finale Event3 Round2 EU rund 2 % des Schadens).
 * Ohne Waffe in dieser Zeit: "?" - nicht geraten.
 */

/** Hoch setzen, wenn sich die Rechnung eines Beitrags aendert - gemerkte Beitraege werden dann neu gerechnet. */
export const TIEF_FASSUNG = 2;

/** So lange nach einer gehaltenen Waffe zaehlt ein Treffer noch fuer sie, wenn der Schuetze schon etwas anderes in der Hand hat (Sekunden). */
const NACHLAUF = 3;
/** Kampf: Treffer zwischen zwei Teams ohne Pause ueber so viele Sekunden. */
export const KAMPF_PAUSE = 15;
/** Third Party: ein drittes Team trifft eines der beiden waehrend des Kampfs oder bis so viele Sekunden nach dessen letztem Treffer. */
export const DRITT_NACH = 10;

/*
 * Waffenarten. Eigene Liste statt artVon aus app/replays/SpielerEbene (eine Client-Datei, auf dem Server nicht nutzbar) - dieselben Muster, nur die
 * Scharfschuetzen vor den Sturmgewehren (sonst waere "Rifle_Sniper" ein Sturmgewehr) und die Maschinenpistolen mit Pistolen-Bauplan (Tactical SMG,
 * Machine SMG) vor den Pistolen.
 */
const ARTEN = [
  ['shotgun', /Shotgun|TacSG|VampireStake/i],
  ['sniper', /Sniper|HeatSnake|Rifle_NoScope|Drift|Hunting/i],
  ['smg', /SMG|BoneRattler|Pistol_Machine|Pistol_PostApocalyptic|Pistol_Scavenger|LoudKiwi/i],
  ['ar', /Assault|Rifle/i],
  ['pistol', /Pistol|Dualies|FiendHunter|Revolver/i],
  ['hacke', /Pickaxe|StarWand|Melee_Impact/i],
];
/** Was keine Waffe ist: Bauen, Editieren, Heilung, Essen, Vorrat, Werkzeug. */
const KEINE_WAFFE = /BuildingTool|EditingTool|EditTool|Consumable|ShieldPot|MiniShield|HalfShield|ShieldSmall|Medkit|MedBox|Bandage|Chug|Slurp|PurpleStuff|Flopper|JellyFish|Fish|Apple|Banana|Pepper|Mushroom|CandyCorn|DuckSnack|MeatOnStick|ShreddingJune|AmmoData|ItemData|Wads|SmallKey|_Key_|Keycard|ZiplineDeployer|FloppingRabbit|Glider|(?:^|_)Rift(?:_|$)|Campfire/i;

/**
 * Die Art einer Waffe ("shotgun", "ar", "smg", "pistol", "sniper", "hacke", "sonst") - "keine" fuer Bauwerkzeug, Heilung und Co., "?" fuer unbekannt.
 * @param {string} roh
 * @returns {string}
 */
export function waffenArt(roh) {
  if (!roh || roh === '?') return '?';
  if (KEINE_WAFFE.test(roh)) return 'keine';
  for (const [art, m] of ARTEN) if (/** @type {RegExp} */ (m).test(roh)) return /** @type {string} */ (art);
  return 'sonst';
}

/** Der letzte Index mit Zeit <= t (binaere Suche) - oder -1. */
function bis(liste, t) {
  let lo = 0; let hi = liste.length - 1; let r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (liste[m][0] <= t) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}

const rund = (x) => Math.round(x);
const ort = (x) => Math.round(x / 10) * 10;

/**
 * Der Beitrag eines Matches.
 *
 * wn: die Waffen (Bauplaene) dieses Matches
 * s:  je Epic-Konto { n: Name, d: Schaden, h: Treffer, k: Kopftreffer, sf: abgegebene Schuesse oder null, w: [[Nr in wn, Schaden, Treffer, Kopftreffer]] }
 * tm: je Team-Nummer des Matches die Epic-Konten
 * f:  je Team-Nummer [Kaempfe, in fremde Kaempfe eingegriffen, selbst dazwischen geraten]
 * l / td: Lande- und Todesorte [x, y] (auf 10 Einheiten)
 */
export function tiefBeitrag(voll, id) {
  if (!voll || !Array.isArray(voll.spieler)) return null;
  const namen = Array.isArray(voll.waffenNamen) ? voll.waffenNamen : [];
  const hand = voll.hand && typeof voll.hand === 'object' ? voll.hand : {};
  const treffer = Array.isArray(voll.treffer) ? voll.treffer : [];
  const epicVon = new Map(); const teamVon = new Map(); const bot = new Set();
  const s = {}; const tm = {};
  for (const p of voll.spieler) {
    teamVon.set(p.id, p.team);
    if (p.bot || !p.epic) { bot.add(p.id); continue; }
    const e = String(p.epic).toLowerCase();
    epicVon.set(p.id, e);
    s[e] = { n: typeof p.name === 'string' ? p.name : '', d: 0, h: 0, k: 0, sf: null, w: [] };
    if (p.team !== undefined && p.team !== null) (tm[p.team] ??= []).push(e);
  }
  // Abgegebene Schuesse aus dem Inventar (extra[id][12], tools/replay-voll ExtraSchuesse) - nur, wo der Leser das Inventar kennt (mindestens 17 Werte).
  for (const [pid, x] of Object.entries(voll.extra ?? {})) {
    const e = epicVon.get(Number(pid));
    if (e && Array.isArray(x) && x.length >= 17 && Number.isFinite(x[12])) s[e].sf = rund(x[12]);
  }

  /** Die Waffe zu einem Treffer: neunte Stelle, sonst die Hand (mit Nachlauf). */
  // Wie zugeordnet: [ueber die neunte Stelle (Leser ab Fassung 19), ueber die Hand] - die Seite sagt, welcher Weg galt.
  const weg = [0, 0];
  const waffeZu = (h) => {
    if (h.length > 8 && Number.isInteger(h[8]) && h[8] >= 0 && namen[h[8]]) { weg[0] += 1; return namen[h[8]]; }
    weg[1] += 1;
    const l = hand[h[1]];
    if (!Array.isArray(l) || !l.length) return '?';
    let i = bis(l, h[0] + 0.05);
    if (i < 0) return '?';
    const jetzt = namen[l[i][1]] ?? '?';
    if (waffenArt(jetzt) !== 'keine') return jetzt;
    // Bauwerkzeug, Heilung ... in der Hand: die zuletzt gehaltene Waffe, wenn sie bis NACHLAUF Sekunden vor dem Treffer noch in der Hand war.
    for (i -= 1; i >= 0; i -= 1) {
      const roh = namen[l[i][1]] ?? '?';
      const art = waffenArt(roh);
      if (art === 'keine' || art === '?') { if (h[0] - l[i][0] > NACHLAUF + 30) break; continue; }
      // Bis wann sie gehalten wurde: der Wechsel danach.
      return h[0] - l[i + 1][0] <= NACHLAUF ? roh : '?';
    }
    return '?';
  };

  // Die Waffen dieses Matches als Liste (wn), je Spieler nur ihre Nummer: [Nr, Schaden, Treffer, Kopftreffer].
  const wn = []; const wnr = new Map();
  for (const h of treffer) {
    if (!Array.isArray(h) || h.length < 7) continue;
    const e = epicVon.get(h[1]);
    if (!e || h[1] === h[2]) continue;
    const roh = waffeZu(h);
    if (!wnr.has(roh)) { wnr.set(roh, wn.length); wn.push(roh); }
    const nr = wnr.get(roh);
    const z = s[e];
    let w = z.w.find((x) => x[0] === nr);
    if (!w) { w = [nr, 0, 0, 0]; z.w.push(w); }
    const dmg = h[5] ? 0 : Number(h[3]) || 0;
    z.d += dmg; z.h += 1; w[1] += dmg; w[2] += 1;
    if (h[4]) { z.k += 1; w[3] += 1; }
  }

  // Kaempfe und Third Partys - siehe kaempfe().
  const f = kaempfe(treffer, teamVon);

  // Landeorte (tools/replay-voll LandungJe: [Zeit, x, y, z]) und Todesorte (Kill-Feed "tot" mit Ort; Ursache 50 ist der Wiedereinstieg im Reload).
  const l = [];
  for (const [pid, x] of Object.entries(voll.landung ?? {})) {
    if (bot.has(Number(pid)) || !Array.isArray(x) || !Number.isFinite(x[1]) || !Number.isFinite(x[2])) continue;
    l.push([ort(x[1]), ort(x[2])]);
  }
  const td = [];
  const mitFeedOrt = new Set();
  for (const e of voll.feed ?? []) {
    if (e.art !== 'tot' || Number(e.ursache) === 50 || bot.has(e.opfer) || !Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
    td.push([ort(e.x), ort(e.y)]); mitFeedOrt.add(e.opfer);
  }
  for (const p of voll.spieler) {
    if (p.bot || mitFeedOrt.has(p.id) || p.tod === undefined || p.tod === null || !Number.isFinite(p.todX) || !Number.isFinite(p.todY)) continue;
    td.push([ort(p.todX), ort(p.todY)]);
  }

  // fa: Fassung des Lesers (tools/replay-voll). Vor 18 fehlte der Schaden aus Gameplay-Effekten (Explosionen, Bolzen; rund 2 %) - die Seite sagt das dazu.
  return { v: TIEF_FASSUNG, id: id ?? voll.match ?? null, playlist: typeof voll.playlist === 'string' ? voll.playlist : null, fa: Number.isFinite(voll.fassung) ? voll.fassung : null, weg, wn, s, tm, f, l, td };
}

/*
 * KAEMPFE UND THIRD PARTYS (die Regel steht auch auf der Seite):
 *   Ein Kampf sind Treffer zwischen zwei Teams in beide Richtungen, ohne Pause ueber KAMPF_PAUSE Sekunden.
 *   Ein drittes Team greift ein ("third party"), wenn es eines der beiden waehrend des Kampfs oder bis DRITT_NACH Sekunden nach dessen letztem Treffer
 *   trifft - und in den KAMPF_PAUSE Sekunden vor Kampfbeginn keines der beiden getroffen hatte (sonst war es von Anfang an dabei).
 *   Je Kampf zaehlt das dritte Team einmal "eingegriffen", jedes der beiden, das es dabei traf, einmal "dazwischen geraten".
 */
function kaempfe(treffer, teamVon) {
  const ev = [];
  for (const h of treffer) {
    if (!Array.isArray(h)) continue;
    const a = teamVon.get(h[1]); const b = teamVon.get(h[2]);
    if (a === undefined || b === undefined || a === null || b === null || a === b) continue;
    ev.push([h[0], a, b]);
  }
  ev.sort((x, y) => x[0] - y[0]);
  const offen = new Map(); const fertig = [];
  const schliesse = (k) => { const k0 = offen.get(k); if (k0) { if (k0.ab && k0.ba) fertig.push(k0); offen.delete(k); } };
  for (const [t, a, b] of ev) {
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    let x = offen.get(k);
    if (x && t - x.ende > KAMPF_PAUSE) { schliesse(k); x = undefined; }
    if (!x) { x = { a: Math.min(a, b), b: Math.max(a, b), start: t, ende: t, ab: false, ba: false }; offen.set(k, x); }
    x.ende = t;
    if (a === x.a) x.ab = true; else x.ba = true;
  }
  for (const k of [...offen.keys()]) schliesse(k);

  const f = {};
  const zeile = (team) => (f[team] ??= [0, 0, 0]);
  for (const k of fertig) {
    zeile(k.a)[0] += 1; zeile(k.b)[0] += 1;
    // Wer schon in den KAMPF_PAUSE Sekunden davor eines der beiden traf, gehoert zum Geschehen.
    const vorher = new Set();
    const eingegriffen = new Map();
    for (let i = untereGrenze(ev, k.start - KAMPF_PAUSE); i < ev.length && ev[i][0] <= k.ende + DRITT_NACH; i += 1) {
      const [t, von, an] = ev[i];
      if (von === k.a || von === k.b || (an !== k.a && an !== k.b)) continue;
      if (t <= k.start) { vorher.add(von); continue; }
      if (!eingegriffen.has(von)) eingegriffen.set(von, new Set());
      eingegriffen.get(von).add(an);
    }
    for (const [c, opfer] of eingegriffen) {
      if (vorher.has(c)) continue;
      zeile(c)[1] += 1;
      for (const o of opfer) zeile(o)[2] += 1;
    }
  }
  return f;
}

/** Der erste Index mit Zeit >= t. */
function untereGrenze(ev, t) {
  let lo = 0; let hi = ev.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (ev[m][0] < t) lo = m + 1; else hi = m; }
  return lo;
}

/**
 * Die Beitraege eines Spieltags zusammen - so klein, wie die Seite sie braucht (clutch-tief/<w>.json, lib/tiefeStats.ts).
 *
 *   waffen   [[Bauplan, Schaden, Treffer, Kopftreffer, Spieler mit Treffern]]
 *   spieler  [[Epic-Konto, Name, Spiele, Schaden, Treffer, Kopftreffer, Schuesse, Spiele mit Schuessen, [[Nr in waffen, Schaden, Treffer, Kopftreffer]]]]
 *   teams    [[Epic-Konten, Spiele, Kaempfe, eingegriffen, dazwischen geraten]] - ueber den Spieltag erkannt an ihren Mitgliedern
 *   alteLeser  Matches, die ein Leser vor Fassung 18 las (ohne Effekt-Schaden)
 *   orte     je Playlist { matches, l: { "x,y": Zahl }, t: { ... } } - Lande- (l) und Todesorte (t), gezaehlt je Zelle von ZELLE Einheiten
 */
export const ZELLE = 1000;
export function tiefZusammen(beitraege) {
  const spieler = new Map(); const waffen = new Map(); const teams = new Map(); const orte = {};
  let matches = 0; let alteLeser = 0; const weg = [0, 0];
  for (const b of beitraege) {
    if (!b?.s || !Array.isArray(b.wn)) continue;
    matches += 1;
    if (!(b.fa >= 18)) alteLeser += 1;
    if (Array.isArray(b.weg)) { weg[0] += b.weg[0] ?? 0; weg[1] += b.weg[1] ?? 0; }
    for (const [e, z] of Object.entries(b.s)) {
      const x = spieler.get(e) ?? { name: '', spiele: 0, dmg: 0, hits: 0, krit: 0, schuss: 0, schussSpiele: 0, w: new Map() };
      if (z.n) x.name = z.n;
      x.spiele += 1; x.dmg += z.d; x.hits += z.h; x.krit += z.k;
      if (typeof z.sf === 'number') { x.schuss += z.sf; x.schussSpiele += 1; }
      for (const [nr, d, h, k] of z.w ?? []) {
        const roh = b.wn[nr] ?? '?';
        const w = x.w.get(roh) ?? [0, 0, 0];
        w[0] += d; w[1] += h; w[2] += k; x.w.set(roh, w);
        const g = waffen.get(roh) ?? { dmg: 0, hits: 0, krit: 0, spieler: new Set() };
        g.dmg += d; g.hits += h; g.krit += k; g.spieler.add(e); waffen.set(roh, g);
      }
      spieler.set(e, x);
    }
    for (const [nr, mitglieder] of Object.entries(b.tm ?? {})) {
      const key = [...mitglieder].sort().join(',');
      const t = teams.get(key) ?? [key.split(','), 0, 0, 0, 0];
      t[1] += 1;
      const f = b.f?.[nr];
      if (f) { t[2] += f[0]; t[3] += f[1]; t[4] += f[2]; }
      teams.set(key, t);
    }
    const o = (orte[b.playlist ?? ''] ??= { matches: 0, l: {}, t: {} });
    o.matches += 1;
    const zaehle = (ziel, p) => { const k = `${Math.floor(p[0] / ZELLE)},${Math.floor(p[1] / ZELLE)}`; ziel[k] = (ziel[k] ?? 0) + 1; };
    for (const p of b.l ?? []) zaehle(o.l, p);
    for (const p of b.td ?? []) zaehle(o.t, p);
  }
  const liste = [...waffen.entries()].sort((a, b) => b[1].dmg - a[1].dmg);
  const nrVon = new Map(liste.map(([roh], i) => [roh, i]));
  return {
    v: TIEF_FASSUNG, zelle: ZELLE, matches, alteLeser, weg,
    waffen: liste.map(([roh, g]) => [roh, g.dmg, g.hits, g.krit, g.spieler.size]),
    spieler: [...spieler.entries()].sort((a, b) => b[1].dmg - a[1].dmg).map(([e, x]) => [e, x.name, x.spiele, x.dmg, x.hits, x.krit, x.schuss, x.schussSpiele,
      [...x.w.entries()].sort((a, b) => b[1][0] - a[1][0]).map(([roh, w]) => [nrVon.get(roh), ...w])]),
    teams: [...teams.values()],
    orte,
  };
}
