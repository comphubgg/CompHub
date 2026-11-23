/*
 * Liquipedia-Infobox lesen und sicher einem unserer Spieler zuordnen - die Logik ohne Netz (wie lib/socialsFinder.mjs neben scripts/socials-finden.mjs).
 * Das Abrufen macht scripts/liquipedia-flaggen.mjs (nur action=query, hoeflich, ueber curl).
 *
 * Liquipedia (CC BY-SA 3.0) fuehrt je Spieler eine Seite mit einer Infobox:
 *   {{Infobox player |id=Bugha |name=Kyle Giersdorf |country=United States |team=... |ids=... |twitter=bugha |twitch=bugha |youtube=bugha ...}}
 * Daraus kommen: Flagge (country -> ISO-2), X-Konto (twitter), Twitch (twitch). Zugeordnet wird SICHER - nur, wenn
 *   1. der Szene-Name uebereinstimmt (namensSchluessel der Liquipedia-id/des Seitentitels gleich einem unserer Namen, zifferngefaltet), UND
 *   2. die Region zum Land passt (regionVonLand der Flagge gleich unserer Region; NAC/NAW zaehlen beide als NA).
 * Beides erfuellt -> automatisch (stufe 'auto', landet in spieler-profile.json + socials-auto.json zum Pruefen). Sonst, wenn der Name wenigstens
 * ungefaehr passt -> Vorschlag (stufe 'vorschlag', socials-vorschlaege.json, nur zum Bestaetigen). Passt der Name gar nicht -> nichts (fremde Seite).
 * Ein von Hand gepflegtes Feld wird nie ueberschrieben (das prueft der Lauf gegen den frischen Stand, wie scripts/socials-finden.mjs eintragen()).
 */

/** Die Vorlage {{Infobox player ...}} als Text (mit den aeusseren {{ }}), oder null - mit Klammerzaehlung, damit verschachtelte Vorlagen nicht stoeren. */
export function infoboxVorlage(wikitext) {
  const text = String(wikitext ?? '');
  const m = text.search(/\{\{\s*Infobox[ _]player\b/i);
  if (m < 0) return null;
  let tiefe = 0;
  for (let i = m; i < text.length - 1; i += 1) {
    if (text[i] === '{' && text[i + 1] === '{') { tiefe += 1; i += 1; }
    else if (text[i] === '}' && text[i + 1] === '}') { tiefe -= 1; i += 1; if (tiefe === 0) return text.slice(m, i + 1); }
  }
  return null;
}

/** Die Felder der Infobox: { id, name, country, team, ids, twitter, twitch, youtube, ... } (Schluessel klein). Trennt nur an Strichen der obersten Ebene. */
export function infoboxFelder(wikitext) {
  const vorlage = infoboxVorlage(wikitext);
  if (!vorlage) return null;
  const inner = vorlage.slice(2, -2);
  const teile = [];
  let buf = ''; let v = 0; let e = 0;
  for (let i = 0; i < inner.length; i += 1) {
    const c = inner[i]; const n = inner[i + 1];
    if (c === '{' && n === '{') { v += 1; buf += '{{'; i += 1; continue; }
    if (c === '}' && n === '}') { v -= 1; buf += '}}'; i += 1; continue; }
    if (c === '[' && n === '[') { e += 1; buf += '[['; i += 1; continue; }
    if (c === ']' && n === ']') { e -= 1; buf += ']]'; i += 1; continue; }
    if (c === '|' && v === 0 && e === 0) { teile.push(buf); buf = ''; continue; }
    buf += c;
  }
  teile.push(buf);
  const felder = {};
  // teile[0] ist "Infobox player" - uebersprungen.
  for (const t of teile.slice(1)) {
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim().toLowerCase();
    const w = t.slice(eq + 1).trim();
    if (k && !(k in felder)) felder[k] = w;
  }
  return felder;
}

/** Ein X-Handle aus einem Infobox-Wert (meist nur "bugha", manchmal ein Link). Leer, wenn nichts Brauchbares. */
export function handleX(roh) {
  const s = String(roh ?? '').replace(/\{\{[^{}]*\}\}/g, ' ').replace(/\[\[|\]\]/g, ' ').trim();
  if (!s || /^(none|n\/a|tbd|\?+)$/i.test(s)) return '';
  const m = s.match(/(?:(?:https?:)?\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})|^@?([A-Za-z0-9_]{1,15})$/i);
  return (m && (m[1] || m[2])) || '';
}

/** Ein Twitch-Login aus einem Infobox-Wert (klein). */
export function handleTwitch(roh) {
  const s = String(roh ?? '').replace(/\{\{[^{}]*\}\}/g, ' ').replace(/\[\[|\]\]/g, ' ').trim();
  if (!s || /^(none|n\/a|tbd|\?+)$/i.test(s)) return '';
  const m = s.match(/(?:(?:https?:)?\/\/)?(?:www\.|m\.)?twitch\.tv\/([A-Za-z0-9_]{3,25})|^([A-Za-z0-9_]{3,25})$/i);
  return ((m && (m[1] || m[2])) || '').toLowerCase();
}

/** Mehrere Namen aus dem ids-Feld (Komma/Schraegstrich/Zeilenumbruch; Markup und Klammer-Zusatz weg). */
export function idsNamen(roh) {
  return String(roh ?? '').replace(/\{\{[^{}]*\}\}/g, ' ').replace(/\[\[([^\]|]*\|)?|\]\]/g, ' ')
    .split(/[,/\n]+/).map((s) => s.replace(/\([^)]*\)/g, '').trim()).filter(Boolean);
}

