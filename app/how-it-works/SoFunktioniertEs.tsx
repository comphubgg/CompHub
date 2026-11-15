'use client';

import Link from 'next/link';
import { useSprache } from '@/app/components/SprachProvider';
import { useDiscordEinladung } from '@/app/components/DiscordKnopf';
import Fusszeile from '@/app/components/Fusszeile';
import { ZAEHLEN_DE, ZAEHLEN_EN, ZaehlInhalt, MAIL } from './Zaehlen';

/*
 * How it works - je Abschnitt eine Marke (#...) und eine kurze, ueberfliegbare Erklaerung. Aufbau und Optik wie How we count / RechtsSeite.
 *
 * Woher jede Aussage stammt - wer etwas daran aendert, aendert hier den Satz mit:
 *   how-we-get-the-stats   app/api/spieler-detail, app/api/cup-spieler (LAN ohne Replays: Archiv der Szene), Zaehlen.tsx (Zeitpunkt), tools/replay-voll/Program.cs
 *                          (Kopf: Epic haelt ein Replay 31 Tage, die Auswertung bleibt)
 *   replays                tools/replay-voll/Program.cs, app/replays/ReplayAnsicht.tsx (2D/3D, Zone, Kill-Feed, Todesursache als Waffenart), SpielerEbene.tsx
 *                          (Orte, Leben, Schild, Waffe in der Hand, Treffer, Loot), app/replays/meine (Meine Replays mit verifiziertem Epic-Konto)
 *   how-we-count           Zaehlen.tsx (unveraendert)
 *   power-rankings         lib/powerRankings.ts (Epics eine weltweite Liste, TERMIN_STUNDEN), app/components/RanglisteNeu.tsx (10.000 Plaetze, Podest, Spruenge,
 *                          Laender der Top 100, Hoechstwert)
 *   statistics             app/statistics: KonstanzKarte + scripts/spieler-kreis.mjs (Note), Aufsteiger, Vergleich (ab C5S3), ProfilFncs, ProfilVerlauf,
 *                          Organisationen, RueckblickBild
 *   streams                app/streams/page.tsx (Ordner, Live-Status von Twitch, Titelfilter, Benachrichtigung, POV), Multiview.tsx
 *   fncs                   app/fncs/FncsSeite.tsx, app/globals-solos/SolosSeite.tsx (Landepunkte nur, wo eine Quelle sie fuehrt; Brasilien/Asien ohne)
 *   predictions            app/api/qualifikation/route.ts (Schwelle, Schnitt der letzten 3 Ausgaben, Vorlagen, Anteil, Lernen aus 6, live alle 15 s,
 *                          30 min Nachlauf, Hochrechnung ueber KURVEN + Gewicht gegen die Vorab-Prognose, nie unter der Grenze), app/predictions/Tippen.tsx (Call the Final)
 *   maps                   app/tournament-maps/page.tsx, app/api/maps-karte (Day 1 / Day 2 / Combined, Formen des Admins), app/maps
 *   overlays-discord       app/overlays (VipVorhang), lib/discordStats.ts (/stats, /cup, /help), lib/discordEpicKonto.ts (/link-account: nur Konto-Id und Name)
 * Keine anderen Seiten oder Marken als Quelle oder Vergleich nennen (Betreiber, 15.11.2026).
 */

interface Abschnitt {
  id: string;
  titel: string;
  absaetze?: string[];
  punkte?: string[];
  /** Absaetze unter der Liste. */
  nachher?: string[];
  video?: string;
  link?: { href: string; text: string };
}

interface Text {
  titel: string; stand: string; einleitung: string; inhalt: string;
  videoTitel: Record<string, string>;
  abschnitte: Abschnitt[];
}

