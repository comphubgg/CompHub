// Die Werte je Spieler aus einem voll gelesenen Replay (tools/replay-voll) - herausgeloest aus scripts/clutch-berechnen.mjs (8.11.2026), damit die
// Auswertung der eigenen Lobbys (scripts/eigene-auswerten.mjs) genau dieselben Zahlen bekommt wie das volle Auslesen.

export const neueWerte = () => ({ dmg: 0, dmgAlle: 0, erlitten: 0, treffer: 0, krit: 0, sturm: 0, wiederbelebt: 0, rebootet: 0,
  bauHolz: 0, bauStein: 0, bauMetall: 0, bauWand: 0, bauBoden: 0, bauTreppe: 0, bauDach: 0, bauSpiele: 0 });

// Nur fuer den Abgleich (scripts/abgleich-heilung.mjs): Varianten der Heilregel per Umgebungsvariable, im Betrieb aus.
const heilTest = () => (typeof process !== 'undefined' ? process.env.HEIL_REGEL || '' : '');
function heilTestWeg(a, t, p, roh) {
  const [art, fenster] = heilTest().split(':'); const f = Number(fenster || 2);
  const elims = (roh.feed ?? []).filter((e) => e.taeter === p.id && e.opfer !== p.id && (e.art === 'tot' || e.art === 'unten') && e.ursache !== 50).map((e) => e.t);
  const nachElim = elims.some((x) => t - x >= -0.3 && t - x <= f);
  if (art === 'ohneSiphon') return nachElim;
  if (art === 'ohneRegen') return a <= 5.01;
  if (art === 'ohneSiphonGross') return nachElim && a > 5.01;
  return false;
}

