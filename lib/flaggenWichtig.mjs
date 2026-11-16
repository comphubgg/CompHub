/*
 * Wer ist ein wichtiger Spieler? (Betreiber, 16.11.2026: "jeder wichtige Spieler muss eine Flagge und ein X-Konto haben".)
 *
 * Wichtig heisst: oft qualifiziert oder wiederholt gut platziert - nicht ein Glueckstreffer. Gezaehlt wird aus Epics Bestenlisten (data/epic-spieltage und das
 * alte Archiv bis 2019), allein ueber die Konto-Id, je Ereignis einmal (Tag 1 und Tag 2 eines Finales, Runde 1 und 2 eines Cups sind ein Ereignis):
 *
 *   final   FNCS-Finale (Grand Finals, Solo-Finals, Major-Finals, Global Championship, Grand Royale, Invitational-Finale) - hoechstens 150 Teams im Feld
 *   semi    FNCS-Halbfinale
 *   heat    FNCS-Heats
 *   runde   eine spaete FNCS-Qualifikationsrunde mit hoechstens 3.000 Teams (Runde 3, Wildcard, Wochenfinale) - wer dort steht, hat sich qualifiziert
 *   cup     Cash, Victory, Elite, Series Cup, Performance Evaluation, Champion Cash Cup, FNCS Showdown, Divisional Cup Division 1:
 *           im Finale des Cups gestanden (istFinale, hoechstens 1.000 Teams) oder in die Spitze gekommen (Top 100 in Feldern ab 1.000 Teams und in gekuerzten
 *           Listen, sonst die besten 10 Prozent, mindestens Top 10)
 *
 * Nicht gezaehlt: Ranked, Mobile, Skin-, Icon- und Practice-Cups (ausser Division 1), Listen unter 20 Teams und dieselbe Bestenliste unter mehreren Kennungen
 * (Stand 15.11.2026 rund 370 Dateien, siehe scripts/spieler-kreis.mjs) - sie zaehlt nur einmal, mit der niedrigsten Stufe.
 *
 * Punkte (nur zum Ordnen, in der Tabelle steht jede Zahl einzeln):
 *   30 je Finale, 12 je Halbfinale, 10 je Heat, 4 je spaete Runde, 3 je Cup;
 *   bestes Finale: Sieg +40, Podium +25, Top 10 +12, Top 25 +5;
 *   Epics Power Ranking (weltweit): Top 100 +30, Top 500 +15, Top 1.000 +8, Top 2.500 +3;
 *   Finals laut Szene-Liste (szene-quelle/spielerliste.json, Saisons CH1 bis Globals 2025) zaehlen, wo sie mehr sind als unsere eigenen.
 *   Aktiv im letzten Jahr: +10.
 * Wichtig ist, wer mindestens eins davon hat: ein Finale; zwei Heats/Halbfinals; ein Heat/Halbfinale und zwei Cups; drei spaete Runden; eine spaete Runde
 * und fuenf Cups; zehn Cups (sechs, wenn im letzten Jahr aktiv); oder einen Platz unter den ersten 1.000 im Power Ranking. Die erste Fassung liess sechs
 * Cups ohne Zeitgrenze zu: 13.000 Konten nur aus Cups, viele davon ohne bekannten Namen und seit Jahren weg.
 */

export const REGELN = {
  finalFeld: 150, rundeFeld: 3000, cupFinalFeld: 1000, mindestFeld: 20,
  punkte: { final: 30, semi: 12, heat: 10, runde: 4, cup: 3, aktiv: 10 },
};

const familie = (id) => `${/Reload/i.test(id) ? 'R' : ''}${/(^|_)ZB(_|$)|ZeroBuild|NoBuild/i.test(id) ? 'Z' : ''}`;
/** Die Region aus der Kennung entfernen (sie steht im Schluessel ohnehin, und alte Kennungen tragen sie mitten im Namen). */
const ohneRegion = (id) => id.replace(/_(EU|NAC|NAW|NAE|NA|BR|ASIA|OCE|ME|CEU|NEU)(?=_|$)/g, '').replace(/_(PC|Console)(?=_|$)/g, '');

/**
 * Die Stufe eines Spieltags: { art, schluessel } oder null, wenn er nicht zaehlt.
 * art: 'final' | 'semi' | 'heat' | 'runde' | 'cup'. Der Schluessel fasst die Tage und Runden eines Ereignisses zusammen.
 */
