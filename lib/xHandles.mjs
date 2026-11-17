/*
 * X-Handles aus den eigenen Posts von @CompHub_gg den richtigen Spielern zuordnen (Betreiber, 15.11.2026).
 *
 * Der Betreiber tippt die @-Konten in seinen Posts meist selbst ("🥇 🇮🇹 @fnrax1: 459 pts", "1. 🇮🇹 @Zqngii – 22 elims"). Damit er sie nicht bei
 * jedem Post neu nachschlagen muss, liest dieses Modul seine Posts, findet zu jeder Zeile den Cup und den Spieler und traegt das Konto ins
 * Spielerprofil (spieler-profile.json, Feld "x") - nur, wo noch keins steht. Von dort fuellt lib/ftPosts.ts (ftKonten, wer()) es in jeden Post.
 *
 * Wie ein Handle zum Spieler wird (nur eindeutig, sonst in die Liste "unklar"):
 *   1. Der Cup: Spieltage aus Epics Bestenliste (epic-spieltage/<S>/<w>.json am Release) aus den Tagen vor dem Post. Eine Zeile mit Punkten
 *      ("612 pts") passt auf ein Team mit genau diesen Punkten und genau so vielen Spielern - am besten auf demselben Platz. Der Cup, auf den die
 *      meisten Zeilen passen, gilt (mindestens zwei, und deutlich vor dem naechsten). Ohne Punkte: der juengste Cup vor dem Post, dessen Titel
 *      zur Kopfzeile passt ("FNCS Solos Reload Heat 2 EU" -> S43_FNCSSoloReload_HeatsStage_Heat2_EU) und in dem die Namen der Zeilen stehen.
 *   2. Der Spieler: im Team bzw. im Cup der eine, dessen Name zum Handle oder zum Anzeigenamen des X-Kontos passt (gleich, enthalten, Ziffern
 *      als Buchstaben gefaltet). Im Team mit Punkten genuegt auch der Rest: sind alle anderen zugeordnet, bleibt einer fuer den letzten Handle.
 *      Die Flagge vor dem Handle muss zum gepflegten Land passen, wo eins bekannt ist.
 *   3. Ueber alle Posts: ein Handle muss immer auf denselben Spieler fallen, ein Spieler darf nur einen Handle bekommen - sonst "unklar".
 */

const R = 'https://github.com/comphubgg/CompHub/releases/download';

/* ------------------------------------------------------------------ Namen vergleichbar machen */

const ZWILLINGE = {
  'а': 'a', 'в': 'b', 'е': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j',
  'ѕ': 's', 'ԁ': 'd', 'ɡ': 'g', 'ѵ': 'v', 'ԛ': 'q', 'ղ': 'n', 'п': 'n', 'ı': 'i', 'ł': 'l', 'ø': 'o', 'α': 'a', 'ε': 'e', 'ι': 'i', 'κ': 'k',
  'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x', 'ν': 'v', 'ÿ': 'y', 'ǃ': ' ', 'ß': 'ss',
};
export const norm = (s) => [...String(s ?? '').normalize('NFKC').toLowerCase()].map((z) => ZWILLINGE[z] ?? z).join('')
  .normalize('NFD').replace(/[̀-ͯ]/g, '');
const falte = (s) => s.replace(/[013457]/g, (z) => ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't' })[z]);

/** Woerter eines Epic-Namens (ohne Turniermarke "[EWC2026]" und Startnummer), mindestens drei Zeichen, nicht nur Ziffern. */
export function woerter(name) {
  return norm(name).replace(/\[[^\]]*\]/g, ' ').split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !/^\d+$/.test(w));
}

const ENDUNGEN = ['fortnite', 'fnbr', 'ftn', 'fnr', 'fne', 'fnz', 'fnm', 'fv', 'fn', 'ttv', 'yt', 'main', 'tv', 'gg'];
/** Die Kerne eines Handles: "FoCuSFNBR" -> focusfnbr, focus; "qerz777777" -> qerz; "fadedpigeon_" -> fadedpigeon. */
export function kerne(handle) {
  const h = norm(handle).replace(/[^a-z0-9_]/g, '');
  const raus = new Set([h.replace(/_/g, '')]);
  let k = h.replace(/[_\d]+$/, '').replace(/^_+/, '');
  for (let i = 0; i < 3; i += 1) {
    raus.add(k.replace(/_/g, ''));
    const e = ENDUNGEN.find((x) => k.endsWith(x) && k.length - x.length >= 3);
    if (e) k = k.slice(0, -e.length).replace(/[_\d]+$/, '');
    else break;
  }
  raus.add(k.replace(/_/g, ''));
  if (k.startsWith('fn') && k.length >= 6) raus.add(k.slice(2));
  return [...raus].filter((x) => x.length >= 3);
}

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/**
 * Wie gut passt ein Handle (mit Anzeigename seines X-Kontos) zu den Namen eines Spielers?
 *   3 gleich (auch gefaltet) · 2 enthalten (ab vier Zeichen) · 1 ein Tippfehler daneben (ab fuenf Zeichen) · 0 nichts.
 */
