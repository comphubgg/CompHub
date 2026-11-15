/*
 * Der Abschnitt "How we count" der Seite /how-it-works (bis 15.11.2026 eine eigene Seite /how-we-count, die jetzt dorthin umleitet).
 *
 * Der Text je Sprache vollstaendig (wie Datenschutz und Nutzungsbedingungen, app/components/RechtsSeite): eine Erklaerung wird als Ganzes gelesen.
 *
 * Woher jede Aussage stammt - wer eine Rechnung aendert, aendert hier den Satz mit:
 *   Quellen        app/api/spieler-detail/route.ts (Kopf), app/api/cup-spieler/route.ts (ausSzene: LAN ohne Replays)
 *   Eliminations   lib/vollSchaden.mjs killsAusZaehler (nur Kill-Zaehler, bis zum Aus des Teams nach seinen Zeitstempeln); app/api/cup-spieler (killsEcht nur bei ganz gelesenen Spielen,
 *                  sonst Kill-Feed); app/events/[id]/SpielerDetail.tsx kills() (Solo: Epics Bestenliste)
 *   K/D            SpielerDetail.tsx 'K/D Ratio'
 *   Time Alive     app/api/cup-stats lebenOhneUeberlappung (lib/epicCups)
 *   Damage         tools/replay-voll/Program.cs SchadenLeser (selbst, eigenes Team, Nicht-Figuren raus; Wirksam: Kappung beim Knock/Kill), lib/vollSchaden.mjs
 *                  (ohne Boden), app/api/spieler-detail (Solo: Epics Schaden)
 *   Damage Taken   app/api/cup-stats 'Most Damage Taken (incl. Storm)' = Epics damageTaken; Damage Ratio = Schaden / Schaden von Spielern
 *   Knocks         Kill-Feed, art 'unten' (scripts/replays-aggregieren.mjs, scripts/eigene-auswerten.mjs)
 *   Accuracy       SpielerDetail.tsx 'Player Accuracy'; Schuesse Program.cs (je 2 s das Groessere aus Munition und Einschlaegen)
 *   Builds Placed  app/api/cup-spieler (selbst gesetzte Teile, ohne ersetzte, nur wenn jedes Spiel sie hat); Program.cs BuildingReplacementType
 *   Time in Storm  Program.cs bIsInAnyStorm, ab Busstart bis Tod oder Ende
 *   Zeitpunkt      app/components/SpielerStatsUebersicht.tsx ("Noch nicht fertig"), app/events/[id]/SpielerDetail.tsx (Zwischenstaende)
 * Mats Farmed und Distance Traveled stehen hier (noch) nicht (Betreiber, 15.11.2026) - sie kommen dazu, sobald sie nachweislich genau sind.
 */

type Quelle = 'epic' | 'replay' | 'beide';
interface Wert { name: string; quelle: Quelle; text: string }
interface Gruppe { titel: string; werte: Wert[] }
export interface ZaehlText {
  titel: string; stand: string; einleitung: string;
  quellenTitel: string; epicTitel: string; epicText: string; replayTitel: string; replayText: string; lanText: string;
  marke: Record<Quelle, string>;
  gruppen: Gruppe[];
  fehltText: string;
  zeitTitel: string; zeitAbsaetze: string[];
  fehlerTitel: string; fehlerText: string; mailVor: string; discordVor: string; discordKanal: string; fehlerSchluss: string;
}

export const MAIL = 'contact@thecomphub.com';

