// Solo Clutch Points - die Turnierpunkte, die ein Spieler geholt hat,
// waehrend sein Mitspieler schon ausgeschieden war.
//
// Der Betreiber (28.9.2026): "wie viele Punkte einer vom Team mit alleine,
// weil sein Mate tot war, holen konnte." Bei Osirion heisst derselbe Wert
// "TournamentPointsGainedSolo".
//
// Gerechnet aus dem Server-Replay (C#-Leser, lib/replayLeser.mjs) und der
// Wertungstabelle des Spieltags (lib/cupWertung):
//
//   Stirbt der Mitspieler endgueltig (nicht nur umgehauen) zum Zeitpunkt t,
//   haette das Team, waere es in diesem Moment ganz ausgeschieden, den Platz
//   "Zahl der Teams, die bei t noch leben" und die Elims bis t gehabt. Was
//   das Team am Ende tatsaechlich bekommt, minus diese Punkte, hat der
//   Uebriggebliebene allein geholt.
//
// Allein ist der Uebriggebliebene ab dem Knock, der zum Tod des Mitspielers
// fuehrte (nicht erst ab dem endgueltigen Tod) - ab dort kann ihm keiner mehr
// helfen. Mit dieser Festlegung lagen die Werte fuer Globals Day 1 am
// naechsten an Osirions "TournamentPointsGainedSolo" (dieselben zehn
// Spieler vorn, im Mittel etwa fuenf Punkte darunter); Osirions genaue
// Regel ist nicht oeffentlich, die Anzeige nennt den Wert deshalb
// "aus den Server-Replays gerechnet".
//
// Nur Eliminierungen echter Spieler zaehlen (keine KI-Gegner), und nur
// endgueltige (ein Knock ist keine Elim). Stirbt das Team gemeinsam oder
// ueberlebt es zu zweit, gibt es keine Clutch-Punkte.

/** @param {Array<{was:string,schwelle:number,regel:string,punkte:number,jeStueck:boolean}>} wertung */
function punkte(wertung, platz, elims) {
  let s = 0;
  for (const r of wertung) {
    if (r.was === 'Placement') {
      if (platz !== null && (r.regel === 'lte' ? platz <= r.schwelle : platz >= r.schwelle)) s += r.punkte;
    } else if (r.was === 'Elimination') {
      if (elims >= r.schwelle) s += r.jeStueck ? r.punkte * elims : r.punkte;
    } else if (r.was === 'Victory Royale') {
      if (platz === 1) s += r.punkte;
    } else if (r.was === 'Match played') {
      s += r.punkte;
    }
  }
  return s;
}

/**
 * @param roh    Ausgabe des C#-Lesers (PlayerData, TeamData, KillFeed)
 * @param wertung Wertungsregeln des Spieltags
 * @returns Map EpicId (klein) -> Clutch-Punkte dieses Matches (nur > 0)
 */
export function clutchPunkte(roh, wertung) {
  const raus = new Map();
  if (!wertung?.length) return raus;
  const spieler = (roh.PlayerData ?? []).filter((p) => p && !p.IsBot && p.EpicId);
  const nachId = new Map((roh.PlayerData ?? []).map((p) => [p.Id, p]));
  const echt = (id) => { const p = nachId.get(id); return p && !p.IsBot ? p : null; };

  // Endgueltige Tode: Zeitpunkt je Spieler (aus dem Spieler selbst, sonst dem KillFeed).
  const tod = new Map();
  for (const p of spieler) if (typeof p.DeathTimeDouble === 'number' && p.DeathTimeDouble > 0) tod.set(p.Id, p.DeathTimeDouble);
  for (const k of roh.KillFeed ?? []) {
    if (k.IsDowned) continue;
    if (!tod.has(k.PlayerId) && echt(k.PlayerId)) tod.set(k.PlayerId, k.ReplicatedWorldTimeSecondsDouble);
  }
  // Der letzte Knock je Spieler - der, nach dem er nicht mehr aufstand.
  const knock = new Map();
  for (const k of roh.KillFeed ?? []) if (k.IsDowned) knock.set(k.PlayerId, k.ReplicatedWorldTimeSecondsDouble);
  const teams = new Map();
  for (const p of spieler) {
    if (p.TeamIndex === undefined || p.TeamIndex === null) continue;
    if (!teams.has(p.TeamIndex)) teams.set(p.TeamIndex, []);
    teams.get(p.TeamIndex).push(p);
  }
  // Wann ist jedes Team ganz ausgeschieden? (Unendlich: hat ueberlebt.)
  const teamAus = new Map();
  for (const [nr, ps] of teams) {
    const zeiten = ps.map((p) => tod.get(p.Id));
    teamAus.set(nr, zeiten.every((z) => typeof z === 'number') ? Math.max(...zeiten) : Infinity);
  }
  // Endgueltige Elims echter Spieler, je Team, mit Zeit.
  const elimsVon = new Map();
  for (const k of roh.KillFeed ?? []) {
    if (k.IsDowned || k.PlayerIsBot) continue;
    const taeter = echt(k.FinisherOrDowner); const opfer = echt(k.PlayerId);
    if (!taeter || !opfer || taeter.TeamIndex === opfer.TeamIndex) continue;
    if (!elimsVon.has(taeter.TeamIndex)) elimsVon.set(taeter.TeamIndex, []);
    elimsVon.get(taeter.TeamIndex).push(k.ReplicatedWorldTimeSecondsDouble);
  }

  for (const [nr, ps] of teams) {
    if (ps.length !== 2) continue;
    const [a, b] = ps;
    const ta = tod.get(a.Id); const tb = tod.get(b.Id);
    // Wer zuerst endgueltig starb - und ob der andere danach noch lebte.
    let erster; let zweiter;
    if (typeof ta === 'number' && (typeof tb !== 'number' || ta < tb)) { erster = a; zweiter = b; }
    else if (typeof tb === 'number' && (typeof ta !== 'number' || tb < ta)) { erster = b; zweiter = a; }
    else continue; // gemeinsam oder beide ueberlebt
    let t = tod.get(erster.Id);
    const kn = knock.get(erster.Id);
    if (typeof kn === 'number' && kn < t && t - kn < 90) t = kn;
    if (typeof tod.get(zweiter.Id) === 'number' && tod.get(zweiter.Id) - t < 1) continue; // praktisch gemeinsam
    const lebend = [...teamAus.values()].filter((z) => z > t).length; // inkl. dieses Teams
    const elimsBis = (elimsVon.get(nr) ?? []).filter((z) => z <= t).length;
    const elimsEnde = (elimsVon.get(nr) ?? []).length;
    const platzEnde = typeof a.Placement === 'number' ? a.Placement : (b.Placement ?? null);
    const dann = punkte(wertung, lebend, elimsBis);
    const ende = punkte(wertung, platzEnde, elimsEnde);
    const clutch = Math.max(0, ende - dann);
    if (clutch > 0) raus.set(String(zweiter.EpicId).toLowerCase(), clutch);
  }
  return raus;
}
