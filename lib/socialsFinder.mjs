/*
 * X- und Twitch-Konten (und wo belegbar die Flagge) fuer die wichtigen Spieler finden (Betreiber, 16.11.2026: "jeder wichtige Spieler muss eine Flagge und
 * ein X-Konto haben"). Hier steht nur die Logik ohne Netz - Kandidaten, Belege, Entscheidung; das Abrufen macht scripts/socials-finden.mjs.
 *
 * Kandidaten: aus dem bereinigten Namen (Turniermarke "[EWC2026]", Orgtag "XSET", Startnummer "7!" und angehaengtes "1x"/"2x" fallen weg) und den
 * anderen Namen des Kontos die Muster, die Profis tragen (Betreiber): name, name1..name10, name_, nameFN/FNBR/FNR, nameFortnite, TTV - dazu, was ein
 * gefundenes Konto selbst verlinkt (Twitch -> X und X -> Twitch).
 *
 * Belege (art):
 *   stark    link      Bio/Website des X-Kontos verlinkt den Twitch-Kanal oder der Kanal (Socials, Panels, Beschreibung) das X-Konto
 *            daten     das Paar steht schon in unseren Daten (streamers.json, Org-Kader) oder unser gespeicherter Twitch-Kanal verlinkt es
 *            platz     ein Post nennt einen Platz, den das Konto laut unseren Bestenlisten an diesem Tag hatte
 *            partner   ein Post erwaehnt das X-Konto eines Mitspielers, mit dem das Konto in diesen Tagen gespielt hat
 *   mittel   fn        Bio/Name/Kanal nennt Fortnite, FNCS, Comp, Cash Cup ... oder die Org des Spielers aus dem Kader
 *   schwach  name      der Anzeigename des Kontos ist der Name des Spielers (der Handle selbst zaehlt nicht - er ist ja aus dem Namen gebaut)
 *            folger    Folgerzahl passt zur Stufe des Spielers
 * Automatisch gespeichert wird nur mit mindestens einem starken Beleg UND einem zweiten unabhaengigen (stark, fn oder name) und ohne Widerspruch
 * (Konto gehoert schon einem anderen Spieler, zwei gleich gute Kandidaten). Alles andere ist ein Vorschlag. Die Schwelle ist im Probelauf gemessen
 * (scripts/socials-finden.mjs --probe): Ergebnis im Kopf von scripts/socials-finden.mjs.
 */

export const X_MUSTER = ['', 'fn', '_', 'fnbr', 'fnr', '1', 'fn_', 'ttv', 'fortnite', '2', '_fn', '^fn', '3', '^ftn', '4', '5', '6', '7', '8', '9', '10', '__', 'x', 'fnx'];
export const X_MUSTER_KURZ = ['', 'fn', '_', 'fnbr', 'fnr', '1', 'fn_', 'ttv'];
export const TWITCH_MUSTER = ['', 'fn', '_', 'fnbr', 'fnr', 'ttv', 'fortnite', 'tv', '1', '2', '3', '_fn', 'fn_', 'x', 'live', 'yt'];

const ZWILLINGE = {
  'а': 'a', 'в': 'b', 'е': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j',
  'ѕ': 's', 'ԁ': 'd', 'ɡ': 'g', 'ѵ': 'v', 'ԛ': 'q', 'п': 'n', 'ı': 'i', 'ł': 'l', 'ø': 'o', 'α': 'a', 'ε': 'e', 'ι': 'i', 'κ': 'k',
  'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x', 'ν': 'v', 'ÿ': 'y', 'ǃ': '!', 'ß': 'ss',
};
export const norm = (s) => [...String(s ?? '').normalize('NFKC').toLowerCase()].map((z) => ZWILLINGE[z] ?? z).join('')
  .normalize('NFD').replace(/[̀-ͯ]/g, '');
const falte = (s) => s.replace(/[013457]/g, (z) => ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't' })[z]);

/**
 * Die Grundformen eines Namens, aus denen Handles werden: "[EWC2026] NTX shadow1x" -> shadow1x, shadow; "Peter Bot 7!" -> peterbot, peter_bot.
 * kernname: lib/homoglyph kernname (Turniermarke, Orgtag, Startnummer).
 */