export function passung(handle, anzeige, spielerWoerter) {
  if (!spielerWoerter?.size) return 0;
  const hk = kerne(handle).map(falte);
  const voll = falte(norm(handle).replace(/[^a-z0-9]/g, ''));
  // Der Anzeigename ohne Orgtag davor ("KoS Focus" -> focus), sonst passte "kos" auf jeden Spieler der Org.
  const aw = woerter(anzeige ?? '');
  const an = (aw.length > 1 && aw[0].length <= 5 ? aw.slice(1) : aw).map(falte);
  let best = 0;
  for (const roh of spielerWoerter) {
    const w = falte(roh);
    if (hk.includes(w) || an.includes(w)) return 3;
    if (w.length >= 4 && voll.includes(w)) best = Math.max(best, 2);
    if (hk.some((k) => k.length >= 4 && w.includes(k))) best = Math.max(best, 2);
    if (best < 1 && w.length >= 5 && hk.some((k) => k.length >= 5 && lev(k, w) <= 1)) best = 1;
  }
  return best;
}

/* ------------------------------------------------------------------ Posts zerlegen */

const MEDAILLE = { '🥇': 1, '🥈': 2, '🥉': 3 };
const TASTE = { '1️⃣': 1, '2️⃣': 2, '3️⃣': 3, '4️⃣': 4, '5️⃣': 5, '6️⃣': 6, '7️⃣': 7, '8️⃣': 8, '9️⃣': 9, '🔟': 10 };
const flaggeZuLand = (f) => [...f].map((z) => String.fromCharCode(z.codePointAt(0) - 0x1f1a5)).join('');

/**
 * Eine Zeile mit Erwaehnungen: Platz, Spieler (Flagge + Handle oder Name) und Punkte.
 * "🥇 🇩🇰 @DeckzeeMain + 🇳🇱 @twekje + 🇷🇴 @fadedpigeon_: 410 pts" -> { platz: 1, punkte: 410, teile: [{ land: 'DK', handle: 'DeckzeeMain' }, ...] }
 */
