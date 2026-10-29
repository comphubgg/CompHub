/*
 * Ueberlebenszeit je Spieler aus den Rohdaten eines Matches (busAb, Spieler, Kill-Feed) - fuer die Kachel "Time Alive" der Player Stats
 * (Betreiber, 29.10.2026: mindestens die Werte wie bei Osirion, fuer jeden Cup).
 *
 * Gerechnet wird ab dem Absprung (Bus plus ABSPRUNG Sekunden - so zaehlt die Szene-Quelle, an Division 1 Week 4 EU im Median 21 s je Match) bis zum
 * letzten Eintrag "tot" des Spielers, ohne die Zeit zwischen Tod und Reboot. Liegt er zuletzt am Boden ("unten"), stirbt er mit seinem Team: dann zaehlt der letzte Tod eines Mitspielers
 * danach. Wer zuletzt wieder ins Spiel kam (Reboot) oder nie fiel, lebt bis zum letzten Eintrag des Feeds (das Ende des Matches). Ohne Buszeit zaehlt
 * das Match nicht.
 *
 *   lebenJeMatch({ busAb, spieler: [{ id, epic, team, bot }], feed: [{ t, opfer, art }] })  ->  Map(epic -> Sekunden)
 */
const ABSPRUNG = 20;

export function lebenJeMatch(m) {
  const raus = new Map();
  if (typeof m?.busAb !== 'number') return raus;
  const feed = (m.feed ?? []).filter((f) => typeof f.t === 'number').sort((a, b) => a.t - b.t);
  if (!feed.length) return raus;
  const ende = feed[feed.length - 1].t;
  const start = m.busAb + ABSPRUNG;
  const letzter = new Map();
  for (const f of feed) if (f.opfer != null) letzter.set(f.opfer, f);
  const teamVon = new Map((m.spieler ?? []).map((p) => [p.id, p.team]));
  for (const p of m.spieler ?? []) {
    if (p.bot || !p.epic) continue;
    const l = letzter.get(p.id);
    let bis = ende;
    if (l?.art === 'tot') bis = l.t;
    else if (l?.art === 'unten') {
      // Am Boden geblieben: tot, sobald der letzte Mitspieler faellt (sonst der Moment des Knocks).
      const mit = feed.filter((f) => f.art === 'tot' && f.t >= l.t && f.opfer !== p.id && teamVon.get(f.opfer) === p.team);
      bis = mit.length ? mit[mit.length - 1].t : l.t;
    }
    // Die Zeit zwischen Tod und Reboot ("tot" -> "auf") zaehlt nicht - so zaehlt auch die Szene-Quelle.
    let lebt = true; let ab = start; let summe = 0;
    for (const f of feed) {
      if (f.opfer !== p.id || f.t > bis) continue;
      if (f.art === 'tot' && lebt) { summe += Math.max(0, f.t - ab); lebt = false; }
      else if (f.art === 'auf' && !lebt) { ab = f.t; lebt = true; }
    }
    if (lebt) summe += Math.max(0, bis - ab);
    raus.set(String(p.epic).toLowerCase(), summe);
  }
  return raus;
}

/** Summe ueber alle Matches eines Spieltags: { epic: Sekunden }. */
export function lebenSumme(matches) {
  const summe = {};
  for (const m of matches ?? []) {
    for (const [k, v] of lebenJeMatch(m)) summe[k] = Math.round((summe[k] ?? 0) + v);
  }
  return summe;
}