export const ZAEHLEN_EN: ZaehlText = {
  titel: 'How we count',
  stand: 'Last updated: 15 November 2026',
  einleitung: 'Every number in Player Stats comes from one of two places: Epic\'s official tournament leaderboard, or the match replays, '
    + 'which we read ourselves with our own replay reader. Here is what each stat counts and where it comes from.',
  quellenTitel: 'Where the numbers come from',
  epicTitel: 'Epic\'s official leaderboard',
  epicText: 'Placements, points, wins, team eliminations and time alive. In solo cups also eliminations and damage.',
  replayTitel: 'Match replays',
  replayText: 'Everything else, per player: eliminations in team cups, knocks, deaths, damage, hits, headshots, shots, builds and time in storm.',
  lanText: 'LAN events have no replays. There, per-player values come from a public community stats archive.',
  marke: { epic: 'Epic', replay: 'Replay', beide: 'Epic + Replay' },
  gruppen: [
    {
      titel: 'Results',
      werte: [
        { name: 'Points & Placement', quelle: 'epic', text: 'Straight from Epic\'s leaderboard, including the split into placement points and elimination points.' },
        { name: 'Wins', quelle: 'epic', text: 'Victory Royales as Epic\'s leaderboard lists them.' },
        { name: 'Eliminations', quelle: 'beide', text: 'In solo cups: Epic\'s official count. In team cups: the game\'s own kill counter from the replay, '
          + 'when every match of the player has been fully read; otherwise the replay\'s kill feed. Like Epic, only eliminations up to the moment the '
          + 'whole team is out count, and the kill feed does not top the counter up (it also lists bot kills, which Epic does not count).' },
        { name: 'K/D', quelle: 'beide', text: 'Eliminations divided by deaths. When every match is fully read, deaths come from the replay, so in Reload '
          + 'every death counts. Otherwise deaths are the matches without a win; in Reload cups K/D is then left out, because players can die more than once per match.' },
        { name: 'Time Alive', quelle: 'epic', text: 'Epic\'s time from the leaderboard. If two of a player\'s matches overlap in time, the overlap is counted once.' },
      ],
    },
    {
      titel: 'Combat',
      werte: [
        { name: 'Damage To Players', quelle: 'beide', text: 'Damage you deal to other players\' shield and health. The knock or elimination shot only counts '
          + 'up to what the opponent had left (health + shield + overshield). Storm, builds, traps, self-damage, teammates and hits on already knocked '
          + 'players are not included. In solo cups we show Epic\'s official value.' },
        { name: 'Damage From Players', quelle: 'replay', text: 'Damage you take from opponents\' hits, counted the same way. No storm, no fall damage, '
          + 'no self- or team damage, and no hits taken while you are knocked.' },
        { name: 'Damage Taken (incl. Storm)', quelle: 'epic', text: 'Epic\'s own "damage received" figure. It includes storm damage, which is why it can be '
          + 'much higher than Damage From Players. We show both, each under its own name.' },
        { name: 'Damage Ratio', quelle: 'beide', text: 'Damage To Players divided by Damage From Players.' },
        { name: 'Knocks', quelle: 'replay', text: 'How often you knocked an opponent, from the replay\'s kill feed.' },
        { name: 'Hits To Players', quelle: 'replay', text: 'Your hits on opponents. Hits on yourself, teammates and builds don\'t count.' },
        { name: 'Headshots', quelle: 'replay', text: 'Hits on opponents that the game itself marks as critical hits.' },
        { name: 'Player Accuracy', quelle: 'replay', text: 'Hits To Players divided by shots. Shots are read from the ammo leaving the magazine, or from '
          + 'the weapon\'s impacts where the ammo count is missing; in each two-second window the higher of the two counts.' },
      ],
    },
    {
      titel: 'Building & Movement',
      werte: [
        { name: 'Builds Placed', quelle: 'replay', text: 'Wood, stone and metal pieces you placed yourself. A piece that replaces an existing one doesn\'t '
          + 'count. Only shown once every match of the player has this value.' },
        { name: 'Time in Storm', quelle: 'replay', text: 'Time spent inside the storm, read from the game\'s own "in storm" flag in the replay, from the '
          + 'moment the bus starts until you are eliminated or the match ends.' },
      ],
    },
  ],
  fehltText: 'Not every stat on the site is listed here, only the ones whose definition we can state exactly.',
  zeitTitel: 'When stats appear',
  zeitAbsaetze: [
    'We read each match\'s replay once Epic makes it available. While a cup is running or its replays are still being read, replay-based numbers '
    + 'are interim values: they grow with every analysed match, and Player Stats shows a "Not final yet" notice with how many matches have been analysed.',
    'Eliminations, knocks and deaths can appear before damage and the other replay stats. Until all of a player\'s matches are read, damage, hits '
    + 'and headshots only show for players whose matches are all read.',
  ],
  fehlerTitel: 'Found a number that looks wrong?',
  fehlerText: 'Send us the match: the cup, the player and the game number if you have it.',
  mailVor: 'Email',
  discordVor: 'or post in',
  discordKanal: '#give-feedback on our Discord',
  fehlerSchluss: 'and we\'ll look into it.',
};