export function zeileLesen(z) {
  let rest = z.trim();
  let platz = null;
  for (const [m, n] of Object.entries(MEDAILLE)) if (rest.startsWith(m)) { platz = n; rest = rest.slice(m.length); }
  for (const [m, n] of Object.entries(TASTE)) if (platz == null && rest.startsWith(m)) { platz = n; rest = rest.slice(m.length); }
  const nr = rest.match(/^\s*(?:#(\d{1,3})|(\d{1,3})[.)])\s/);
  if (platz == null && nr) { platz = Number(nr[1] ?? nr[2]); rest = rest.slice(nr[0].length); }
  const pm = rest.match(/(\d[\d,.]*)\s*pts\b/i);
  const punkte = pm ? Number(pm[1].replace(/[,.]/g, '')) : null;
  // Spieler bis zum ersten Trenner vor den Werten (":" " – " " — " " - " "(").
  const kopf = rest.split(/\s[–—-]\s|:\s|\s\(|\s\d[\d,.]*\s*pts/i)[0];
  const teile = [];
  for (const s of kopf.split(/\s(?:\+|&)\s|\s\+|\+\s/)) {
    const f = s.match(/(\p{Regional_Indicator}{2})/u);
    const h = s.match(/(?<![\w.])@([A-Za-z0-9_]{1,15})/);
    const name = h ? null : s.replace(/\p{Regional_Indicator}/gu, '').replace(/[^\p{L}\p{N}_ .]/gu, '').trim();
    if (h || name) teile.push({ land: f ? flaggeZuLand(f[1]) : null, handle: h ? h[1] : null, name: name || null });
  }
  return { platz, punkte, teile: teile.filter((t) => t.handle || t.name), roh: z };
}

/** Alle Zeilen eines Posts mit mindestens einem @-Handle (ohne das eigene Konto). */
export function zeilenMitHandles(text) {
  return String(text ?? '').split('\n').filter((z) => /(?<![\w.])@[A-Za-z0-9_]/.test(z))
    .map(zeileLesen).filter((z) => z.teile.some((t) => t.handle && t.handle.toLowerCase() !== 'comphub_gg'));
}

/* ------------------------------------------------------------------ Cup finden */

const SCHLAG = ['fncs', 'solo', 'duo', 'trio', 'squad', 'reload', 'heat', 'qualifier', 'qual', 'performance', 'evaluation', 'cash', 'victory',
  'final', 'lcq', 'chance', 'division', 'practice', 'ranked', 'arena', 'mobile', 'zero', 'globals', 'global', 'champion', 'elite'];
function titelWoerter(s) {
  const t = norm(s).replace(/solos/g, 'solo').replace(/duos/g, 'duo').replace(/trios/g, 'trio').replace(/squads/g, 'squad').replace(/qualifiers?/g, 'qualifier')
    .replace(/finals|finale/g, 'final').replace(/heats/g, 'heat').replace(/last chance/g, 'lcq').replace(/div(?:ision)?\s*(\d)/g, 'division$1');
  const raus = new Set();
  for (const w of t.split(/[^a-z0-9]+/)) for (const s of SCHLAG) if (w.startsWith(s)) raus.add(s);
  for (const m of t.matchAll(/\b(heat|round|day|event|game|qual)\s*(\d)/g)) raus.add(`${m[1]}${m[2]}`);
  return raus;
}
function fensterWoerter(w, f) {
  const s = `${f.t ?? ''} ${w.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2')}`;
  return titelWoerter(s);
}

/** Der Cup eines Posts ueber die Punkte seiner Zeilen. */
function cupUeberPunkte(zeilen, fenster, zeit) {
  const mitPunkten = zeilen.filter((z) => z.punkte != null && z.teile.length);
  if (!mitPunkten.length) return null;
  const wertung = [];
  for (const [w, f] of Object.entries(fenster)) {
    if (!f.datum || f.datum > zeit + 6 * 3600e3 || f.datum < zeit - 4 * 86400e3) continue;
    let n = 0;
    for (const z of mitPunkten) if (f.teams.some((t) => t[1] === z.punkte && t[3].length === z.teile.length && (z.platz == null || t[0] === z.platz))) n += 1;
    if (n) wertung.push({ w, n });
  }
  wertung.sort((a, b) => b.n - a.n);
  const [a, b] = wertung;
  if (!a) return null;
  const noetig = mitPunkten.length === 1 ? 1 : 2;
  if (a.n >= noetig && (!b || a.n > b.n) && a.n >= mitPunkten.length / 2) return a.w;
  return null;
}

/** Der Cup ueber die Kopfzeile: der juengste vor dem Post, dessen Titel am besten passt. */
function cupUeberTitel(text, fenster, zeit) {
  const kopf = titelWoerter(String(text).split('\n').slice(0, 3).join(' '));
  if (kopf.size < 2) return [];
  const kandidaten = [];
  for (const [w, f] of Object.entries(fenster)) {
    if (!f.datum || f.datum > zeit || f.datum < zeit - 3 * 86400e3) continue;
    const fw = fensterWoerter(w, f);
    const gleich = [...kopf].filter((x) => fw.has(x)).length;
    // Jede Nummer in der Kopfzeile (heat2, round3 ...) muss auch im Cup stehen.
    if ([...kopf].some((x) => /\d$/.test(x) && !fw.has(x))) continue;
    if (gleich >= Math.min(3, kopf.size)) kandidaten.push({ w, gleich, datum: f.datum });
  }
  kandidaten.sort((a, b) => b.gleich - a.gleich || b.datum - a.datum);
  return kandidaten.slice(0, 3).map((k) => k.w);
}

/* ------------------------------------------------------------------ Zuordnen */

/**
 * @param tweets  [{ id, zeit, text }]  (zeit: Date-lesbar)
 * @param d       { fenster, namen: id -> Set(woerter), land: id -> 'DE', konten: handle -> { name } }
 * @returns { treffer: [{ handle, id, tweet, cup, grund }], unklar: [{ handle, tweet, grund, kandidaten }] }
 */
export function zuordnen(tweets, d) {
  const treffer = [];
  const unklar = [];
  const anz = (h) => d.konten?.[h]?.name ?? d.konten?.[h.toLowerCase()]?.name ?? '';
  const flaggeOk = (land, id) => !land || !d.land[id] || d.land[id].toUpperCase() === land;
  for (const tw of tweets) {
    const zeit = new Date(tw.zeit).getTime();
    const zeilen = zeilenMitHandles(tw.text);
    if (!zeilen.length) continue;
    const cupP = cupUeberPunkte(zeilen, d.fenster, zeit);
    const cupsT = cupP ? [cupP] : cupUeberTitel(tw.text, d.fenster, zeit);
    const mit = (z, t, grund, kandidaten = []) => unklar.push({ handle: t.handle, land: t.land, tweet: tw.id, zeile: z.roh.trim(), grund, kandidaten });
    if (!cupsT.length) {
      // Ohne Cup nur ein gepflegter Schluessel (spieler-namen.json, "shxrk", "peterbot"), der genau einem Konto gehoert.
      for (const z of zeilen) for (const t of z.teile) {
        if (!t.handle) continue;
        // Zusaetzlich muss die Flagge der Zeile zum gepflegten Land passen (beides bekannt) - sonst waere "Curve" (NA) nicht von "Curve" (EU) zu trennen.
        const ids = [...new Set(kerne(t.handle).map(falte).filter((k) => k.length >= 4).flatMap((k) => d.schluessel?.[k] ?? []))].filter((id) => t.land && d.land[id]?.toUpperCase() === t.land);
        if (ids.length === 1) treffer.push({ handle: t.handle, id: ids[0], tweet: tw.id, cup: null, grund: 'gepflegter Schluessel, ohne Cup' });
        else mit(z, t, ids.length > 1 ? 'kein Cup, Schluessel passt auf mehrere Konten' : 'kein Cup zum Post gefunden (und kein gepflegter Schluessel mit passender Flagge)', ids);
      }
      continue;
    }
    // Wer in den Cups spielte.
    const imCup = new Map();
    for (const w of cupsT) for (const t of d.fenster[w].teams) for (const id of t[3]) if (!imCup.has(id)) imCup.set(id, w);
    for (const z of zeilen) {
      const handles = z.teile.filter((t) => t.handle);
      // 1. Team ueber die Punkte (nur im Cup aus den Punkten).
      let team = null;
      if (cupP && z.punkte != null) {
        const passend = d.fenster[cupP].teams.filter((t) => t[1] === z.punkte && t[3].length === z.teile.length);
        const amPlatz = passend.filter((t) => z.platz == null || t[0] === z.platz);
        team = passend.length === 1 ? passend[0] : amPlatz.length === 1 ? amPlatz[0] : null;
        // Mehrere Teams mit diesen Punkten: das eine nehmen, in dem die Namen stehen.
        if (!team && passend.length > 1) {
          const mitNamen = passend.filter((t) => handles.some((h) => t[3].some((id) => passung(h.handle, anz(h.handle), d.namen[id]) >= 2)));
          if (mitNamen.length === 1) team = mitNamen[0];
        }
      }
      if (team) {
        const ids = [...team[3]];
        const frei = new Set(ids);
        const offen = [...z.teile];
        // Namen und Flaggen zuerst, dann der Rest.
        for (let runde = 0; runde < 3 && offen.length; runde += 1) {
          for (const t of [...offen]) {
            const k = [...frei].filter((id) => flaggeOk(t.land, id));
            let wahl = null; let grund = '';
            const wert = k.map((id) => [id, t.handle ? passung(t.handle, anz(t.handle), d.namen[id]) : (d.namen[id] && [...d.namen[id]].some((w) => woerter(t.name ?? '').includes(w)) ? 3 : 0)]);
            const top = Math.max(0, ...wert.map((x) => x[1]));
            const beste = wert.filter((x) => x[1] === top);
            if (top >= 1 && beste.length === 1) { wahl = beste[0][0]; grund = `Name (${top})`; }
            else if (k.length === 1 && (runde > 0 || ids.length === 1)) { wahl = k[0]; grund = ids.length === 1 ? 'Punkte' : 'Rest im Team'; }
            else if (t.land && k.length > 1 && runde > 0) {
              const gleichesLand = k.filter((id) => d.land[id]?.toUpperCase() === t.land);
              if (gleichesLand.length === 1 && z.teile.filter((x) => x.land === t.land).length === 1) { wahl = gleichesLand[0]; grund = 'Flagge im Team'; }
            }
            if (!wahl) continue;
            frei.delete(wahl);
            offen.splice(offen.indexOf(t), 1);
            if (t.handle) treffer.push({ handle: t.handle, id: wahl, tweet: tw.id, cup: cupP, grund: `${z.punkte} pts, Platz ${team[0]}: ${grund}` });
          }
        }
        for (const t of offen) if (t.handle) mit(z, t, `Team mit ${z.punkte} pts gefunden, Spieler darin nicht eindeutig`, [...frei]);
        continue;
      }
      // 2. Ohne Team: der eine Spieler im Cup, dessen Name passt.
      for (const t of handles) {
        const wert = [];
        for (const id of imCup.keys()) {
          const p = passung(t.handle, anz(t.handle), d.namen[id]);
          if (p >= 2 && flaggeOk(t.land, id)) wert.push([id, p]);
        }
        // Kein Name passt: im Solo-Cup der eine Spieler mit genau diesen Elims (Epic) und einem aehnlichen Namen (Tippfehler, Ziffern).
        const em = z.roh.match(/(\d+)\s*elims?\b/i);
        if (!wert.length && em) {
          const n = Number(em[1]);
          const hk = kerne(t.handle).map(falte);
          const nah = [];
          for (const w of cupsT) for (const team of d.fenster[w].teams) {
            if (team[3].length !== 1 || team[2] !== n || !flaggeOk(t.land, team[3][0])) continue;
            if ([...(d.namen[team[3][0]] ?? [])].some((x) => x.length >= 4 && hk.some((k) => lev(k, falte(x)) <= 2))) nah.push(team[3][0]);
          }
          if (nah.length === 1) { treffer.push({ handle: t.handle, id: nah[0], tweet: tw.id, cup: imCup.get(nah[0]), grund: `${n} elims bei Epic + aehnlicher Name` }); continue; }
        }
        const top = Math.max(0, ...wert.map((x) => x[1]));
        const beste = wert.filter((x) => x[1] === top);
        const zweite = wert.filter((x) => x[1] >= 2).length;
        if (beste.length === 1 && (top === 3 ? beste.length === 1 : zweite === 1)) {
          treffer.push({ handle: t.handle, id: beste[0][0], tweet: tw.id, cup: imCup.get(beste[0][0]), grund: `Name im Cup (${top})` });
        } else mit(z, t, beste.length > 1 ? 'mehrere Spieler im Cup passen' : 'kein Spieler im Cup passt zum Namen', beste.map((x) => x[0]));
      }
    }
  }
  return { treffer, unklar };
}

/**
 * Ueber alle Posts zusammenfassen: ein Handle -> ein Spieler, ein Spieler -> ein Handle.
 * Bei zwei Handles fuer einen Spieler gewinnt der, dessen X-Anzeigename zum Spieler passt (und nur dann).
 */
export function zusammenfassen(erg, d) {
  const proHandle = new Map();
  for (const t of erg.treffer) {
    const k = t.handle.toLowerCase();
    if (!proHandle.has(k)) proHandle.set(k, { handle: t.handle, ids: new Map() });
    const e = proHandle.get(k);
    e.ids.set(t.id, [...(e.ids.get(t.id) ?? []), t]);
  }
  const fest = new Map(); // handle -> { id, belege }
  const unklar = [];
  // Beweiskraft eines Belegs: Punkte + Name 3, Name gleich 2, sonst 1 (enthalten, Rest im Team, nur Punkte, Schluessel ohne Cup).
  const kraft = (b) => (/pts/.test(b.grund) && /Name \(3\)/.test(b.grund) ? 3 : /\(3\)/.test(b.grund) || /pts.*Name/.test(b.grund) ? 2 : 1);
  for (const [k, e] of proHandle) {
    const stufen = [...e.ids].map(([id, belege]) => [id, belege, Math.max(...belege.map(kraft))]);
    const top = Math.max(...stufen.map((x) => x[2]));
    const oben = stufen.filter((x) => x[2] === top);
    if (oben.length === 1) {
      const [id, belege] = oben[0];
      fest.set(k, { handle: d.konten?.[e.handle]?.sn ?? e.handle, id, belege, verworfen: stufen.filter((x) => x[0] !== id).map((x) => x[0]) });
    } else unklar.push({ handle: e.handle, grund: 'faellt in verschiedenen Posts auf verschiedene Spieler', kandidaten: [...e.ids.keys()] });
  }
  // Nur schwach belegt (Rest im Team, nur Punkte) und das X-Konto heisst ganz anders, waehrend ein anderes erwaehntes Konto genau wie der Spieler
  // heisst (@skyszn "skys d" gegen @SkySZN_ "AG Sky"): lieber nachfragen.
  for (const [k, f] of [...fest]) {
    if (Math.max(...f.belege.map(kraft)) > 1 || f.belege.some((b) => /Name/.test(b.grund))) continue;
    const eigen = d.konten?.[f.handle]?.name ?? d.konten?.[k]?.name;
    if (!eigen || passung(f.handle, eigen, d.namen[f.id]) > 0) continue;
    const andere = Object.entries(d.konten ?? {}).filter(([h, v]) => h.toLowerCase() !== k && v?.name && passung('', v.name, d.namen[f.id]) >= 3).map(([h]) => h);
    if (andere.length) { unklar.push({ handle: f.handle, grund: `X-Konto heisst "${eigen}", passt nicht - @${andere[0]} heisst wie der Spieler`, kandidaten: [f.id] }); fest.delete(k); }
  }
  const proSpieler = new Map();
  for (const [k, f] of fest) proSpieler.set(f.id, [...(proSpieler.get(f.id) ?? []), k]);
  for (const [id, hs] of proSpieler) {
    if (hs.length < 2) continue;
    const gut = hs.filter((k) => passung('', d.konten?.[fest.get(k).handle]?.name ?? d.konten?.[k]?.name ?? '', d.namen[id]) >= 2);
    for (const k of hs) if (!(gut.length === 1 && gut[0] === k)) { unklar.push({ handle: fest.get(k).handle, grund: `ein Spieler, mehrere Handles (${hs.join(', ')})`, kandidaten: [id] }); }
    for (const k of hs) if (!(gut.length === 1 && gut[0] === k)) fest.delete(k);
  }
  return { fest: [...fest.values()], unklar };
}

/* ------------------------------------------------------------------ Daten holen */

async function json(url) {
  for (let v = 0; v < 3; v += 1) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(60_000) }); if (r.ok) return await r.json(); if (r.status === 404) return null; } catch { /* noch einmal */ }
    await new Promise((x) => setTimeout(x, 1500 * (v + 1)));
  }
  return null;
}

