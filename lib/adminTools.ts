import { bereichVonPfad } from '@/lib/rechte';

/*
 * Every admin tool, in one list (operator, 18.11.2026: the pill bar on top of the admin pages overflowed and the card grid on /admin did not contain
 * everything - "a new admin panel where everything is clearly reachable").
 *
 * The sidebar of every /admin page (app/admin/AdminSeitenleiste.tsx), its search, "Recently used" and the card grid on /admin?bereich=admin
 * (app/admin/AdminZentrale.tsx) all read THIS list. A new admin page goes in here and nowhere else - then it is in the sidebar, the cards and the search
 * at once.
 *
 * Texts are German like the rest of the site; the English versions stand in app/lib/spracheAdmin.ts (or sprache.ts when used outside /admin).
 *
 *   manager: true   - a manager could already see this tile before (filtered by his ticked area, lib/rechte, when the path has one).
 *                     Everything else is admin only - non-admins see nothing new.
 *   nurLeiste: true - navigation inside the dashboard itself; in the sidebar, not as a card.
 *   zaehler         - a badge with a count, from an API that already provides it.
 *   unter           - further paths that belong to this tool (sub pages), for the "active" highlight.
 */

export type AdminGruppeId = 'dashboard' | 'inhalte' | 'spieler' | 'daten' | 'live' | 'nutzer' | 'post';

export interface AdminGruppe {
  id: AdminGruppeId; titel: string;
  /** Tailwind classes: the dot, the heading, the card hover and the active sidebar entry. */
  punkt: string; titelFarbe: string; kachel: string; aktiv: string;
}

export interface AdminWerkzeug {
  href: string; titel: string; text: string; gruppe: AdminGruppeId;
  /** Extra words the search should find (English and German synonyms, old names). */
  stichworte?: string;
  manager?: boolean; nurLeiste?: boolean; zaehler?: 'kontakt'; unter?: string[];
}

export const ADMIN_GRUPPEN: AdminGruppe[] = [
  { id: 'dashboard', titel: 'Dashboard', punkt: 'bg-slate-400', titelFarbe: 'text-slate-300',
    kachel: 'hover:border-slate-500/70 hover:bg-white/[0.04]', aktiv: 'bg-white/[0.08] text-white' },
  { id: 'inhalte', titel: 'Inhalte', punkt: 'bg-sky-400', titelFarbe: 'text-sky-300',
    kachel: 'hover:border-sky-500/70 hover:bg-sky-500/[0.06]', aktiv: 'bg-sky-500/15 text-sky-200' },
  { id: 'spieler', titel: 'Spieler & Teams', punkt: 'bg-emerald-400', titelFarbe: 'text-emerald-300',
    kachel: 'hover:border-emerald-500/70 hover:bg-emerald-500/[0.06]', aktiv: 'bg-emerald-500/15 text-emerald-200' },
  { id: 'daten', titel: 'Daten & Replays', punkt: 'bg-amber-400', titelFarbe: 'text-amber-300',
    kachel: 'hover:border-amber-500/70 hover:bg-amber-500/[0.06]', aktiv: 'bg-amber-500/15 text-amber-200' },
  { id: 'live', titel: 'Live & Cups', punkt: 'bg-orange-400', titelFarbe: 'text-orange-300',
    kachel: 'hover:border-orange-500/70 hover:bg-orange-500/[0.06]', aktiv: 'bg-orange-500/15 text-orange-200' },
  { id: 'nutzer', titel: 'Nutzer & Zugang', punkt: 'bg-violet-400', titelFarbe: 'text-violet-300',
    kachel: 'hover:border-violet-500/70 hover:bg-violet-500/[0.06]', aktiv: 'bg-violet-500/15 text-violet-200' },
  { id: 'post', titel: 'Posteingang', punkt: 'bg-rose-400', titelFarbe: 'text-rose-300',
    kachel: 'hover:border-rose-500/70 hover:bg-rose-500/[0.06]', aktiv: 'bg-rose-500/15 text-rose-200' },
];