/** Seitentitel-Kandidaten fuer einen Spieler (direkte Seite) - aus den Namen die Grundformen, erster Buchstabe gross. */
export function titelKandidaten(namen, { grundformen, kernname }, hoechstens = 6) {
  const raus = [];
  const dazu = (s) => { const t = String(s ?? '').trim(); if (t && !raus.some((x) => x.toLowerCase() === t.toLowerCase())) raus.push(t); };
  for (const n of namen) {
    const k = String(kernname(n)).replace(/[!ǃ.]+$/g, '').trim();
    if (k && !/\s{2,}/.test(k)) dazu(k.charAt(0).toUpperCase() + k.slice(1));
    for (const g of grundformen(n, kernname)) dazu(g.charAt(0).toUpperCase() + g.slice(1));
  }
  return raus.slice(0, hoechstens);
}

const broad = (r) => { const x = String(r ?? '').trim().toUpperCase(); return x === 'NAC' || x === 'NAW' ? 'NA' : x; };

/**
 * Eine Liquipedia-Seite gegen einen Spieler pruefen. Gibt je Feld, das dem Spieler fehlt, einen Treffer oder nichts.
 *   felder   infoboxFelder(wikitext)
 *   titel    Seitentitel
 *   spieler  { namen: string[], region: string, hat: { land, x, twitch } }   hat = was schon gespeichert ist
 *   quelle   'titel' (direkt ueber den Namen gefunden) | 'suche' (ueber die Volltextsuche - weniger sicher)
 *   deps     { landAusEingabe, regionVonLand, namensSchluessel, gefaltet, grundformen, kernname, namePasst, spielerWoerter }
 * Rueckgabe { id, name, land?, x?, twitch?, nameStufe, regionOk, grund } - land/x/twitch je { wert, stufe:'auto'|'vorschlag', belege }.
 */