/** Die Spieltage (nur, was der Abgleich braucht) aus den Saison-Releases, deren Stand nach `seit` liegt. */
export async function ladeFenster(seit, { saisons = ['s43', 's42'], regionen = null } = {}) {
  const liste = [];
  for (const s of saisons) {
    const m = await json(`${R}/daten-spieltage-${s}/manifest.json`);
    for (const [k, v] of Object.entries(m ?? {})) {
      if (seit && new Date(v.zeit).getTime() < seit) continue;
      if (regionen && !regionen.some((r) => k.endsWith(`_${r}.json`))) continue;
      liste.push(`${R}/daten-spieltage-${s}/${k}`);
    }
  }
  const fenster = {};
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (liste.length) {
      const d = await json(liste.shift());
      if (!d?.windowId) continue;
      fenster[d.windowId] = { t: d.titel, datum: d.datum, teams: (d.teams ?? []).sort((a, b) => a.platz - b.platz).slice(0, 400).map((t) => [t.platz, t.punkte, t.teamElims, t.spieler]) };
    }
  }));
  return fenster;
}

/** Namen und Laender je Konto: spieler-namen, epic-namen, Profile. */
export async function ladeNamen(profile) {
  const [pro, epic] = await Promise.all([json(`${R}/daten/spieler-namen.json`), json(`${R}/daten/epic-namen.json`)]);
  const namen = {};
  const land = {};
  const dazu = (id, n) => { if (!id || !n) return; const k = String(id).toLowerCase(); (namen[k] ??= new Set()); for (const w of woerter(n)) namen[k].add(w); };
  for (const [id, p] of Object.entries(pro ?? {})) { for (const n of p.namen ?? []) dazu(id, n); dazu(id, p.haupt); if (p.schluessel) dazu(id, p.schluessel); }
  for (const [id, n] of Object.entries(epic ?? {})) dazu(id, n);
  for (const [k, p] of Object.entries(profile ?? {})) {
    const id = String(p.id || k).toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(id)) continue;
    dazu(id, p.name); for (const n of p.namen ?? []) dazu(id, n); dazu(id, p.anzeige);
    if (p.land) land[id] = p.land;
  }
  const schluessel = {};
  for (const [id, p] of Object.entries(pro ?? {})) if (p.schluessel && p.schluessel.length >= 3) (schluessel[falte(norm(p.schluessel).replace(/[^a-z0-9]/g, ''))] ??= []).push(id.toLowerCase());
  return { namen, land, schluessel, epic: epic ?? {}, pro: pro ?? {} };
}