export function grundformen(name, kernname) {
  const k = norm(kernname(String(name ?? ''))).replace(/[!ǃ.]+$/g, '').trim();
  const woerter = k.split(/[^a-z0-9_]+/).filter(Boolean)
    // Angehaengtes "1x", "2x", "7!" als eigenes Wort
    .filter((w, i, a) => !(i === a.length - 1 && a.length > 1 && /^\d{1,2}x?$/.test(w)));
  if (!woerter.length) return [];
  const raus = [];
  const dazu = (s) => { const t = s.replace(/^_+|_+$/g, ''); if (t.length >= 3 && !/^\d+$/.test(t) && !raus.includes(t)) raus.push(t); };
  dazu(woerter.join(''));
  if (woerter.length > 1) dazu(woerter.join('_'));
  for (const g of [...raus]) {
    dazu(g.replace(/\d{1,2}x$/, ''));            // shadow1x -> shadow
    dazu(g.replace(/(fn|fnbr|fnr|ttv|yt|tv)$/, '')); // jemand heisst in Fortnite schon "xyzFN"
    dazu(g.replace(/\d+$/, ''));                 // vico24 -> vico (der Handle kommt dann wieder mit Ziffern)
  }
  if (woerter.length > 1) for (const w of woerter) if (w.length >= 4) dazu(w);
  return raus;
}

const gueltigX = (h) => /^[a-z0-9_]{4,15}$/.test(h) && !/^\d+$/.test(h);
const gueltigTwitch = (h) => /^[a-z0-9][a-z0-9_]{3,24}$/.test(h);

/** X-Kandidaten aus mehreren Grundformen, wahrscheinlichste zuerst; die erste Grundform mit allen Mustern, die weiteren mit den haeufigsten. */
export function xKandidaten(formen, hoechstens = 40) {
  const raus = [];
  formen.forEach((f, i) => {
    for (const m of i === 0 ? X_MUSTER : X_MUSTER_KURZ) {
      // '^fn' = davor ("FnMoneymaker", "FtnKurama")
      const h = m === 'ttv' ? [`${f}ttv`, `ttv${f}`] : m === '__' ? [`_${f}`] : m.startsWith('^') ? [`${m.slice(1)}${f}`] : [`${f}${m}`];
      for (const x of h) if (gueltigX(x) && !raus.includes(x)) raus.push(x);
    }
  });
  return raus.slice(0, hoechstens);
}

export function twitchKandidaten(formen, hoechstens = 40) {
  const raus = [];
  formen.forEach((f, i) => {
    for (const m of i === 0 ? TWITCH_MUSTER : TWITCH_MUSTER.slice(0, 7)) {
      const h = m === 'ttv' ? [`${f}ttv`, `ttv${f}`] : [`${f}${m}`];
      for (const x of h) if (gueltigTwitch(x) && !raus.includes(x)) raus.push(x);
    }
  });
  return raus.slice(0, hoechstens);
}

/* ------------------------------------------------------------------ Links lesen */