export const ZAEHLEN_DE: ZaehlText = {
  titel: 'So zählen wir',
  stand: 'Stand: 15. November 2026',
  einleitung: 'Jede Zahl in den Spieler-Stats kommt aus einer von zwei Quellen: aus Epics offizieller Turnier-Bestenliste oder aus den Match-Replays, '
    + 'die wir mit unserem eigenen Replay-Leser selbst auswerten. Hier steht, was jeder Wert zählt und woher er kommt.',
  quellenTitel: 'Woher die Zahlen kommen',
  epicTitel: 'Epics offizielle Bestenliste',
  epicText: 'Platzierungen, Punkte, Siege, Team-Eliminierungen und Überlebenszeit. In Solo-Cups auch Eliminierungen und Schaden.',
  replayTitel: 'Match-Replays',
  replayText: 'Alles Weitere, je Spieler: Eliminierungen in Team-Cups, Knocks, Tode, Schaden, Treffer, Kopftreffer, Schüsse, Bauteile und Zeit im Sturm.',
  lanText: 'Bei LAN-Events gibt es keine Replays. Dort kommen die Werte je Spieler aus einem öffentlichen Statistik-Archiv der Szene.',
  marke: { epic: 'Epic', replay: 'Replay', beide: 'Epic + Replay' },
  gruppen: [
    {
      titel: 'Ergebnisse',
      werte: [
        { name: 'Punkte & Platzierung', quelle: 'epic', text: 'Direkt aus Epics Bestenliste, samt Aufteilung in Platzierungs- und Eliminierungspunkte.' },
        { name: 'Siege', quelle: 'epic', text: 'Victory Royales, wie Epics Bestenliste sie führt.' },
        { name: 'Eliminierungen', quelle: 'beide', text: 'In Solo-Cups: Epics offizielle Zahl. In Team-Cups: der Kill-Zähler des Spiels aus dem Replay, '
          + 'wenn jedes Match des Spielers voll gelesen ist; sonst der Kill-Feed des Replays. Verpasst der Kill-Zähler ein Update, füllt der Kill-Feed '
          + 'die Lücke, aber nur bis zur Summe des Teams, damit eine Eliminierung im Team nie doppelt zählt.' },
        { name: 'K/D', quelle: 'beide', text: 'Eliminierungen geteilt durch Tode. Ist jedes Match voll gelesen, kommen die Tode aus dem Replay, im Reload zählt '
          + 'also jeder Tod. Sonst gelten die Matches ohne Sieg als Tode; in Reload-Cups fehlt K/D dann, weil man dort mehrmals je Match sterben kann.' },
        { name: 'Überlebenszeit', quelle: 'epic', text: 'Epics Zeit aus der Bestenliste. Überschneiden sich zwei Matches eines Spielers zeitlich, zählt die Überschneidung einmal.' },
      ],
    },
    {
      titel: 'Kampf',
      werte: [
        { name: 'Schaden an Spielern', quelle: 'beide', text: 'Schaden, den du am Schild und Leben anderer Spieler machst. Der Knock- oder Eliminierungsschuss '
          + 'zählt nur so viel, wie der Gegner noch hatte (Leben + Schild + Overshield). Sturm, Bauteile, Fallen, Eigenschaden, Mitspieler und Treffer '
          + 'auf schon umgehauene Spieler zählen nicht. In Solo-Cups zeigen wir Epics offiziellen Wert.' },
        { name: 'Schaden von Spielern', quelle: 'replay', text: 'Schaden, den du durch Treffer von Gegnern nimmst, genauso gezählt. Kein Sturm, kein Fallschaden, '
          + 'kein Eigen- oder Teamschaden und keine Treffer, während du umgehauen bist.' },
        { name: 'Erlittener Schaden (inkl. Sturm)', quelle: 'epic', text: 'Epics eigener Wert für erlittenen Schaden. Er enthält Sturmschaden und kann deshalb '
          + 'deutlich höher sein als „Schaden von Spielern“. Wir zeigen beide, jeden unter eigenem Namen.' },
        { name: 'Schadensquote', quelle: 'beide', text: 'Schaden an Spielern geteilt durch Schaden von Spielern.' },
        { name: 'Knocks', quelle: 'replay', text: 'Wie oft du einen Gegner umgehauen hast, aus dem Kill-Feed des Replays.' },
        { name: 'Treffer an Spielern', quelle: 'replay', text: 'Deine Treffer auf Gegner. Treffer auf dich selbst, Mitspieler und Bauteile zählen nicht.' },
        { name: 'Kopftreffer', quelle: 'replay', text: 'Treffer auf Gegner, die das Spiel selbst als kritische Treffer markiert.' },
        { name: 'Genauigkeit', quelle: 'replay', text: 'Treffer an Spielern geteilt durch Schüsse. Schüsse werden aus der Munition gelesen, die das Magazin '
          + 'verlässt, oder aus den Einschlägen der Waffe, wo der Munitionsstand fehlt; je zwei Sekunden zählt der größere der beiden Werte.' },
      ],
    },
    {
      titel: 'Bauen & Bewegung',
      werte: [
        { name: 'Gesetzte Bauteile', quelle: 'replay', text: 'Holz-, Stein- und Metallteile, die du selbst gesetzt hast. Ein Teil, das ein bestehendes ersetzt, '
          + 'zählt nicht. Steht erst da, wenn jedes Match des Spielers diesen Wert hat.' },
        { name: 'Zeit im Sturm', quelle: 'replay', text: 'Zeit im Sturm, gelesen aus der Sturm-Markierung des Spiels im Replay, vom Start des Busses bis zu '
          + 'deinem Ausscheiden oder dem Ende des Matches.' },
      ],
    },
  ],
  fehltText: 'Nicht jeder Wert der Seite steht hier, nur die, deren Rechnung wir genau angeben können.',
  zeitTitel: 'Wann die Werte erscheinen',
  zeitAbsaetze: [
    'Wir lesen das Replay jedes Matches, sobald Epic es bereitstellt. Solange ein Cup läuft oder seine Replays noch gelesen werden, sind die Werte aus '
    + 'den Replays Zwischenstände: Sie wachsen mit jedem ausgewerteten Match, und die Spieler-Stats zeigen den Hinweis „Noch nicht fertig“ mit der Zahl '
    + 'der ausgewerteten Matches.',
    'Eliminierungen, Knocks und Tode können vor Schaden und den übrigen Replay-Werten erscheinen. Bis alle Matches eines Spielers gelesen sind, stehen '
    + 'Schaden, Treffer und Kopftreffer nur bei Spielern, deren Matches alle gelesen sind.',
  ],
  fehlerTitel: 'Eine Zahl sieht falsch aus?',
  fehlerText: 'Schick uns das Match: den Cup, den Spieler und, wenn du sie hast, die Nummer des Games.',
  mailVor: 'Per E-Mail an',
  discordVor: 'oder in',
  discordKanal: '#give-feedback auf unserem Discord',
  fehlerSchluss: '– wir sehen es uns an.',
};