/* ------------------------------------------------------------------ Ins Profil schreiben */

const datenRepo = (u) => (u.DATEN_REPO || 'comphubgg/comphub-daten').trim();
const datenPfad = (u) => [String(u.DATEN_PRAEFIX || '').trim().replace(/^\/+|\/+$/g, ''), 'spieler-profile.json'].filter(Boolean).join('/');

async function gh(u, weg, methode = 'GET', koerper) {
  const token = (u.DATEN_TOKEN || u.GITHUB_TOKEN || u.GH_TOKEN || '').trim();
  return fetch(`https://api.github.com${weg}`, {
    method: methode,
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'CompHub', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(koerper ? { 'Content-Type': 'application/json' } : {}) },
    ...(koerper ? { body: JSON.stringify(koerper) } : {}),
  });
}

/** spieler-profile.json aus dem Archiv, mit dem Stand (sha) fuers Zurueckschreiben. */
export async function liesProfile(u) {
  const r = await gh(u, `/repos/${datenRepo(u)}/contents/${datenPfad(u)}`);
  if (!r.ok) throw new Error(`spieler-profile.json lesen: ${r.status}`);
  const j = await r.json();
  // Unter einem Megabyte liefert GitHub den Inhalt gleich mit; darueber ueber den Blob.
  let text = j.content ? Buffer.from(j.content, 'base64').toString('utf8') : '';
  if (!text) {
    const b = await gh(u, `/repos/${datenRepo(u)}/git/blobs/${j.sha}`);
    text = Buffer.from((await b.json()).content ?? '', 'base64').toString('utf8');
  }
  return { profile: JSON.parse(text), sha: j.sha };
}