export function bewertePage(felder, titel, spieler, quelle, deps) {
  const { landAusEingabe, regionVonLand, namensSchluessel, gefaltet, grundformen, kernname, namePasst, spielerWoerter } = deps;
  const raus = { id: felder.id || titel, name: felder.name || '', nameStufe: null, regionOk: false, grund: '' };
  const titelId = felder.id || titel;

  // 1. Name. Exakt = der ziffergefaltete Schluessel der Liquipedia-id oder des Titels ist einer unserer Namensschluessel.
  const schlu = (s) => gefaltet(namensSchluessel(String(s ?? '')));
  const lqSchluessel = [...new Set([titelId, titel, ...idsNamen(felder.ids)].map(schlu).filter(Boolean))];
  const unsereSchluessel = new Set(spieler.namen.map(schlu).filter(Boolean));
  const formen = [...new Set(spieler.namen.flatMap((n) => grundformen(n, kernname)))];
  const woerter = spielerWoerter(formen);
  const exakt = lqSchluessel.some((k) => unsereSchluessel.has(k));
  const nah = exakt || namePasst(titelId, woerter) || namePasst(titel, woerter);
  if (!nah) { raus.grund = 'Name passt nicht'; return raus; }
  raus.nameStufe = exakt ? 'exakt' : 'nah';

  // 2. Region. Die Flagge aus dem country-Feld, die Region daraus.
  const land = felder.country ? landAusEingabe(felder.country) : null;
  const lqRegion = land ? broad(regionVonLand(land.code)) : '';
  const unsereRegion = broad(spieler.region);
  const regionOk = !!lqRegion && !!unsereRegion && lqRegion === unsereRegion;
  const regionWiderspruch = !!lqRegion && !!unsereRegion && lqRegion !== unsereRegion;
  raus.regionOk = regionOk;

  // Automatisch nur: Name exakt, Region bekannt und stimmig, und nicht ueber die Suche gefunden. Sonst Vorschlag.
  const sicher = raus.nameStufe === 'exakt' && regionOk && quelle === 'titel';
  const url = `https://liquipedia.net/fortnite/${encodeURIComponent(String(titel).replace(/ /g, '_'))}`;
  const grund = [];
  grund.push(`Liquipedia „${titelId}“`);
  if (felder.country) grund.push(felder.country);
  if (felder.team) grund.push(`Team ${String(felder.team).replace(/[[\]{}]/g, '').trim()}`);
  if (quelle === 'suche') grund.push('ueber die Suche gefunden');
  if (regionWiderspruch) grund.push(`Region ${lqRegion} statt ${unsereRegion}`);
  if (raus.nameStufe === 'nah') grund.push('Name nur ungefaehr');
  const beleg = (zus) => [{ art: 'liquipedia', stark: sicher, text: [...grund, ...zus].join(' · '), url }];

  const stufe = sicher ? 'auto' : 'vorschlag';
  if (!spieler.hat.land && land && !regionWiderspruch) raus.land = { wert: land.code, stufe, belege: beleg([]) };
  else if (!spieler.hat.land && land && regionWiderspruch) raus.land = { wert: land.code, stufe: 'vorschlag', belege: beleg([]) };
  if (!spieler.hat.x) { const h = handleX(felder.twitter); if (h) raus.x = { wert: h, stufe, belege: beleg([`twitter=${h}`]) }; }
  if (!spieler.hat.twitch) { const h = handleTwitch(felder.twitch); if (h) raus.twitch = { wert: h, stufe, belege: beleg([`twitch=${h}`]) }; }
  // Sauberer Szene-Name (Anzeigename): Liquipedias id-Feld - der Wettkampfname ("Snayzy", "Threats", "Higgs"), auch wenn die Seite auf den aktuellen
  // Ingame-Namen weiterleitet ("Batman Bugha"). Nur, wenn noch kein von Hand gepflegter Anzeigename da ist (dann steht sonst der rohe Epic-Name).
  const sauber = String(titelId).trim();
  if (!spieler.hat.anzeige && sauber && /[A-Za-z0-9]/.test(sauber) && !/^\[/.test(sauber)) raus.anzeige = { wert: sauber, stufe, belege: beleg([`Name „${sauber}“`]) };
  return raus;
}