export const MARKE_STIL: Record<Quelle, string> = {
  epic: 'border-zinc-700 text-slate-300',
  replay: 'border-sky-500/40 text-sky-300',
  beide: 'border-zinc-700 text-slate-400',
};

/** Der Inhalt des Abschnitts - Ueberschrift und Rahmen setzt die Seite (SoFunktioniertEs.tsx). */
export function ZaehlInhalt({ text }: { text: ZaehlText }) {
  return (
    <>
      <p className="mt-3 text-sm leading-relaxed">{text.einleitung}</p>

      <h3 className="mt-6 text-base font-semibold text-slate-100">{text.quellenTitel}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-sm font-semibold text-slate-100">{text.epicTitel}</p>
          <p className="mt-1.5 text-sm leading-relaxed">{text.epicText}</p>
        </div>
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
          <p className="text-sm font-semibold text-sky-300">{text.replayTitel}</p>
          <p className="mt-1.5 text-sm leading-relaxed">{text.replayText}</p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">{text.lanText}</p>

      {text.gruppen.map((g) => (
        <div key={g.titel} className="mt-8">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{g.titel}</h3>
          <div className="mt-3 divide-y divide-zinc-800/80 rounded-xl border border-zinc-800 bg-zinc-900/30">
            {g.werte.map((w) => (
              <div key={w.name} className="px-4 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <h4 className="text-sm font-semibold text-slate-100">{w.name}</h4>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${MARKE_STIL[w.quelle]}`}>
                    {text.marke[w.quelle]}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">{w.text}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="mt-3 text-xs text-slate-500">{text.fehltText}</p>

      <h3 className="mt-8 text-base font-semibold text-slate-100">{text.zeitTitel}</h3>
      {text.zeitAbsaetze.map((p) => <p key={p} className="mt-3 text-sm leading-relaxed">{p}</p>)}
    </>
  );
}