/** Wer hat welches Konto schon (klein geschrieben) - auch Alteintraege unter dem Namen. */
export function vergebeneHandles(profile) {
  const m = new Map();
  for (const [k, p] of Object.entries(profile)) if (p?.x) m.set(String(p.x).replace(/^@/, '').toLowerCase(), String(p.id || k).toLowerCase());
  return m;
}

/**
 * Nur leere Felder fuellen: ein Spieler, der schon ein X-Konto hat, behaelt es; ein Konto, das schon ein anderer Spieler hat, wird nicht doppelt
 * vergeben. Geschrieben wird nur gegen den gelesenen Stand (sha) - hat sich die Datei dazwischen bewegt, wird neu gelesen und neu gerechnet.
 * @returns { geschrieben: [{ id, handle, name }], uebersprungen: [{ id, handle, grund }] }
 */
export async function eintragen(u, fest, d, { anwenden = false, quelle = 'X-Posts' } = {}) {
  for (let versuch = 0; versuch < 4; versuch += 1) {
    const { profile, sha } = await liesProfile(u);
    const vergeben = vergebeneHandles(profile);
    const geschrieben = []; const uebersprungen = [];
    const neu = structuredClone(profile);
    for (const f of fest) {
      const handle = f.handle.replace(/^@/, '');
      const h = handle.toLowerCase();
      const eintrag = Object.entries(neu).find(([k, p]) => String(p?.id || k).toLowerCase() === f.id);
      const hatSchon = eintrag?.[1]?.x;
      if (hatSchon) { uebersprungen.push({ id: f.id, handle, grund: hatSchon.toLowerCase() === h ? 'steht schon so da' : `hat schon @${hatSchon}` }); continue; }
      // Gehoert das Konto schon einem anderen Spieler (mit Konto-Id), bleibt es dort. Ein Alteintrag nur unter dem Namen ("lewa") zaehlt nicht:
      // lib/ftPosts.ts liest nur Eintraege mit Konto-Id, und derselbe Handle meint dieselbe Person.
      const halter = vergeben.get(h);
      if (halter && halter !== f.id && /^[0-9a-f]{32}$/.test(halter)) { uebersprungen.push({ id: f.id, handle, grund: `@${handle} gehoert schon ${halter}` }); continue; }
      const name = d.pro[f.id]?.haupt || d.epic[f.id] || handle;
      if (eintrag) eintrag[1].x = handle;
      else neu[f.id] = { id: f.id, name, namen: [name], x: handle };
      vergeben.set(h, f.id);
      geschrieben.push({ id: f.id, handle, name: eintrag?.[1]?.anzeige || eintrag?.[1]?.name || name });
    }
    if (!anwenden || !geschrieben.length) return { geschrieben, uebersprungen, angewendet: false };
    const r = await gh(u, `/repos/${datenRepo(u)}/contents/${datenPfad(u)}`, 'PUT', {
      message: `X-Konten aus ${quelle}: ${geschrieben.length} (${geschrieben.slice(0, 6).map((g) => `@${g.handle}`).join(', ')}${geschrieben.length > 6 ? ' ...' : ''})`.slice(0, 200),
      content: Buffer.from(JSON.stringify(neu, null, 2), 'utf8').toString('base64'), sha,
    });
    if (r.ok) return { geschrieben, uebersprungen, angewendet: true };
    if (r.status !== 409 && r.status !== 422) throw new Error(`spieler-profile.json schreiben: ${r.status} ${(await r.text()).slice(0, 200)}`);
    await new Promise((x) => setTimeout(x, 2000 * (versuch + 1)));
  }
  throw new Error('spieler-profile.json: viermal Konflikt beim Schreiben');
}