const X_LINK = /(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})(?![A-Za-z0-9_])/gi;
const TWITCH_LINK = /(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/([A-Za-z0-9_]{3,25})(?![A-Za-z0-9_])/gi;
const KEIN_KONTO = /^(home|i|intent|search|explore|share|hashtag|settings|messages|notifications|videos|directory|p|login|signup|downloads)$/i;
export const xLinks = (text) => [...String(text ?? '').matchAll(X_LINK)].map((m) => m[1].toLowerCase()).filter((h) => !KEIN_KONTO.test(h));
export const twitchLinks = (text) => [...String(text ?? '').matchAll(TWITCH_LINK)].map((m) => m[1].toLowerCase()).filter((h) => !KEIN_KONTO.test(h));
/** "@name" in einer Bio (Org, Partner) - ohne E-Mail-Adressen. */
export const erwaehnungen = (text) => [...String(text ?? '').matchAll(/(?<![\w.])@([A-Za-z0-9_]{2,15})/g)].map((m) => m[1].toLowerCase());

/* ------------------------------------------------------------------ Belege */

const FN = /fortnite|\bfncs\b|\bfn\b|\bfnbr\b|\bcomp(etitive)?\b|pro ?player|cash ?cups?|\bearnings?\b|\bpr\b ?\d|power ?rank|\bglobals?\b|zero ?build|\bzb\b|\beval\b|\blan\b|\bdivisional|\bnac\b|\bnaw\b|\beu\b.*(player|pro)|\bpro\b.*\b(for|@)|#fncs|\bduos?\b|\btrios?\b|\bsolos?\b|\bqualif/i;

/** Der Anzeigename passt zum Spieler - gleich oder (ab fuenf Zeichen) enthalten, ohne den Orgtag davor. */
export function namePasst(anzeige, spielerWoerter) {
  const a = falte(norm(anzeige).replace(/[^a-z0-9 ]/g, ' ')).split(/\s+/).filter((w) => w.length >= 3);
  const voll = a.join('');
  for (const roh of spielerWoerter) {
    const w = falte(roh);
    if (w.length < 3) continue;
    if (a.includes(w) || voll === w) return true;
    if (w.length >= 5 && voll.includes(w)) return true;
    if (a.some((x) => x.length >= 5 && w === x.replace(/(fn|fnbr|fnr|ttv)$/, ''))) return true;
  }
  return false;
}

/** Woerter eines Spielers (fuer namePasst): alle Grundformen ohne Unterstrich. */
export const spielerWoerter = (formen) => [...new Set(formen.map((f) => f.replace(/_/g, '')).filter((f) => f.length >= 3))];

/** Wie viele Folger ein Konto dieser Stufe mindestens haben duerfte (grob; nur ein schwacher Beleg). */
export function folgerGrenze(p) {
  if ((p.pr != null && p.pr <= 200) || p.final >= 5) return 1000;
  if (p.final >= 1 || (p.pr != null && p.pr <= 1000)) return 200;
  return 50;
}

/**
 * Die Belege fuer ein X-Konto.
 *   x:       { sn, name, bio, ort, web, folger, posts, geschuetzt }
 *   tw:      die gefundenen Twitch-Kanaele (login -> { links: [x-handles], name, fn, ... })
 *   p:       { id, formen, woerter, orgs: [{ name, x }], final, pr, gespeichertTwitch }
 *   daten:   Paare aus unseren Daten: Set "twitch|x" und Map x -> [quelle]
 *   postBelege: Ergebnis von postsPruefen (optional)
 */
export function xBelege(x, tw, p, { daten, postBelege = [] } = {}) {
  const b = [];
  const h = x.sn.toLowerCase();
  const url = `https://x.com/${x.sn}`;
  const text = `${x.bio ?? ''} ${x.web ?? ''}`;
  for (const t of twitchLinks(text)) {
    const k = tw[t];
    if (k && (k.namePasst || t === p.gespeichertTwitch)) b.push({ art: 'link', stark: true, anker: t === p.gespeichertTwitch, text: `X-Bio verlinkt twitch.tv/${t}${t === p.gespeichertTwitch ? ' (unser gespeicherter Kanal)' : ''}`, url: `https://twitch.tv/${t}` });
  }
  for (const [login, k] of Object.entries(tw)) {
    if ((k.links ?? []).includes(h) && (k.namePasst || login === p.gespeichertTwitch)) {
      b.push({ art: 'link', stark: true, anker: login === p.gespeichertTwitch, text: `Twitch ${login} verlinkt @${x.sn}${login === p.gespeichertTwitch ? ' (unser gespeicherter Kanal)' : ''}`, url: `https://twitch.tv/${login}` });
    }
  }
  for (const q of daten?.xQuellen?.get(h) ?? []) if (q.id === p.id || !q.id) b.push({ art: 'daten', stark: true, text: `steht in unseren Daten: ${q.text}`, url });
  b.push(...postBelege);
  const org = (p.orgs ?? []).find((o) => (o.x && (erwaehnungen(text).includes(o.x.toLowerCase()) || xLinks(text).includes(o.x.toLowerCase())))
    || (o.name.length >= 4 && norm(`${x.bio} ${x.name}`).includes(norm(o.name))));
  if (org) b.push({ art: 'fn', text: `Bio nennt die Org ${org.name}`, url });
  else if (FN.test(`${x.bio ?? ''} ${x.name ?? ''}`)) b.push({ art: 'fn', text: `Bio: "${String(x.bio ?? '').replace(/\s+/g, ' ').slice(0, 90)}"`, url });
  if (namePasst(x.name ?? '', p.woerter)) b.push({ art: 'name', text: `Anzeigename "${x.name}"`, url });
  if ((x.folger ?? 0) >= folgerGrenze(p) && !x.geschuetzt) b.push({ art: 'folger', text: `${x.folger} Folger`, url });
  return b;
}

/** Die Belege fuer einen Twitch-Kanal (k: { login, name, beschreibung, links, spiel, folger }). xGewaehlt: das (fest oder vorgeschlagen) gewaehlte X-Konto. */
export function twitchBelege(k, p, { xGewaehlt = null, xProfil = null, daten } = {}) {
  const b = [];
  const url = `https://twitch.tv/${k.login}`;
  if (xGewaehlt && (k.links ?? []).includes(xGewaehlt.toLowerCase())) b.push({ art: 'link', stark: true, text: `Kanal verlinkt @${xGewaehlt}`, url });
  if (xProfil && twitchLinks(`${xProfil.bio ?? ''} ${xProfil.web ?? ''}`).includes(k.login)) b.push({ art: 'link', stark: true, text: `@${xProfil.sn} verlinkt den Kanal`, url: `https://x.com/${xProfil.sn}` });
  if (daten?.paare?.has(`${k.login}|${String(xGewaehlt ?? '').toLowerCase()}`)) b.push({ art: 'daten', stark: true, text: 'Paar Twitch/X steht in streamers.json', url });
  if (/fortnite/i.test(k.spiel ?? '') || FN.test(k.beschreibung ?? '')) b.push({ art: 'fn', text: k.spiel ? `zuletzt gestreamt: ${k.spiel}` : `Beschreibung: "${String(k.beschreibung).slice(0, 80)}"`, url });
  if (k.namePasst) b.push({ art: 'name', text: `Kanalname "${k.name}"`, url });
  if ((k.folger ?? 0) >= Math.min(1000, folgerGrenze(p))) b.push({ art: 'folger', text: `${k.folger} Folger`, url });
  // Doppelt gezaehlte Links (beide Richtungen) sind EIN Beleg
  return b.filter((x, i, a) => a.findIndex((y) => y.text === x.text) === i);
}

/**
 * Stufe eines X-Kontos aus den Belegen (gemessen in drei blinden Stichproben am 16.11.2026, siehe Kopf von scripts/socials-finden.mjs):
 *   auto       ein Anker zum Spieler (platz, partner, daten oder ein Link auf unseren gespeicherten Kanal) und ein zweiter Beleg (fn, name, ein weiterer Anker)
 *   vorschlag  alles andere mit Link, Anker, Fortnite-Bezug oder passendem Namen
 * Ein Link X<->Twitch beweist nur, dass Konto und Kanal derselben Person gehoeren, nicht dass es unser Spieler ist. Gemessen: Link + Name ohne Anker
 * fand @VicoTTV fuer "Vico" und @Panzer_fn fuer "panzer"; selbst Link + Fortnite + Name war nur 7 von 9 richtig (@PeterbotFNR statt @PeterbotFN,
 * @pablofnbr statt @PabloWingu). Mit Anker: 16 von 16.
 */
export function stufe(belege) {
  const arten = new Set(belege.map((b) => b.art));
  const ankerArten = new Set(belege.filter((b) => ['platz', 'partner', 'daten'].includes(b.art) || (b.art === 'link' && b.anker)).map((b) => b.art));
  const zweite = [...(arten.has('fn') ? ['fn'] : []), ...(arten.has('name') ? ['name'] : []), ...(ankerArten.size > 1 ? ['anker'] : [])];
  if (ankerArten.size && zweite.length) return 'auto';
  // Name allein ist nur ein Vorschlag (viele echte Konten nennen Fortnite nicht in der Bio: dandepuzo, freuzii) - der Admin entscheidet.
  if (arten.has('link') || ankerArten.size || arten.has('fn') || arten.has('name')) return 'vorschlag';
  return null;
}

/** Stufe eines Twitch-Kanals: auto nur ueber ein festes X-Konto (Link in eine Richtung) plus Name oder Fortnite; sonst Vorschlag bei Link oder fn+name. */
export function stufeTwitch(belege, xFest) {
  const arten = new Set(belege.map((b) => b.art));
  if ((arten.has('link') || arten.has('daten')) && xFest && (arten.has('name') || arten.has('fn'))) return 'auto';
  if (arten.has('link') || arten.has('daten') || (arten.has('fn') && arten.has('name'))) return 'vorschlag';
  return null;
}

/** Punkte zum Ordnen mehrerer Kandidaten. */
export const punkte = (belege) => belege.reduce((s, b) => s + ({ link: 10, daten: 10, platz: 9, partner: 8, fn: 4, name: 3, folger: 1 }[b.art] ?? 0), 0);

/* ------------------------------------------------------------------ Posts gegen unsere Bestenlisten */

const ORD = /(?<![\w#])(?:#\s?(\d{1,3})|(\d{1,3})\s?(?:st|nd|rd|th)\b|(\d{1,3})(?:\.|º|°)\s?(?:place|platz|lugar|place|plaats|miejsce))/gi;
const CUP_WORT = [['cash', /cash/i], ['fncs', /fncs|heat|grand|semi|final/i], ['victory', /victory|vcc/i], ['eval', /eval/i], ['reload', /reload/i], ['zb', /zero ?build|\bzb\b/i], ['divisional', /div(isional)?/i]];

/**
 * Plaetze aus Posts mit unseren Ergebnissen des Kontos vergleichen.
 *   posts:  [{ id, zeit (ms), text, erwaehnt: [handles] }]
 *   reihen: unsere Ergebnisse des Kontos [{ datum, platz, punkte, titel, mitspieler: [epicIds] }]
 *   xVon:   epicId -> X-Handle (gespeicherte Profile), fuer Partner
 * Ein Platz zaehlt, wenn ein Ergebnis mit genau diesem Platz bis vier Tage vor dem Post liegt (bis 12 h danach) und ein Cup-Wort im Post, wo eins
 * dasteht, zum Titel passt. Plaetze ueber 500 und Jahreszahlen zaehlen nicht.
 */
export function postsPruefen(posts, reihen, xVon, sn) {
  const b = [];
  for (const post of posts) {
    const t = post.zeit;
    const nah = reihen.filter((r) => r.datum && r.datum <= t + 12 * 3600e3 && r.datum >= t - 4 * 86400e3);
    if (!nah.length) continue;
    const url = `https://x.com/${sn}/status/${post.id}`;
    const tag = new Date(t).toISOString().slice(0, 10);
    const woerter = CUP_WORT.filter(([, re]) => re.test(post.text)).map(([w]) => w);
    for (const m of String(post.text).matchAll(ORD)) {
      const platz = Number(m[1] ?? m[2] ?? m[3]);
      if (!platz || platz > 500) continue;
      const r = nah.find((x) => x.platz === platz && (!woerter.length || woerter.some((w) => CUP_WORT.find(([k]) => k === w)[1].test(x.titel ?? ''))));
      if (r) { b.push({ art: 'platz', stark: true, text: `Post ${tag}: "${m[0].trim()}" = Platz ${r.platz} in ${r.titel} laut unserer Bestenliste`, url }); break; }
    }
    if (!b.some((x) => x.art === 'partner')) {
      const nah7 = reihen.filter((r) => r.datum && Math.abs(r.datum - t) <= 7 * 86400e3);
      for (const h of post.erwaehnt ?? []) {
        const r = nah7.find((x) => (x.mitspieler ?? []).some((m) => xVon.get(m) === h.toLowerCase()));
        if (r) { b.push({ art: 'partner', stark: true, text: `Post ${tag} erwaehnt @${h}, Mitspieler in ${r.titel}`, url }); break; }
      }
    }
    if (b.filter((x) => x.art === 'platz' || x.art === 'partner').length >= 2) break;
  }
  return b.filter((x, i, a) => a.findIndex((y) => y.art === x.art) === i);
}

/* ------------------------------------------------------------------ Flagge */

const flaggenIn = (s) => [...String(s ?? '').matchAll(/(\p{Regional_Indicator})(\p{Regional_Indicator})/gu)]
  .map((m) => String.fromCharCode(m[1].codePointAt(0) - 0x1f1a5) + String.fromCharCode(m[2].codePointAt(0) - 0x1f1a5));

/**
 * Welche Flaggen-Quellen allein reichen (gemessen im Probelauf, siehe Kopf von scripts/socials-finden.mjs):
 *   name    genau eine Flagge im X-Anzeigenamen        ort      genau eine Flagge im X-Ort      ortname  ein Ort, der ein Land ist ("Germany")
 *   bio     genau eine Flagge in der X-Bio             twitch   genau eine Flagge in der Twitch-Beschreibung
 */
export const STARKE_FLAGGEN = new Set(['ort', 'ortname', 'twitch']);
/** Diese reichen nur, wenn eine zweite Quelle dasselbe Land nennt (eine starke, die Szene-Liste oder Epics Power Ranking). Bio allein: 28 von 30. */
export const BESTAETIGTE_FLAGGEN = new Set(['name', 'bio']);

/**
 * Die Flagge aus einem X-Profil (und der Beschreibung des Twitch-Kanals).
 *   auto:      eine Quelle aus STARKE_FLAGGEN, keine widerspricht, und sie passt zur Region
 *   vorschlag: sonst (widerspruechlich, keine Region, passt nicht zur Region)
 * landAusEingabe, regionVonLand: lib/laender, lib/landRegion. region: unsere Region des Spielers (EU, NAC, NAW, BR, ASIA, OCE, ME).
 * Gibt auch die einzelnen Quellen zurueck (quellen: [{ art, code }]) - damit misst der Probelauf jede Quelle fuer sich.
 */
export function flaggeAus(x, region, { landAusEingabe, regionVonLand }, { twitch = null, starke = STARKE_FLAGGEN, bekannt = null } = {}) {
  if (!x && !twitch) return null;
  const reg = String(region ?? '').toUpperCase().replace(/^NA[CWE]?$/, 'NA');
  const passt = (code) => !!reg && regionVonLand(code) === reg;
  const kandidaten = [];
  const eine = (s) => { const f = [...new Set(flaggenIn(s))]; return f.length === 1 ? f[0] : null; };
  const url = x ? `https://x.com/${x.sn}` : `https://twitch.tv/${twitch.login}`;
  if (x) {
    const n = eine(x.name); if (n) kandidaten.push({ art: 'name', code: n, text: `Flagge im X-Namen "${x.name}"`, url });
    const o = eine(x.ort); if (o) kandidaten.push({ art: 'ort', code: o, text: `Flagge im X-Ort "${x.ort}"`, url });
    if (!flaggenIn(x.ort).length && x.ort) {
      const teile = String(x.ort).split(/[,/|·•]| - /).map((t) => t.trim()).filter(Boolean);
      for (const t of [teile[teile.length - 1], ...teile]) {
        const l = t && t.length >= 4 ? landAusEingabe(t) : null;
        if (l) { kandidaten.push({ art: 'ortname', code: l.code, text: `X-Ort "${x.ort}"`, url }); break; }
      }
    }
    const b = eine(x.bio); if (b) kandidaten.push({ art: 'bio', code: b, text: `Flagge in der X-Bio`, url });
  }
  if (bekannt?.code) kandidaten.push({ art: 'bekannt', code: bekannt.code, text: `${bekannt.quelle} nennt ${bekannt.code}`, nurBestaetigung: true });
  if (twitch) { const t = eine(twitch.beschreibung); if (t) kandidaten.push({ art: 'twitch', code: t, text: `Flagge in der Twitch-Beschreibung (${twitch.login})`, url: `https://twitch.tv/${twitch.login}` }); }
  for (const k of kandidaten) if (k.code === 'UK') k.code = 'GB';
  // Die Szene-Liste / das Power Ranking bestaetigen nur; widersprechen sie, entscheidet nichts automatisch.
  const eigene = kandidaten.filter((k) => !k.nurBestaetigung);
  if (!eigene.length) return null;
  const codes = [...new Set(kandidaten.map((k) => k.code))];
  if (!codes.length) return null;
  const quellen = eigene.map((k) => ({ art: k.art, code: k.code }));
  if (codes.length > 1) return { code: codes[0], stufe: 'vorschlag', quellen, belege: kandidaten.map((k) => ({ art: 'land', text: `${k.text} -> ${k.code} (widerspruechlich)`, url: k.url })) };
  const code = codes[0];
  const belege = kandidaten.map((k) => ({ art: 'land', text: `${k.text} -> ${code}`, url: k.url }));
  if (!reg) belege.push({ art: 'region', text: 'keine Region bekannt' });
  else belege.push({ art: 'region', text: passt(code) ? `passt zur Region ${region}` : `passt nicht zur Region ${region}` });
  const zahl = new Set(kandidaten.map((k) => k.art)).size;
  const stark = (eigene.some((k) => starke.has(k.art)) || (eigene.some((k) => BESTAETIGTE_FLAGGEN.has(k.art)) && zahl >= 2)) && passt(code);
  return { code, stufe: stark ? 'auto' : 'vorschlag', quellen, belege };
}