export function schadenAus(roh) {
  if (!roh) return null;
  try {
    const epicVon = new Map((roh.spieler ?? []).map((p) => [p.id, p.epic]));
    const raus = {};
    for (const s of roh.schaden ?? []) {
      const k = epicVon.get(s.id);
      if (!k) continue;
      /*
       * Wie Osirion (8.11.2026, elf Matches des Betreibers Wert fuer Wert): kein Schaden auf Umgehauene, der Knock- und Kill-Schuss nur bis zu Leben + Schild + Overshield
       * des Gegners (Leser, Wirksam) - Damage to Players 0 bis 1 Punkt je Match daneben, Damage from Players ebenso ohne die Treffer im Knock.
       */
      raus[k] = { dmg: s.gemachtOhneBoden ?? s.gemacht, dmgOhneBoden: s.gemachtOhneBoden ?? s.gemacht, dmgAlle: s.gemacht, erlitten: s.genommenOhneBoden ?? s.genommen, treffer: s.treffer, krit: s.krit, sturm: 0, wiederbelebt: 0, rebootet: 0 };
    }
    // Zeit im Sturm, Wiederbelebungen und Reboots (Leser, Feld zusatz; gegen die Szene-Werte an vier Finals geprueft). Nur, wo der Leser sie fuehrt.
    for (const z of roh.zusatz ?? []) {
      const k = epicVon.get(z.id);
      if (!k) continue;
      const d = raus[k] ??= neueWerte();
      d.sturm += Number.isFinite(z.sturmSek) && z.sturmSek < 3600 ? z.sturmSek : 0; d.wiederbelebt += z.wiederbelebt ?? 0; d.rebootet += z.rebootet ?? 0;
    }
    // Die Werte, die Osirion zeigt, soweit der Strom sie hergibt (7.11.2026, an den vier Spielen des Performance-Finales gegen Osirion geprueft).
    for (const p of roh.spieler ?? []) {
      if (p.bot || !p.epic) continue;
      const d = raus[p.epic] ??= neueWerte();
      const x = roh.extra?.[p.id];
      if (x) { d.editZahl = (d.editZahl ?? 0) + x[2]; d.editSek = (d.editSek ?? 0) + x[3]; }
      // Aus dem Inventar (tools/replay-voll, InventarAbschliessen). invSpiele zaehlt mit: wer auch Spiele ohne diese Werte hat, bekommt keine halben Summen angezeigt.
      /*
       * Elims und Deaths wie Osirion (Performance-Finale, alle drei Spieler exakt): Deaths sind die Tode ausser Wiederbelebungen; im gewonnenen Spiel zaehlt ein Eintrag ohne Ursache nicht, das ist
       * das Spielende. Elims ist KillScore bis das ganze Team raus ist, was danach kommt, fuehrt Osirion als "Player Eliminations (After Out)". K/D ist Elims durch Deaths.
       */
      if (roh.killVerlauf) {
        const todeVon = (q) => (roh.feed ?? []).filter((e) => e.opfer === q.id && e.art === 'tot' && e.ursache !== 50 && ((q.platz ?? 99) > 1 || e.ursache != null));
        d.todeEcht = (d.todeEcht ?? 0) + todeVon(p).length;
        const teamTode = (p.platz ?? 99) > 1 ? (roh.spieler ?? []).filter((q) => q.team === p.team).flatMap(todeVon).map((e) => e.t) : [];
        const aus = teamTode.length ? Math.max(...teamTode) : Infinity;
        let bisAus = 0; let alle = 0;
        for (const [t, k] of roh.killVerlauf[p.id] ?? []) { alle = k; if (t <= aus + 0.2) bisAus = k; }
        d.killsEcht = (d.killsEcht ?? 0) + bisAus;
        d.killsNachAus = (d.killsNachAus ?? 0) + alle - bisAus;
      }
      if (x?.length >= 19) { d.busDank = (d.busDank ?? 0) + x[18]; if (!roh.sturmVerlauf) d.sturmSchaden = (d.sturmSchaden ?? 0) + x[17]; }
      /*
       * Sturmschaden: Lebenspunkte, die im Sturm verloren gehen, je Schritt hoechstens 15; trifft im selben Moment ein Schuss, war es der Schuss. Am Boden zaehlt nichts.
       * Performance-Finale: 630 / 627 / 420 zu Osirions 640 / 648 / 440. Was fehlt, sind Ticks, die mit einer Heilung im selben Update ankamen.
       */
      if (roh.sturmVerlauf) {
        const zeiten = roh.sturmVerlauf.filter((s) => s[0] === p.id).sort((a, b) => a[1] - b[1] || a[2] - b[2]);
        const im = []; let ab = null;
        for (const [, t, an] of zeiten) { if (an && ab === null) ab = t; else if (!an && ab !== null) { im.push([ab, t]); ab = null; } }
        if (ab !== null) im.push([ab, Infinity]);
        const getroffen = (roh.treffer ?? []).filter((h) => h[2] === p.id).map((h) => h[0]);
        // Ab dem Bus, mit dem Wert davor - sonst fehlt der erste Schritt (je Spiel genau ein Tick).
        const alleL = roh.leben?.[p.id] ?? []; const ersterL = alleL.findIndex((s) => s[0] >= (roh.busAb ?? 0));
        const spur = ersterL < 0 ? [] : alleL.slice(Math.max(0, ersterL - 1));
        let sturm = 0;
        for (let i = 1; i < spur.length; i += 1) {
          const [t, nach] = spur[i]; const vor = spur[i - 1][1]; const weg = vor - nach;
          if (weg <= 0 || weg > 15 || nach === 100) continue;
          if (!im.some(([a, b]) => t >= a && t <= b)) continue;
          if (getroffen.some((h) => h >= t && h <= t + 0.05)) continue;
          sturm += weg;
        }
        d.sturmSchaden = (d.sturmSchaden ?? 0) + sturm;
      }
      if (x?.length >= 17) {
        d.invSpiele = (d.invSpiele ?? 0) + 1;
        [['samHolz', 6], ['samStein', 7], ['samMetall', 8], ['farmHolz', 9], ['farmStein', 10], ['farmMetall', 11], ['schussEcht', 12], ['editOk', 13], ['selbstHolz', 14], ['selbstStein', 15], ['selbstMetall', 16]]
          .forEach(([k, i]) => { d[k] = (d[k] ?? 0) + x[i]; });
      }
      /*
       * Schild: exakt, der Verlauf steht offen im Strom (tools/replay-voll, ReceiveProperties). Performance-Finale: Shield Taken 1.113,3 / 1.245,3 / 1.131,7 zu Osirions 1.113 / 1.245 / 1.131,
       * Shield Healed ebenso. Gezaehlt ab 0 beim Bus; Werte ueber 100 vor dem ersten echten Stand sind Reste aus der Lobby.
       */
      const schildSpur = (roh.schild?.[p.id] ?? []).filter((s) => s[0] >= (roh.busAb ?? 0) && s[0] <= (Number.isFinite(roh.ende) ? roh.ende : Infinity));
      if (roh.schild) {
        let stand = 0; let begonnen = false;
        for (const [, w] of schildSpur) {
          if (!begonnen && w > 100) continue;
          begonnen = true;
          if (w > stand) d.schildHeilEcht = (d.schildHeilEcht ?? 0) + w - stand; else d.schildWegEcht = (d.schildWegEcht ?? 0) + stand - w;
          stand = w;
        }
      }
      /*
       * Leben: ein einzelner Sprung auf 100 ist der Knock (das Bodenleben), kein Heilen; was davor noch da war, ging verloren. Am Boden zaehlt nichts, bis jemand einen aufhebt.
       * Finale: geheilt 461 / 553 / 582 zu Osirions 386 / 508 / 550, verloren 746 / 785 / 914 zu 766 / 868 / 932 - hier fehlt noch eine Regel.
       */
      // Nur bis zum Spielende: nach dem Sieg heilt man noch, das zaehlt Osirion nicht (Darm, Spiel 4: 75 Punkte nach 1.834,5 s; damit Health Healed exakt 386).
      const spielEnde = Number.isFinite(roh.ende) ? roh.ende : Infinity;
      const alleLeben = roh.leben?.[p.id] ?? []; const ersterLeben = alleLeben.findIndex((s) => s[0] >= (roh.busAb ?? 0));
      const l = (ersterLeben < 0 ? [] : alleLeben.slice(Math.max(0, ersterLeben - 1))).filter((s) => s[0] <= spielEnde);
      const aufgehoben = (roh.feed ?? []).filter((e) => e.opfer === p.id && e.art === 'tot' && e.ursache === 50).map((e) => e.t);
      /*
       * Ein Sprung auf 100 ist entweder der Tod (Reload: man kommt mit 100 zurueck) oder - nur in Team-Modi - das Umhauen. Beides ist keine Heilung; was davor noch
       * da war, ging verloren. Danach zaehlt nichts, bis der Spieler zurueck ist (Kill-Feed Ursache 50). Im Solo gibt es kein Umhauen: ein Sprung ohne Tod ist
       * echte Heilung (8.11.2026, FNCS Solo Reload: bei Focus zaehlte nach dem ersten Tod gar nichts mehr - 1.008 statt Osirions 2.237).
       */
      const tode = (roh.feed ?? []).filter((e) => e.opfer === p.id && e.art === 'tot' && e.ursache !== 50).map((e) => e.t);
      const imTeam = (roh.spieler ?? []).filter((q) => q.team === p.team).length > 1;
      /*
       * Umgehauen nur, wenn der Kill-Feed es sagt (8.11.2026): bisher galt im Team jeder Sprung auf 100 als Knock - auch ein Medkit oder Verband, der voll heilt. Danach
       * wartete die Zaehlung bis zur naechsten Rueckkehr ins Spiel, und alle Heilungen dazwischen fehlten (ME-Cup: 721 und 838 zu Osirions 1.087 und 1.320).
       */
      const knocks = (roh.feed ?? []).filter((e) => e.opfer === p.id && e.art === 'unten').map((e) => e.t);
      const eigeneKills = (roh.feed ?? []).filter((e) => e.taeter === p.id && e.opfer !== p.id && (e.art === 'tot' || e.art === 'unten') && e.ursache !== 50).map((e) => e.t);
      const aufgestanden = (roh.feed ?? []).filter((e) => e.opfer === p.id && e.art === 'auf').map((e) => e.t);
      let wegBis = null;
      for (let i = 1; i < l.length; i += 1) {
        const a = l[i][1] - l[i - 1][1]; const t = l[i][0];
        if (wegBis !== null) { if (t >= wegBis - 0.6) wegBis = null; continue; }
        if (l[i][1] === 100 && a >= 11) {
          const tod = tode.find((x) => Math.abs(x - t) <= 1.5);
          const knock = imTeam ? knocks.find((x) => Math.abs(x - t) <= 1.5) : undefined;
          if (tod !== undefined || knock !== undefined) {
            d.lebenWeg = (d.lebenWeg ?? 0) + l[i - 1][1];
            const ab = tod ?? knock ?? t;
            // Nach dem Tod bis zur Rueckkehr ins Spiel; nach einem Knock bis zum Aufstehen, zur Rueckkehr oder zum Tod.
            const ende = tod !== undefined ? aufgehoben : [...aufgehoben, ...aufgestanden, ...tode].sort((x, y) => x - y);
            wegBis = ende.find((x) => x >= ab - 0.6) ?? Infinity;
            continue;
          }
        }
        // Die Rueckkehr ins Spiel (Reload) setzt das Leben neu - auch das ist keine Heilung.
        if (a >= 11 && aufgehoben.some((x) => Math.abs(x - t) <= 1.5)) continue;
        /*
         * Siphon (Leben im Moment des eigenen Kills oder Knocks) ist keine Heilung - so zaehlt Osirion: FNCS Solo Reload, Focus, 10 Matches 2.234 zu Osirions 2.237
         * (vorher 2.551, +14 %). Gemessen ab 0,3 s vor bis 0,5 s nach dem Feed-Eintrag; ein Fenster von 1 s ergab schon -4,8 %.
         */
        if (a > 0 && eigeneKills.some((x) => t - x >= -0.3 && t - x <= 0.5)) continue;
        if (a > 0 && heilTest() && heilTestWeg(a, t, p, roh)) continue;
        if (a > 0) d.heilHp = (d.heilHp ?? 0) + a; else d.lebenWeg = (d.lebenWeg ?? 0) - a;
      }
      // Der Schild steht nicht im Strom. Was an Schild verloren ging, liegt nah am Geheilten (1.262 zu 1.247 bei Darm).
      for (const t of roh.treffer ?? []) if (t[2] === p.id && t[7]) d.schildWeg = (d.schildWeg ?? 0) + t[3];
      // Schuesse: Einschlaege mit einer Waffe in der Hand; mit der Spitzhacke sind es Farm-Schlaege.
      const hand = roh.hand?.[p.id] ?? [];
      let k = 0;
      for (const s of roh.schuesse ?? []) {
        if (s[1] !== p.id) continue;
        while (k + 1 < hand.length && hand[k + 1][0] <= s[0]) k += 1;
        const name = roh.waffenNamen?.[hand[k]?.[1]] ?? '';
        if (/Pickaxe|Melee/i.test(name)) d.axt = (d.axt ?? 0) + 1;
        else if (!/BuildingTool|EditingTool|Consumable/i.test(name)) d.schuss = (d.schuss ?? 0) + 1;
      }
    }
    const jeTeam = new Map();
    for (const p of roh.spieler ?? []) if (!p.bot && p.epic) jeTeam.set(p.team, [...(jeTeam.get(p.team) ?? []), p.epic]);
    for (const b of roh.bau ?? []) {
      const leute = jeTeam.get(b.team) ?? [];
      // Im Team sagt das Replay nicht, wer gebaut hat: die Summe des Teams steht bei jedem Mitglied als team* (Team-Kasten der Stats, 7.11.2026).
      if (leute.length > 1) {
        for (const id of leute) {
          const d = raus[id] ??= neueWerte();
          d.teamHolz = (d.teamHolz ?? 0) + b.holz; d.teamStein = (d.teamStein ?? 0) + b.stein; d.teamMetall = (d.teamMetall ?? 0) + b.metall;
        }
        continue;
      }
      if (leute.length !== 1) continue;
      const d = raus[leute[0]] ??= neueWerte();
      d.bauHolz = (d.bauHolz ?? 0) + b.holz; d.bauStein = (d.bauStein ?? 0) + b.stein; d.bauMetall = (d.bauMetall ?? 0) + b.metall;
      d.bauWand = (d.bauWand ?? 0) + b.wand; d.bauBoden = (d.bauBoden ?? 0) + b.boden; d.bauTreppe = (d.bauTreppe ?? 0) + b.treppe; d.bauDach = (d.bauDach ?? 0) + b.dach;
      d.bauSpiele = (d.bauSpiele ?? 0) + 1;
    }
    return raus;
  } catch (e) { console.log(`    Schaden: ${String(e.message).slice(0, 120)}`); return null; }
}