/* ------------------------------------------------------------------ Alles in einem Zug (fuer scripts/x-handles.mjs und scripts/discord-tweets.mjs) */

/** Die X-Konten hinter Handles (Anzeigename) ueber FixTweet. */
export async function xKonten(handles) {
  const konten = {};
  for (const n of [...new Set(handles)]) {
    for (let v = 0; v < 3 && !konten[n]; v += 1) {
      try {
        const r = await fetch(`https://api.fxtwitter.com/${encodeURIComponent(n)}`, { headers: { 'User-Agent': 'CompHub/1.0' }, signal: AbortSignal.timeout(20_000) });
        if (r.status === 404) { konten[n] = { fehlt: true }; break; }
        if (r.ok) { const u = (await r.json())?.user; if (u) konten[n] = { id: u.id, name: u.name, sn: u.screen_name, bio: u.description, ort: u.location }; }
      } catch { /* noch einmal */ }
      if (!konten[n]) await new Promise((x) => setTimeout(x, 1000 * (v + 1)));
    }
    await new Promise((x) => setTimeout(x, 250));
  }
  return konten;
}

/** Die Handles, die FixTweet in einem Beitrag als Erwaehnung kennt (raw_text.facets), ohne das eigene Konto. */
export const erwaehnt = (tw) => (tw?.raw_text?.facets ?? tw?.raw?.facets ?? []).filter((f) => f.type === 'mention').map((f) => f.original).filter((h) => h.toLowerCase() !== 'comphub_gg');