const EN: Text = {
  titel: 'How it works',
  stand: 'Last updated: 15 November 2026',
  einleitung: 'Where CompHub\'s numbers come from, how we read the match replays, how each stat is counted, and what every part of the site shows.',
  inhalt: 'On this page',
  videoTitel: {
    'hiw-stats-agent': 'CompHub stats',
    'hiw-match-replays': 'Match replays',
    'hiw-prediction': 'Predictions',
  },
  abschnitte: [
    {
      id: 'how-we-get-the-stats',
      titel: 'How we get the stats',
      punkte: [
        'Epic\'s official tournament leaderboard: placements, points, wins, team eliminations and time alive. In solo cups also eliminations and damage.',
        'Match replays: everything else per player, read with our own replay reader (see below).',
        'LAN events have no replays. There, per-player values come from a public community stats archive.',
      ],
      nachher: [
        'We read each match\'s replay as soon as Epic makes it available, and we aim to have every number on the site as fast as possible. '
        + 'While a cup is still being read, replay-based stats are interim values and are marked as such.',
        'Epic keeps a replay for 31 days. What we extracted from it stays with us after that.',
      ],
      video: 'hiw-stats-agent',
    },
    {
      id: 'replays',
      titel: 'How we analyse replays',
      absaetze: [
        'We read Epic\'s server replays with our own replay reader. From every analysed game we extract:',
      ],
      punkte: [
        'The zones: centre, size and when each one starts and stops shrinking.',
        'The kill feed: every knock and elimination with time, place and weapon type.',
        'Every player with team, placement, and the time and place they were eliminated.',
        'Hits and damage: who hit whom, how much, headshots, and whether it hit the shield.',
        'Player positions as the replay records them, health and shield over time, and the item in hand.',
        'Loot picked up and dropped, builds placed and time in storm.',
      ],
      link: { href: '/replays', text: 'Replays →' },
    },
    {
      id: 'replay-viewer',
      titel: 'The replay viewer',
      punkte: [
        'Each analysed game has its own page with a permanent link.',
        '2D map with a timeline: zone, eliminations, knocks and players alive play along with the time. Zoom with the mouse wheel, drag to move, hover a marker for the player.',
        '3D view: the same map tilted back, with the zone as a wall and eliminations as posts. It is not an in-game camera.',
        'My Replays: sign in with your verified Epic account to see the analysed games of cups you played, with your team highlighted.',
      ],
      video: 'hiw-match-replays',
    },
    {
      id: 'how-we-count',
      titel: 'How we count',
    },
    {
      id: 'power-rankings',
      titel: 'Power Rankings',
      absaetze: [
        'This is Epic\'s own Power Ranking. We don\'t compute the scores; we show Epic\'s list with up to 10,000 places, refreshed several times a day so that '
        + 'renamed players show up with their new name.',
        'Epic runs a single worldwide list, so there are no region tabs. You see each player\'s score and highest score, the change since Epic\'s last update, '
        + 'the biggest jumps and the countries of the top 100.',
      ],
      link: { href: '/power-rankings', text: 'Power Rankings →' },
    },
    {
      id: 'statistics',
      titel: 'Statistics & player pages',
      punkte: [
        'Season leaderboards and each player\'s cup results, with the stats from the sections above.',
        'FNCS tab: every FNCS final of the player with teammates, including the ones they did not qualify for, plus best, worst and average placement.',
        'Progression over the player\'s tournaments: the last 12 or all of them, with or without big events.',
        'Consistency rating, our own: based on the last 20 cups. Each placement counts relative to the size of the field, regions are weighted, and '
        + 'the worst fifth is dropped. Players without enough cups get no rating.',
        'Climbers and Fallers: the last 10 cups compared with the 10 before.',
        'Compare two players, duos or trios, by season or all time (from Chapter 5 Season 3, the first season with per-match values).',
        'Organizations, and a season recap image of a player to share.',
      ],
      link: { href: '/statistics', text: 'Statistics →' },
    },
    {
      id: 'streams',
      titel: 'Streams',
      punkte: [
        'Competitive Fortnite streamers sorted into folders, with their live status from Twitch.',
        'Opens a live stream for you, filters by stream title (e.g. "LCQ"), and can notify you in the browser when a streamer goes live.',
        'Multiview to watch several streams at once, with chat and favourites.',
      ],
      link: { href: '/streams', text: 'Streams →' },
    },
    {
      id: 'fncs',
      titel: 'FNCS & FNCS Solos',
      punkte: [
        'FNCS: every final (Grand Finals, Global Championship, Invitational, Summit) as a card with the podium, points and earnings. Day 1 and Day 2 count as one event. '
        + 'Filter by LAN or online, view as board or timeline.',
        'All-Time Stats: who had the most eliminations in the Grand Finals.',
        'FNCS Solos: the path to the Grand Final (qualifiers, heats, fast tracks, last chance) with the state of every stage. For each stage: leaderboard, players, '
        + 'countries and the drop map, plus who qualified and the prize pool.',
        'Results come from Epic\'s leaderboards. Drop spots come from public tournament drop-map data, where it exists for a region; where it doesn\'t, the page says so.',
      ],
      link: { href: '/fncs', text: 'FNCS →' },
    },
    {
      id: 'predictions',
      titel: 'Predictions',
      absaetze: [
        'Epic says how many players advance (for example "Top 300"), but not how many points that takes. Our qualification line predicts it:',
      ],
      punkte: [
        'Before the cup: the points at that rank in the last editions of the same cup and round (up to three), shown one by one, so you can check them.',
        'No earlier edition? Then the best match we have: another heat of the same event that was already played, an earlier day of the same round, or similar cups '
        + '(same type, team size, mode and region). If the field size differs, the same share of the field counts, not the same rank.',
        'It learns: after every cup we store what we predicted and what it really took, and the average error of the last six cups of the same kind corrects the next prediction.',
        'During the cup: the live points at that rank, refreshed every 15 seconds.',
        'Mid-cup lock: once about 60% of the games are played, the live line is projected to all games once and then stays fixed, so it doesn\'t jump with every game. '
        + 'If the earlier prediction was within 3%, it stays.',
        'After the cup: the real result. It counts as final 30 minutes after the end.',
      ],
      video: 'hiw-prediction',
      link: { href: '/predictions', text: 'Predictions →' },
    },
    {
      id: 'call-the-final',
      titel: 'Call the Final',
      absaetze: [
        'On the predictions page you can make your own call for a final: put the players in your order and pick an MVP. Your call stays in your browser, and with an '
        + 'account also there. Once the result is in, you see how close you were.',
      ],
    },
    {
      id: 'maps',
      titel: 'Drop maps & Tournament maps',
      punkte: [
        'Tournament Maps: the maps of competitive cups by chapter and season, filterable by FNCS, Performance, Division, Reload and region, marked Ended, Live or Upcoming.',
        'Each map shows the drop spots and the players on them, with country and photo, and their placements. Two-day finals have Day 1, Day 2 and Combined.',
        'Drop spots come from public tournament drop-map data; where it has none, some spots are added by our team.',
      ],
      link: { href: '/tournament-maps', text: 'Tournament Maps →' },
    },
    {
      id: 'overlays-discord',
      titel: 'Overlays & Discord bot',
      punkte: [
        'Overlays (VIP): stream overlays for OBS, such as leaderboard, timer, qual line and team card.',
        'Discord /stats: a player\'s recent results and season record, with a link to the profile. /cup shows the top ten of a cup, /help lists the commands.',
        '/link-account connects your Discord to your Epic account through the official Epic sign-in. CompHub only learns your Epic account ID and display name. '
        + '/unlink-account removes the link.',
      ],
      link: { href: '/overlays', text: 'Overlays →' },
    },
  ],
};

