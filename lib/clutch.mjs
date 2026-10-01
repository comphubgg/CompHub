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
// ueberleben mindestens zwei, gibt es keine Clutch-Punkte.

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

  /*
   * Duos, Trios, Squads - seit dem 29.9.2026 jede Teamgroesse. Der Betreiber:
   * "bei Duos und Trios oder Squads, was auch immer". Allein ist, wer als
   * Letzter des Teams uebrig ist: ab dem Tod (oder dem Knock, der dazu
   * fuehrte) des vorletzten Mitspielers. Was das Team danach noch holt, hat
   * er allein geholt.
   */
  for (const [nr, ps] of teams) {
    if (ps.length < 2) continue;
    const zeit = (p) => (typeof tod.get(p.Id) === 'number' ? tod.get(p.Id) : Infinity);
    const reihe = [...ps].sort((x, y) => zeit(x) - zeit(y));
    const letzter = reihe[reihe.length - 1];
    const vorletzter = reihe[reihe.length - 2];
    // Zwei oder mehr ueberlebten - niemand war allein.
    if (zeit(vorletzter) === Infinity) continue;
    let t = zeit(vorletzter);
    const kn = knock.get(vorletzter.Id);
    if (typeof kn === 'number' && kn < t && t - kn < 90) t = kn;
    if (zeit(letzter) - t < 1) continue; // praktisch gemeinsam
    const lebend = [...teamAus.values()].filter((z) => z > t).length; // inkl. dieses Teams
    const elimsBis = (elimsVon.get(nr) ?? []).filter((z) => z <= t).length;
    const elimsEnde = (elimsVon.get(nr) ?? []).length;
    const platzEnde = ps.map((p) => p.Placement).find((x) => typeof x === 'number') ?? null;
    const dann = punkte(wertung, lebend, elimsBis);
    const ende = punkte(wertung, platzEnde, elimsEnde);
    const clutch = Math.max(0, ende - dann);
    if (clutch > 0) raus.set(String(letzter.EpicId).toLowerCase(), clutch);
  }
  return raus;
}

/*
 * Solo Clutch Points nach der Regel des Betreibers (29.9.2026), aus der
 * Ausgabe des eigenen Lesers (tools/replay-voll):
 *
 *   "wie du siehst, einer ist gefinished oder nicht ... dann alle Punkte,
 *   die er in der Zeitspanne macht, wo der, der gefinished wurde, nicht
 *   wieder revived [ist], hat sein Mate gemacht. Wenn er dann im Endgame
 *   revived wurde und sie dann weiter zusammenspielen, hat er trotzdem die
 *   Punkte solo."
 *
 * Allein ist ein Spieler, solange er lebt und alle Mitspieler endgueltig
 * ausgeschieden sind (ein Knock zaehlt nicht) - vom Finish des Letzten bis
 * zu dessen Reboot (neue Figur), bis zum eigenen Ausscheiden oder bis zum
 * Ende. Je solcher Spanne zaehlt, was das Team in ihr dazugewinnt: der
 * Platz, den es beim Ausscheiden am Ende der Spanne haette, statt dessen am
 * Anfang, und die Elims dazwischen - nach der Wertungstabelle des Tages.
 * Mehrere Spannen (sterben, Reboot, wieder sterben) zaehlen zusammen.
 */