export function stufe(tag) {
  const id = String(tag?.windowId ?? '');
  if (!id || !Array.isArray(tag.teams) || tag.teams.length < REGELN.mindestFeld) return null;
  const alles = `${id} ${tag.titel ?? ''} ${tag.cupId ?? ''}`;
  if (/ranked|mobile/i.test(alles)) return null;
  const feld = tag.teams.length;
  const kurz = !!tag.gekuerzt;
  const saison = String(tag.season || id.replace(/^epicgames_/, '').split('_')[0]);
  const region = String(tag.region ?? '');
  const fncs = (/FNCS/i.test(id) && !/FNCSCup|Divisional|FastTrack|LastChance|Showdown/i.test(alles) && !/Practice/i.test(alles))
    || /GrandRoyale|GlobalChampionship|Invitational|AllStar|Summit/i.test(id);
  if (fncs) {
    const fam = familie(id);
    const major = (id.match(/Major(\d)/i) ?? [])[1] ?? '';
    if (/Heat/i.test(id)) return { art: 'heat', schluessel: `${saison}|heat|${fam}${major}|${region}` };
    if (/Semi/i.test(id)) return { art: 'semi', schluessel: `${saison}|semi|${fam}${major}|${region}` };
    if (/Wildcard|SecondChance/i.test(id)) return feld <= REGELN.rundeFeld ? { art: 'runde', schluessel: `${saison}|runde|${ohneRegion(id)}|${region}` } : null;
    if ((tag.istFinale || /Final/i.test(id)) && feld <= REGELN.finalFeld) return { art: 'final', schluessel: `${saison}|final|${fam}${major}|${region}` };
    if (feld <= REGELN.rundeFeld && !kurz) {
      return { art: 'runde', schluessel: `${saison}|runde|${ohneRegion(id).replace(/_?Day\d+/gi, '')}|${region}` };
    }
    return null;
  }
  if (/CashCup|VictoryCup|EliteCup|EliteSeries|SeriesCup|PerformanceEvaluation|CC_Champions|ChampionCashCup|FNCSShowdown|DivisionalCup_Division1(?!\d)/i.test(id)) {
    const ereignis = ohneRegion(id).replace(/_?(Round|Day)\d+/gi, '').replace(/_mg\d*/gi, '');
    return { art: 'cup', schluessel: `${ereignis}|${region}`, cupFinale: !!tag.istFinale && feld <= REGELN.cupFinalFeld, feld, kurz };
  }
  return null;
}

/** Zaehlt ein Platz in einem Cup (s. stufe()) als Qualifikation bzw. Spitze? */
export function cupZaehlt(s, platz) {
  if (s.cupFinale) return true;
  const grenze = s.feld >= 1000 || s.kurz ? 100 : Math.max(10, Math.round(s.feld * 0.1));
  return platz <= grenze;
}

/** Die Rangfolge der Stufen - bei Kopien derselben Liste zaehlt die niedrigste. */
export const STUFEN = ['cup', 'runde', 'heat', 'semi', 'final'];

/**
 * Aus den Zaehlungen eines Kontos die Punkte und ob es wichtig ist.
 * k: { final, semi, heat, runde, cup, besteFinal, letzte } · extra: { pr (Rang), szeneFinals }
 */
export function bewerten(k, { pr = null, szeneFinals = 0, jetzt = Date.now() } = {}) {
  const P = REGELN.punkte;
  const finals = Math.max(k.final ?? 0, szeneFinals ?? 0);
  const bf = k.besteFinal ?? null;
  let punkte = P.final * finals + P.semi * (k.semi ?? 0) + P.heat * (k.heat ?? 0) + P.runde * (k.runde ?? 0) + P.cup * (k.cup ?? 0);
  if (bf != null) punkte += bf === 1 ? 40 : bf <= 3 ? 25 : bf <= 10 ? 12 : bf <= 25 ? 5 : 0;
  if (pr != null) punkte += pr <= 100 ? 30 : pr <= 500 ? 15 : pr <= 1000 ? 8 : pr <= 2500 ? 3 : 0;
  if ((k.letzte ?? 0) >= jetzt - 365 * 864e5) punkte += P.aktiv;
  const hs = (k.semi ?? 0) + (k.heat ?? 0);
  const aktiv = (k.letzte ?? 0) >= jetzt - 365 * 864e5;
  const cups = k.cup ?? 0;
  const wichtig = finals >= 1 || hs >= 2 || (hs >= 1 && cups >= 2) || (k.runde ?? 0) >= 3 || ((k.runde ?? 0) >= 1 && cups >= 5)
    || cups >= 10 || (cups >= 6 && aktiv) || (pr != null && pr <= 1000);
  return { punkte, wichtig, finals };
}