export const ADMIN_WERKZEUGE: AdminWerkzeug[] = [
  // Dashboard - the areas of /admin itself (app/admin/page.tsx, ?bereich=...).
  { href: '/admin', titel: 'Übersicht', text: 'Dein Dashboard: Schnellzugriff, Archiv und Chat', gruppe: 'dashboard', nurLeiste: true, stichworte: 'dashboard start home overview' },
  { href: '/admin?bereich=vip', titel: 'VIP', text: 'Overlays, Globals, POV, Match-ID-Finder, Twitch-Bot und -Statistik', gruppe: 'dashboard', nurLeiste: true, stichworte: 'overlays globals pov twitch bot statistik vip tools' },
  { href: '/admin?bereich=schnell', titel: 'Schnellzugriff', text: 'Alle öffentlichen Seiten mit einem Klick', gruppe: 'dashboard', nurLeiste: true, stichworte: 'quick access streams rankings events' },
  { href: '/admin?bereich=konto', titel: 'Konto', text: 'Name, Profilbild, Schlüssel und Verbindungen', gruppe: 'dashboard', nurLeiste: true, stichworte: 'account profil profile key schluessel' },
  { href: '/admin?bereich=admin', titel: 'Alle Admin-Werkzeuge', text: 'Jedes Werkzeug als Kachel, nach Themen', gruppe: 'dashboard', nurLeiste: true, stichworte: 'admin tools karten kacheln cards' },

  // Inhalte
  { href: '/admin/tweets', titel: 'Beiträge', text: 'Statistik-Posts erstellen', gruppe: 'inhalte', manager: true, stichworte: 'posts tweets x twitter stats' },
  { href: '/posts', titel: 'Tagesposts', text: 'Die drei Posts des Tages mit Text und Bild', gruppe: 'inhalte', stichworte: 'daily posts heute today' },
  { href: '/admin/post-ideen', titel: 'Post-Ideen', text: 'Jeden Tag zwei fertige Posts für X aus echten Daten: Bild und Text', gruppe: 'inhalte', stichworte: 'post ideas ideen daily täglich x twitter orgs earnings banner' },
  { href: '/admin/tiktok', titel: 'TikTok', text: 'Das tägliche Video zum Herunterladen', gruppe: 'inhalte', manager: true, stichworte: 'video clips' },
  { href: '/admin/plakate', titel: 'Plakate', text: 'Bild und Text für Spieler, Standings, Finals und Top 5', gruppe: 'inhalte', manager: true, stichworte: 'posters poster grafik bild' },
  { href: '/maps', titel: 'Karten', text: 'Turnierkarten bauen und Landepunkte setzen', gruppe: 'inhalte', manager: true, stichworte: 'maps drop spots landepunkte' },
  { href: '/admin/alte-maps', titel: 'Alte Maps', text: 'Karten von Hand pflegen: Formen, Teams, Leaderboard', gruppe: 'inhalte', unter: ['/admin/alte-maps/bearbeiten'], stichworte: 'old maps archiv editor' },
  { href: '/admin/loot-routen', titel: 'Loot-Routen', text: 'Laufwege, Loot und Kisten der Pros je Game, auch in 3D', gruppe: 'inhalte', stichworte: 'loot routes route 3d pros' },
  { href: '/admin/predictions', titel: 'Prognosen', text: 'Vorhersagen zeichnen', gruppe: 'inhalte', manager: true, stichworte: 'predictions vorhersage' },
  { href: '/admin/awards', titel: 'Awards-Editor', text: 'CompHub Awards 2026: Kategorien, Phasen, Nominierte', gruppe: 'inhalte', stichworte: 'awards editor preise' },
  { href: '/awards', titel: 'Awards-Seite', text: 'Vorschau der Awards-Seite und Abstimmung (nur für dich)', gruppe: 'inhalte', stichworte: 'awards vote abstimmung vorschau preview' },
  { href: '/admin/archive', titel: 'Archiv', text: 'Fotos und Videos zu Events und Spielern', gruppe: 'inhalte', manager: true, stichworte: 'archive fotos videos events' },
  { href: '/admin/assets', titel: 'Bildvorrat', text: 'Logos und Grafiken ablegen', gruppe: 'inhalte', manager: true, stichworte: 'assets image library logos bilder' },

  // Spieler & Teams
  { href: '/admin/players', titel: 'Player Center', text: 'Flaggen und @-Konten pflegen', gruppe: 'spieler', manager: true, stichworte: 'spieler players namen' },
  { href: '/admin/flaggen', titel: 'Flaggen & X', text: 'Wichtige Spieler ohne Flagge oder X-Konto nachtragen', gruppe: 'spieler', stichworte: 'flags x twitter twitch socials vorschlaege' },
  { href: '/admin/fotos-credits', titel: 'Fotos & Fotografen', text: 'Spielerfotos hochladen, Fotografen nennen und bestätigen', gruppe: 'spieler', stichworte: 'photos credits fotograf photographer' },
  { href: '/admin/fotos-pool', titel: 'Foto-Pool', text: 'Fotos ohne Namen Spielern zuordnen', gruppe: 'spieler', stichworte: 'photo pool zuordnen assign' },
  { href: '/admin/prospects', titel: 'Prospects', text: 'Rangliste ansehen, Konten ausblenden', gruppe: 'spieler', manager: true, stichworte: 'talente nachwuchs' },
  { href: '/admin/orgs', titel: 'E-Sports-Teams', text: 'Organisationen, Spieler und Logos', gruppe: 'spieler', manager: true, stichworte: 'orgs esports teams organisationen' },
  { href: '/admin/vips', titel: 'VIPs', text: 'Wer auf der Startseite gezeigt wird', gruppe: 'spieler', stichworte: 'startseite homepage' },

  // Daten & Replays
  { href: '/admin/replays', titel: 'Replays', text: 'Turnier-Replays nachsehen', gruppe: 'daten', manager: true, stichworte: 'replay sammeln epic' },
  { href: '/admin/replay', titel: 'Zonen & Games', text: 'Zonen-Bild bauen, Kills und Zonen je Game', gruppe: 'daten', manager: true, stichworte: 'zones games kills replay auswertung' },
  { href: '/scrims', titel: 'Scrims', text: 'Scrims der Community-Server (Noble, Poyo …) mit Sessions', gruppe: 'daten', stichworte: 'scrims noble poyo yunite' },

  // Live & Cups
  { href: '/admin/live', titel: 'Live', text: 'Wer gerade da ist und wann sich wer angemeldet hat', gruppe: 'live', stichworte: 'online anwesend gerade da' },
  { href: '/match-finder?ansicht=freunde', titel: 'Alle Epic-Freunde', text: 'Freunde beider Epic-Konten live mit Match-ID, dazu die Freigaben', gruppe: 'live', stichworte: 'match finder match-id friends freigaben all friends' },
  { href: '/admin?bereich=statistik', titel: 'Status & Besucher', text: 'Läufe (auch Sofortspur), Ladezeiten, Offline-Seiten, Besucher und Nutzung', gruppe: 'live', stichworte: 'statistik statistics visitors besucher nutzung usage sofort sofortspur laeufe jobs status' },

  // Nutzer & Zugang
  { href: '/admin/accounts', titel: 'Konten', text: 'Rollen und VIP vergeben', gruppe: 'nutzer', stichworte: 'accounts rollen roles' },
  { href: '/admin/vip-access', titel: 'VIP-Zugänge', text: 'Frist, Chat und Löschen je VIP', gruppe: 'nutzer', stichworte: 'vip access schluessel keys' },
  { href: '/admin/switch', titel: 'Konto wechseln', text: 'Sehen, was ein VIP oder Manager sieht', gruppe: 'nutzer', stichworte: 'switch account impersonate' },
  { href: '/admin/sections', titel: 'Sections', text: 'Bereiche auf Standby oder Offline stellen', gruppe: 'nutzer', stichworte: 'bereiche offline standby' },
  { href: '/admin/services', titel: 'Anmeldedienste', text: 'Twitch, Discord und Google einrichten', gruppe: 'nutzer', stichworte: 'services login oauth discord google twitch' },

  // Posteingang
  { href: '/admin/contact', titel: 'Kontakt', text: 'Meldungen aus dem Formular lesen', gruppe: 'post', manager: true, zaehler: 'kontakt', stichworte: 'contact inbox meldungen' },
  { href: '/admin/partner', titel: 'Partner-Anfragen', text: 'Fertige E-Mails und DMs an Streamer kopieren', gruppe: 'post', manager: true, stichworte: 'partner requests streamer mail dm' },
];