const DE: Text = {
  titel: 'So funktioniert es',
  stand: 'Stand: 15. November 2026',
  einleitung: 'Woher die Zahlen von CompHub kommen, wie wir die Match-Replays lesen, wie jeder Wert gezählt wird und was jeder Teil der Seite zeigt.',
  inhalt: 'Auf dieser Seite',
  videoTitel: {
    'hiw-stats-agent': 'CompHub-Stats',
    'hiw-match-replays': 'Match-Replays',
    'hiw-prediction': 'Prognosen',
  },
  abschnitte: [
    {
      id: 'how-we-get-the-stats',
      titel: 'Woher die Stats kommen',
      punkte: [
        'Epics offizielle Turnier-Bestenliste: Platzierungen, Punkte, Siege, Team-Eliminierungen und Überlebenszeit. In Solo-Cups auch Eliminierungen und Schaden.',
        'Match-Replays: alles Weitere je Spieler, gelesen mit unserem eigenen Replay-Leser (siehe unten).',
        'Bei LAN-Events gibt es keine Replays. Dort kommen die Werte je Spieler aus einem öffentlichen Statistik-Archiv der Szene.',
      ],
      nachher: [
        'Wir lesen das Replay jedes Matches, sobald Epic es bereitstellt, und wollen jede Zahl so schnell wie möglich auf der Seite haben. '
        + 'Solange ein Cup noch gelesen wird, sind die Werte aus den Replays Zwischenstände und als solche markiert.',
        'Epic hält ein Replay 31 Tage. Was wir daraus gelesen haben, bleibt danach bei uns.',
      ],
      video: 'hiw-stats-agent',
    },
    {
      id: 'replays',
      titel: 'Wie wir Replays auswerten',
      absaetze: [
        'Wir lesen Epics Server-Replays mit unserem eigenen Replay-Leser. Aus jedem ausgewerteten Game holen wir:',
      ],
      punkte: [
        'Die Zonen: Mitte, Größe und wann jede zu schrumpfen beginnt und aufhört.',
        'Den Kill-Feed: jeder Knock und jede Eliminierung mit Zeit, Ort und Waffenart.',
        'Jeden Spieler mit Team, Platz sowie Zeit und Ort seines Ausscheidens.',
        'Treffer und Schaden: wer wen getroffen hat, wie viel, Kopftreffer und ob es den Schild traf.',
        'Die Positionen der Spieler, so wie das Replay sie führt, Leben und Schild über die Zeit und den Gegenstand in der Hand.',
        'Aufgehobenen und fallen gelassenen Loot, gesetzte Bauteile und die Zeit im Sturm.',
      ],
      link: { href: '/replays', text: 'Replays →' },
    },
    {
      id: 'replay-viewer',
      titel: 'Die Replay-Ansicht',
      punkte: [
        'Jedes ausgewertete Game hat eine eigene Seite mit einer dauerhaften Adresse.',
        '2D-Karte mit Zeitleiste: Zone, Eliminierungen, Knocks und die Zahl der Lebenden laufen mit der Zeit. Mausrad zum Zoomen, Ziehen zum Verschieben, über ein Zeichen fahren zeigt den Spieler.',
        '3D-Ansicht: dieselbe Karte nach hinten gekippt, die Zone als Wand und die Eliminierungen als Pfosten. Das ist keine Kamera im Spiel.',
        'Meine Replays: Mit deinem verifizierten Epic-Konto siehst du die ausgewerteten Games der Cups, die du gespielt hast, mit deinem Team markiert.',
      ],
      video: 'hiw-match-replays',
    },
    {
      id: 'how-we-count',
      titel: 'So zählen wir',
    },
    {
      id: 'power-rankings',
      titel: 'Power Rankings',
      absaetze: [
        'Das ist Epics eigenes Power Ranking. Die Wertung rechnen nicht wir; wir zeigen Epics Liste mit bis zu 10.000 Plätzen, mehrmals am Tag erneuert, damit '
        + 'umbenannte Spieler mit ihrem neuen Namen erscheinen.',
        'Epic führt eine einzige weltweite Liste, deshalb gibt es keine Regionsreiter. Du siehst Wertung und Höchstwert jedes Spielers, die Veränderung seit '
        + 'Epics letzter Fortschreibung, die größten Sprünge und die Länder der Top 100.',
      ],
      link: { href: '/power-rankings', text: 'Power Rankings →' },
    },
    {
      id: 'statistics',
      titel: 'Statistiken & Spielerseiten',
      punkte: [
        'Bestenlisten der Saison und die Cup-Ergebnisse jedes Spielers, mit den Werten aus den Abschnitten oben.',
        'Reiter FNCS: jedes FNCS-Finale des Spielers mit Mitspielern, auch die, für die er sich nicht qualifiziert hat, dazu bester, schlechtester und durchschnittlicher Platz.',
        'Verlauf über die Turniere des Spielers: die letzten 12 oder alle, mit oder ohne große Events.',
        'Konstanz-Rating, unsere eigene Rechnung: aus den letzten 20 Cups. Jede Platzierung zählt nach der Größe des Feldes, die Regionen sind gewichtet, '
        + 'das schlechteste Fünftel fällt weg. Wer zu wenige Cups hat, bekommt kein Rating.',
        'Aufsteiger und Absteiger: die letzten 10 Cups im Vergleich mit den 10 davor.',
        'Vergleich zweier Spieler, Duos oder Trios, nach Saison oder All-Time (ab Chapter 5 Season 3, der ersten Saison mit Werten je Match).',
        'Organisationen und ein Saisonrückblick als Bild zum Teilen.',
      ],
      link: { href: '/statistics', text: 'Statistiken →' },
    },
    {
      id: 'streams',
      titel: 'Streams',
      punkte: [
        'Streamer der kompetitiven Fortnite-Szene in Ordnern, mit ihrem Live-Status von Twitch.',
        'Öffnet für dich einen laufenden Stream, filtert nach dem Titel des Streams (z. B. „LCQ“) und kann dich im Browser benachrichtigen, wenn ein Streamer live geht.',
        'Multiview, um mehrere Streams zugleich zu sehen, mit Chat und Favoriten.',
      ],
      link: { href: '/streams', text: 'Streams →' },
    },
    {
      id: 'fncs',
      titel: 'FNCS & FNCS Solos',
      punkte: [
        'FNCS: jedes Finale (Grand Finals, Global Championship, Invitational, Summit) als Karte mit Siegertreppchen, Punkten und Preisgeld. Day 1 und Day 2 sind ein Event. '
        + 'Filter LAN oder Online, Ansicht als Board oder Timeline.',
        'All-Time Stats: wer in den Grand Finals die meisten Eliminierungen hatte.',
        'FNCS Solos: der Weg ins Grand Final (Qualifier, Heats, Fast Tracks, Last Chance) mit dem Stand jeder Stufe. Je Stufe: Bestenliste, Spieler, Länder und '
        + 'die Drop-Map, dazu, wer qualifiziert ist, und das Preisgeld.',
        'Die Ergebnisse kommen aus Epics Bestenlisten. Die Landepunkte aus öffentlichen Drop-Map-Daten von Turnieren, wo es sie für eine Region gibt; wo nicht, steht das dort.',
      ],
      link: { href: '/fncs', text: 'FNCS →' },
    },
    {
      id: 'predictions',
      titel: 'Prognosen',
      absaetze: [
        'Epic sagt, wie viele weiterkommen (zum Beispiel „Top 300“), aber nicht, wie viele Punkte es dafür braucht. Unsere Qualifikationslinie sagt es voraus:',
      ],
      punkte: [
        'Vor dem Cup: die Punkte auf diesem Platz in den letzten Ausgaben desselben Cups und derselben Runde (bis zu drei), einzeln angezeigt, damit du sie prüfen kannst.',
        'Keine frühere Ausgabe? Dann die beste Vorlage, die es gibt: ein schon gespielter Heat desselben Events, ein früherer Tag derselben Runde oder ähnliche Cups '
        + '(gleiche Art, Teamgröße, Modus und Region). Ist das Feld anders groß, zählt derselbe Anteil des Feldes, nicht derselbe Platz.',
        'Sie lernt: Nach jedem Cup halten wir fest, was wir vorhergesagt haben und was es wirklich brauchte; der mittlere Fehler der letzten sechs Cups derselben Art korrigiert die nächste Prognose.',
        'Während des Cups: die Punkte auf diesem Platz live, alle 15 Sekunden neu.',
        'Nachstellen während des Cups: Die Linie von jetzt wird über den Verlauf ähnlicher Cups hochgerechnet (wie weit war die Linie dort an derselben Stelle) '
        + 'und mit der Vorab-Prognose gewichtet - je weiter der Cup, desto stärker zählt die Hochrechnung. Nie unter der Linie von jetzt; woraus die Zahl besteht, steht darunter.',
        'Nach dem Cup: das echte Ergebnis. Es gilt 30 Minuten nach dem Ende als fertig.',
      ],
      video: 'hiw-prediction',
      link: { href: '/predictions', text: 'Prognosen →' },
    },
    {
      id: 'call-the-final',
      titel: 'Call the Final',
      absaetze: [
        'Auf der Prognosen-Seite tippst du selbst auf ein Finale: die Spieler in deine Reihenfolge bringen und einen MVP wählen. Der Tipp bleibt in deinem Browser '
        + 'und, mit Konto, auch dort. Steht das Ergebnis fest, siehst du, wie nah du lagst.',
      ],
    },
    {
      id: 'maps',
      titel: 'Drop-Maps & Turnierkarten',
      punkte: [
        'Turnierkarten: die Karten der Cups nach Kapitel und Saison, filterbar nach FNCS, Performance, Division, Reload und Region, markiert als beendet, live oder kommend.',
        'Jede Karte zeigt die Landepunkte und die Spieler darauf, mit Land und Foto, und ihre Platzierungen. Finals an zwei Tagen haben Day 1, Day 2 und Combined.',
        'Die Landepunkte kommen aus öffentlichen Drop-Map-Daten von Turnieren; wo es dort keine gibt, trägt unser Team manche selbst ein.',
      ],
      link: { href: '/tournament-maps', text: 'Turnierkarten →' },
    },
    {
      id: 'overlays-discord',
      titel: 'Overlays & Discord-Bot',
      punkte: [
        'Overlays (VIP): Overlays für den Stream in OBS, etwa Bestenliste, Timer, Qual-Linie und Teamkarte.',
        'Discord /stats: die letzten Ergebnisse und die Saisonbilanz eines Spielers, mit Link zum Profil. /cup zeigt die ersten zehn eines Cups, /help die Befehle.',
        '/link-account verbindet dein Discord mit deinem Epic-Konto über die offizielle Epic-Anmeldung. CompHub erfährt dabei nur deine Epic-Konto-ID und deinen Anzeigenamen. '
        + '/unlink-account hebt die Verbindung auf.',
      ],
      link: { href: '/overlays', text: 'Overlays →' },
    },
  ],
};