/**
 * Beitraege (FixTweet-Objekte oder { id, zeit, text, raw }) ernten: Konten holen, Cups laden, zuordnen, nur leere Felder fuellen.
 *   u:        Umgebung (DATEN_TOKEN oder GITHUB_TOKEN, DATEN_REPO, DATEN_PRAEFIX)
 *   fenster:  schon geladene Spieltage (sonst die der Tage vor dem aeltesten Beitrag)
 *   konten:   schon geholte X-Konten
 */
export async function ernte(u, beitraege, { anwenden = false, fenster = null, konten = null, log = () => {} } = {}) {
  const tweets = beitraege.filter((t) => t && (t.text ?? '').includes('@') && (t.author?.screen_name ?? t.autor ?? 'CompHub_gg') === 'CompHub_gg')
    .map((t) => ({ id: String(t.id), zeit: t.created_at ?? t.zeit ?? (t.created_timestamp ? t.created_timestamp * 1000 : Date.now()), text: t.text, raw: t.raw_text ?? t.raw }));
  if (!tweets.length) return { tweets: 0, fest: [], unklar: [], geschrieben: [], uebersprungen: [] };
  const handles = tweets.flatMap(erwaehnt);
  const k = konten ?? await xKonten(handles);
  const kk = {}; for (const [h, v] of Object.entries(k)) { kk[h] = v; kk[h.toLowerCase()] = v; }
  const aeltester = Math.min(...tweets.map((t) => new Date(t.zeit).getTime()));
  // Nur die Regionen, die in den Beitraegen stehen (ohne Angabe EU) - der Server laedt so ein paar Dutzend statt Hunderter Spieltage.
  const reg = new Set(['EU']);
  for (const t of tweets) for (const m of String(t.text).matchAll(/\b(EU|NAC|NAW|NA|BR|ASIA|OCE|ME)\b/g)) for (const r of m[1] === 'NA' ? ['NAC', 'NAW'] : [m[1]]) reg.add(r);
  const f = fenster ?? await ladeFenster(aeltester - 5 * 86400e3, { regionen: [...reg] });
  const { profile } = await liesProfile(u);
  const n = await ladeNamen(profile);
  const d = { fenster: f, ...n, konten: kk };
  const erg = zuordnen(tweets, d);
  const z = zusammenfassen(erg, d);
  log(`  ${tweets.length} Beitrag/Beitraege, ${handles.length} Erwaehnungen, ${Object.keys(f).length} Cups - zugeordnet: ${z.fest.length}, unklar: ${erg.unklar.length + z.unklar.length}`);
  const e = await eintragen(u, z.fest, d, { anwenden, quelle: tweets.length === 1 ? `X-Post ${tweets[0].id}` : `${tweets.length} X-Posts` });
  for (const g of e.geschrieben) log(`  ${e.angewendet ? '+' : '·'} ${g.name} -> @${g.handle}`);
  return { tweets: tweets.length, fest: z.fest, unklar: [...erg.unklar, ...z.unklar], ...e, d };
}