/** The path part of an entry (without ?query). */
export const pfadVon = (href: string) => href.split('?')[0];
/** The ?bereich= of an entry on /admin, or '' . */
const bereichVon = (href: string) => new URLSearchParams(href.split('?')[1] ?? '').get('bereich') ?? '';

/**
 * Which entry is the current page. The longest matching path wins (/admin/alte-maps/bearbeiten -> Alte Maps); on /admin itself the ?bereich= decides.
 */
export function aktivesWerkzeug(pfad: string, suche: string): AdminWerkzeug | null {
  if (pfad === '/admin') {
    const b = new URLSearchParams(suche).get('bereich') ?? '';
    const treffer = ADMIN_WERKZEUGE.find((w) => pfadVon(w.href) === '/admin' && bereichVon(w.href) === (b === 'start' ? '' : b));
    return treffer ?? ADMIN_WERKZEUGE[0];
  }
  let best: AdminWerkzeug | null = null; let laenge = 0;
  for (const w of ADMIN_WERKZEUGE) {
    for (const p of [pfadVon(w.href), ...(w.unter ?? [])]) {
      if (p === '/admin') continue;
      if ((pfad === p || pfad.startsWith(`${p}/`)) && p.length > laenge) { best = w; laenge = p.length; }
    }
  }
  return best;
}

/** What this account sees: the admin everything; a manager the tiles he saw before (filtered by his ticked areas). */
export function sichtbareWerkzeuge(admin: boolean, darf: (bereich: string) => boolean): AdminWerkzeug[] {
  if (admin) return ADMIN_WERKZEUGE;
  return ADMIN_WERKZEUGE.filter((w) => {
    if (!w.manager) return false;
    const b = bereichVonPfad(pfadVon(w.href));
    return !b || darf(b);
  });
}