function Video({ name, titel }: { name: string; titel: string }) {
  return (
    <figure className="mt-5 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
      <video controls preload="none" playsInline poster={`/media/${name}.jpg`} className="aspect-video w-full bg-black" aria-label={titel}>
        <source src={`/media/${name}.mp4`} type="video/mp4" />
      </video>
      <figcaption className="px-4 py-2 text-xs text-slate-500">{titel}</figcaption>
    </figure>
  );
}

export default function SoFunktioniertEs({ videos }: { videos: string[] }) {
  const { sprache } = useSprache();
  const de = sprache === 'de';
  const text = de ? DE : EN;
  const zaehlen = de ? ZAEHLEN_DE : ZAEHLEN_EN;
  const discord = useDiscordEinladung();
  return (
    <>
      <main className="flex-1 bg-zinc-950 px-4 py-12 text-slate-300">
        <article className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-slate-50">{text.titel}</h1>
          <p className="mt-2 text-xs text-slate-500">{text.stand}</p>
          <p className="mt-6 text-sm leading-relaxed">{text.einleitung}</p>

          <nav aria-label={text.inhalt} className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{text.inhalt}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {text.abschnitte.map((a) => (
                <li key={a.id}>
                  <a href={`#${a.id}`} className="inline-block rounded-full border border-zinc-800 px-3 py-1 text-xs text-slate-300 transition hover:border-sky-500 hover:text-sky-400">
                    {a.titel}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {text.abschnitte.map((a) => (
            <section key={a.id} id={a.id} className="mt-12 scroll-mt-24">
              <h2 className="text-lg font-semibold text-slate-100">
                <a href={`#${a.id}`} className="hover:text-sky-400">{a.titel}</a>
              </h2>
              {a.id === 'how-we-count' ? <ZaehlInhalt text={zaehlen} /> : (
                <>
                  {a.absaetze?.map((p) => <p key={p} className="mt-3 text-sm leading-relaxed">{p}</p>)}
                  {a.punkte && (
                    <ul className="mt-3 divide-y divide-zinc-800/80 rounded-xl border border-zinc-800 bg-zinc-900/30">
                      {a.punkte.map((p) => <li key={p} className="px-4 py-3 text-sm leading-relaxed text-slate-400">{p}</li>)}
                    </ul>
                  )}
                  {a.nachher?.map((p) => <p key={p} className="mt-3 text-sm leading-relaxed">{p}</p>)}
                </>
              )}
              {a.video && videos.includes(a.video) && <Video name={a.video} titel={text.videoTitel[a.video]} />}
              {a.link && (
                <p className="mt-3 text-xs">
                  <Link href={a.link.href} className="text-sky-400 hover:text-sky-300">{a.link.text}</Link>
                </p>
              )}
            </section>
          ))}

          <section className="mt-12 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="text-lg font-semibold text-slate-100">{zaehlen.fehlerTitel}</h2>
            <p className="mt-2 text-sm leading-relaxed">
              {zaehlen.fehlerText}{' '}
              {zaehlen.mailVor}{' '}
              <a href={`mailto:${MAIL}`} className="text-sky-400 hover:text-sky-300">{MAIL}</a>{' '}
              {zaehlen.discordVor}{' '}
              <a href={discord} target="_blank" rel="noreferrer" className="text-sky-400 hover:text-sky-300">{zaehlen.discordKanal}</a>{' '}
              {zaehlen.fehlerSchluss}
            </p>
          </section>

          <p className="mt-12 border-t border-zinc-900 pt-6 text-xs text-slate-500">
            <Link href="/statistics" className="text-sky-400 hover:text-sky-300">{de ? 'Statistiken →' : 'Statistics →'}</Link>
            {' · '}
            <Link href="/" className="text-slate-500 hover:text-sky-400">CompHub</Link>
          </p>
        </article>
      </main>
      <Fusszeile />
    </>
  );
}