export function clutchAusVoll(voll, wertung, art = {}) {
  // art (nur fuer den Abgleich, scripts/clutch-varianten.mjs): abKnock - allein
  // schon ab dem Knock, der zum Tod fuehrte; ohneReboot - eine Spanne endet nie
  // an einem Reboot; nurElims / nurPlatz - nur ein Teil der Punkte.
  const raus = new Map();
  if (!wertung?.length || !voll?.spieler?.length) return raus;
  const bus = typeof voll.busAb === 'number' ? voll.busAb : 0;
  const spieler = voll.spieler.filter((p) => p && p.team !== undefined && p.team !== null);
  const nachId = new Map(spieler.map((p) => [p.id, p]));
  const hinzu = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };

  const tode = new Map();
  const letzterKnock = new Map();
  for (const f of voll.feed ?? []) {
    if (f.opfer === undefined || (f.t ?? 0) < bus) continue;
    if (f.art === 'unten') letzterKnock.set(f.opfer, f.t);
    if (f.art !== 'tot') continue;
    // Ab dem Knock, der zu diesem Tod fuehrte (hoechstens 90 s davor).
    const kn = letzterKnock.get(f.opfer);
    hinzu(tode, f.opfer, art.abKnock && typeof kn === 'number' && f.t - kn < 90 ? kn : f.t);
  }
  const figuren = new Map();
  for (const f of voll.figuren ?? []) if (f.t >= bus) hinzu(figuren, f.id, f.t);
  /*
   * Eine "neue Figur" kurz nach dem Tod ist kein Reboot.
   *
   * Der Leser meldet bei einem Ausscheiden oft eine neue Figur ein bis zwei
   * Sekunden spaeter (39 solche Faelle an den beiden Globals-Tagen). Echte
   * Reboots liegen dagegen mindestens zwanzig Sekunden nach dem Tod (58
   * Faelle, nichts dazwischen) - Karte holen, zum Reboot-Van laufen,
   * herunterzaehlen. Die Phantome beendeten die Spanne, in der ein Spieler
   * allein war, nach einer Sekunde: Nxthan fehlten an Globals Tag 1 so
   * 36 von 84 Punkten (Match 6: Platz 50 -> 14 und drei Kills allein). Mit
   * der Aufteilung von eucompetitive (Platzierung 68, Kills 16, drei
   * Spiele) nachgemessen.
   */
  for (const [id, liste] of figuren) {
    const t = tode.get(id) ?? [];
    figuren.set(id, liste.filter((z) => !t.some((d) => z - d >= -0.01 && z - d < 10)));
  }
  // Ohne Reboots: je Spieler nur die erste Figur nach dem Bus.
  if (art.ohneReboot) for (const [k, l] of figuren) figuren.set(k, l.slice(0, 1));
  for (const l of [...tode.values(), ...figuren.values()]) l.sort((a, b) => a - b);

  /** Wann ein Spieler lebt: je Figur vom Erscheinen bis zum naechsten Tod. */
  const leben = new Map();
  for (const p of spieler) {
    const starts = figuren.get(p.id)?.length ? figuren.get(p.id) : [bus];
    const t = tode.get(p.id) ?? [];
    const abschnitte = [];
    for (const s of starts) {
      if (abschnitte.length && s < abschnitte[abschnitte.length - 1][1]) continue; // noch dieselbe Figur
      const ende = t.find((d) => d >= s);
      abschnitte.push([s, ende ?? Infinity]);
    }
    leben.set(p.id, abschnitte);
  }
  const lebtUm = (id, t) => (leben.get(id) ?? []).some(([a, b]) => t >= a && t < b);

  const teams = new Map();
  for (const p of spieler) hinzu(teams, p.team, p);
  /** Wann ein Team ganz ausgeschieden ist: der erste Tod, nach dem keiner mehr lebt. */
  const teamAus = new Map();
  /*
   * Ausgeschieden ist ein Team, wenn sein Letzter stirbt - der spaeteste
   * letzte Tod seiner Mitglieder. Das haengt nicht an den Figuren des
   * Lesers, die bei etwa drei von hundert Reboots fehlen (35 Faelle an den
   * beiden Globals-Tagen: ein Spieler stirbt, wird rebootet, der Leser meldet
   * keine neue Figur - Nxthan, Match 6, drei Kills danach). Gewinner haben
   * kein Ende (Platz 1).
   */
  const letzterTod = new Map();
  for (const p of spieler) { const t = tode.get(p.id); letzterTod.set(p.id, t?.length ? t[t.length - 1] : null); }
  const endplatzVorab = (ps) => ps.map((p) => p.platz).find((x) => typeof x === 'number' && x > 0);
  for (const [nr, ps] of teams) {
    if (endplatzVorab(ps) === 1) { teamAus.set(nr, Infinity); continue; }
    const zeiten = ps.filter((p) => !p.bot).map((p) => letzterTod.get(p.id));
    if (zeiten.length && zeiten.every((z) => typeof z === 'number')) { teamAus.set(nr, Math.max(...zeiten)); continue; }
    // Ohne Tod bei jedem Mitglied: die alte Ableitung aus den Figuren.
    const kandidaten = ps.flatMap((p) => tode.get(p.id) ?? []).sort((a, b) => a - b);
    const aus = kandidaten.find((d) => ps.every((p) => !lebtUm(p.id, d + 0.01)));
    teamAus.set(nr, aus ?? Infinity);
  }
  /*
   * Welchen Platz das Team bekaeme, schiede es jetzt aus.
   *
   * Nicht durch Zaehlen der noch lebenden Teams: wer im Sturm stirbt, steht
   * nicht immer als Eliminierung im Kill-Feed, und solche Teams galten dann
   * bis zum Schluss als lebend - der Platzgewinn einer Spanne fiel zu klein
   * aus. Das Replay nennt aber den Endplatz jedes Teams, und die Plaetze
   * werden in der Reihenfolge des Ausscheidens vergeben: wer als Naechster
   * ausscheidet, bekommt den Platz vor dem zuletzt ausgeschiedenen Team.
   */
  const endplatz = new Map();
  for (const [nr, ps] of teams) {
    const pl = ps.map((p) => p.platz).find((x) => typeof x === 'number' && x > 0);
    if (pl) endplatz.set(nr, pl);
  }
  const teamZahl = Math.max(teams.size, ...endplatz.values());
  const platzBei = (nr, t) => {
    let letzter = teamZahl + 1;
    for (const [n, z] of teamAus) {
      if (n === nr || z > t) continue;
      const pl = endplatz.get(n);
      if (pl && pl < letzter) letzter = pl;
    }
    return Math.max(1, letzter - 1);
  };

  /*
   * Endgueltige Elims echter Gegner je Team, mit Zeit.
   *
   * Eine Elimination gehoert dem, der den Gegner niedergeschossen hat - auch
   * wenn ein anderer ihn beendet oder er verblutet. Nur ohne vorherigen Knock
   * zaehlt der Schuetze des Todes. Das ist Epics eigene Zaehlung: an der
   * Division 1 Week 2 Final (EU) stimmen die Team-Eliminationen der
   * Bestenliste mit dieser Regel bei 24 von 49 Teams genau und bei 42 auf
   * eine Elimination, mit "nur der Schuetze" bei 6 und 14. Gegen die
   * Kill-Punkte von eucompetitive (Globals Tag 1 und 2, 188 Spieler) trifft
   * sie 137-mal, "nur der Schuetze" 129-mal. Der Elim zaehlt zur Zeit des
   * Todes; zur Zeit des Knocks gerechnet trifft sie nur 127-mal.
   */
  const elims = new Map();
  const matchEnde = Math.max(bus, ...(voll.feed ?? []).map((f) => f.t ?? 0));
  const knockVon = new Map();
  for (const f of voll.feed ?? []) {
    if ((f.t ?? 0) < bus) continue;
    if (f.art === 'unten') { if (f.taeter !== undefined && f.taeter !== null) knockVon.set(f.opfer, { t: f.t, taeter: f.taeter }); continue; }
    if (f.art === 'auf') { knockVon.delete(f.opfer); continue; }
    if (f.art !== 'tot') continue;
    const opfer = nachId.get(f.opfer);
    const k = knockVon.get(f.opfer);
    knockVon.delete(f.opfer);
    if (!opfer || opfer.bot) continue;
    const knocker = k ? nachId.get(k.taeter) : null;
    const schuetze = nachId.get(f.taeter);
    const zaehlt = (art.nurSchuetze ? null : (knocker && knocker.team !== opfer.team ? knocker : null))
      ?? (schuetze && schuetze.team !== opfer.team ? schuetze : null);
    if (zaehlt) hinzu(elims, zaehlt.team, f.t);
  }

  for (const [nr, ps] of teams) {
    if (ps.length < 2) continue;
    const eigene = (elims.get(nr) ?? []).sort((a, b) => a - b);
    const ende = teamAus.get(nr);
    for (const x of ps) {
      if (x.bot || !x.epic) continue;
      const andere = ps.filter((p) => p !== x);
      // Die Zeitpunkte, an denen sich etwas aendert.
      const punkteListe = [...new Set([bus, ...ps.flatMap((p) => (leben.get(p.id) ?? []).flat())]
        .filter((z) => Number.isFinite(z)))].sort((a, b) => a - b);
      const spannen = [];
      for (let i = 0; i < punkteListe.length; i++) {
        const a = punkteListe[i]; const b = punkteListe[i + 1] ?? Infinity;
        const mitte = Number.isFinite(b) ? (a + b) / 2 : a + 1;
        const allein = lebtUm(x.id, mitte) && andere.every((p) => !lebtUm(p.id, mitte));
        if (!allein) continue;
        const letzte = spannen[spannen.length - 1];
        if (letzte && letzte[1] === a) letzte[1] = b; else spannen.push([a, b]);
      }
      /*
       * Die letzte Spanne ergibt sich aus den letzten Toden, nicht aus den
       * Figuren: ab dem Zeitpunkt, an dem der letzte Mitspieler endgueltig
       * ausgeschieden ist, bis das Team ausscheidet (oder gewinnt), ist x
       * allein - sonst haette das Team nicht weitergespielt.
       */
      const eigenerTod = letzterTod.get(x.id);
      const andereTode = andere.map((p) => letzterTod.get(p.id));
      if (typeof eigenerTod === 'number' && andereTode.every((z) => typeof z === 'number')) {
        const startEnde = Math.max(...andereTode);
        const endeX = Number.isFinite(ende) ? ende : Infinity;
        if (eigenerTod >= endeX - 0.01 && eigenerTod - startEnde >= 1 && Number.isFinite(endeX)) {
          // Alles, was diese Spanne schon abdeckt, geht darin auf.
          const rest = spannen.filter(([a2, b2]) => b2 <= startEnde + 0.01 || a2 >= endeX - 0.01);
          rest.push([startEnde, endeX]);
          rest.sort((u, v) => u[0] - v[0]);
          spannen.length = 0; spannen.push(...rest);
        }
      } else if (endplatz.get(nr) === 1 && andereTode.every((z) => typeof z === 'number')) {
        // Gewinner: ab dem letzten Tod des Mitspielers allein bis zum Ende.
        const startEnde = Math.max(...andereTode);
        const rest = spannen.filter(([, b2]) => b2 <= startEnde + 0.01);
        rest.push([startEnde, Infinity]);
        spannen.length = 0; spannen.push(...rest);
      }
      /*
       * Allein zaehlt nur die letzte Spanne: ab dem Tod des letzten
       * Mitspielers, bis das Team ausscheidet oder gewinnt. Eine Zeit, in der
       * der Mitspieler spaeter wieder rebootet wird, ist kein Solo. Gegen die
       * Solo-Zeit von eucompetitive (Globals Tag 1 und 2, 188 Spieler)
       * gemessen: 175 treffen auf 15 Sekunden, mit den Zwischenspannen 127.
       */
      if (!art.mitZwischenspannen) {
        const endeX2 = Number.isFinite(ende) ? ende : Infinity;
        const rest = spannen.filter(([, b2]) => b2 >= endeX2 - 0.01 || !Number.isFinite(b2));
        spannen.length = 0; spannen.push(...rest);
      }
      let summe = 0;
      for (const [a, b] of spannen) {
        // Solo-Zeit: Dauer der Spanne; offen (Sieger) bis zum letzten Ereignis des Matches.
        if (art.solo) {
          const bis = Number.isFinite(b) ? b : matchEnde;
          if (bis > a) art.solo.set(String(x.epic).toLowerCase(), (art.solo.get(String(x.epic).toLowerCase()) ?? 0) + (bis - a));
        }
        const vorher = eigene.filter((z) => z < a).length;
        const danach = eigene.filter((z) => z < b).length;
        const platzA = platzBei(nr, a);
        // Endet die Spanne mit dem Ausscheiden des Teams (oder dem Sieg), gilt
        // der Endplatz aus dem Replay.
        const platzB = b >= ende || !Number.isFinite(b) ? (endplatz.get(nr) ?? (Number.isFinite(ende) ? platzBei(nr, ende) : 1)) : platzBei(nr, b);
        if (art.protokoll && String(x.name ?? '').toLowerCase().includes(art.protokoll)) {
          console.log(`      ${x.name}: allein ${a.toFixed(0)}-${Number.isFinite(b) ? b.toFixed(0) : 'Ende'}, Platz ${platzA} -> ${platzB}, Elims ${vorher} -> ${danach}, Endplatz ${endplatz.get(nr)}`);
        }
        const gewinn = art.nurElims ? punkte(wertung, null, danach) - punkte(wertung, null, vorher)
          : art.nurPlatz ? punkte(wertung, platzB, 0) - punkte(wertung, platzA, 0)
            : punkte(wertung, platzB, danach) - punkte(wertung, platzA, vorher);
        summe += Math.max(0, gewinn);
      }
      if (summe > 0) raus.set(String(x.epic).toLowerCase(), summe);
    }
  }
  return raus;
}
