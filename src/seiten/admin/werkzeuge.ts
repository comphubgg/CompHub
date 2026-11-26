/*
 * Jedes Admin-Werkzeug der echten Seite (lib/adminTools.ts auf main, Stand 26.11.2026) - dieselben Gruppen, dieselben Pfade, englische Texte.
 * Betreiber: "als Admin muss ich auch meine Admin-Tools und alles sehen. Du darfst nicht einfach Sachen entfernen." Deshalb steht hier ALLES; was der Hub
 * noch nicht selbst gebaut hat, zeigt er als echte Seite im Rahmen (Rahmen.tsx, /site/<pfad> ueber den Vite-Proxy).
 *
 *   slug   - die Adresse im Hub: /admin/<slug>
 *   pfad   - die Seite auf thecomphub.com
 *   eigen  - im Hub neu gebaut (die echte Seite bleibt als "Classic view" erreichbar)
 */
export type GruppeId = 'inhalte' | 'spieler' | 'daten' | 'live' | 'nutzer' | 'post' | 'dashboard';

export interface Gruppe { id: GruppeId; titel: string; farbe: string; punkt: string; rand: string }
export interface Werkzeug { slug: string; pfad: string; titel: string; text: string; gruppe: GruppeId; stichworte?: string; eigen?: boolean; zaehler?: 'kontakt' }

export const GRUPPEN: Gruppe[] = [
  { id: 'live', titel: 'Live & Cups', farbe: 'text-orange-300', punkt: 'bg-orange-400', rand: 'hover:border-orange-400/40' },
  { id: 'inhalte', titel: 'Content', farbe: 'text-sky-300', punkt: 'bg-sky-400', rand: 'hover:border-sky-400/40' },
  { id: 'spieler', titel: 'Players & Teams', farbe: 'text-emerald-300', punkt: 'bg-emerald-400', rand: 'hover:border-emerald-400/40' },
  { id: 'daten', titel: 'Data & Replays', farbe: 'text-amber-300', punkt: 'bg-amber-400', rand: 'hover:border-amber-400/40' },
  { id: 'nutzer', titel: 'Users & Access', farbe: 'text-violet-300', punkt: 'bg-violet-400', rand: 'hover:border-violet-400/40' },
  { id: 'post', titel: 'Inbox', farbe: 'text-rose-300', punkt: 'bg-rose-400', rand: 'hover:border-rose-400/40' },
  { id: 'dashboard', titel: 'Site dashboard', farbe: 'text-slate-300', punkt: 'bg-slate-400', rand: 'hover:border-slate-400/40' },
];

export const WERKZEUGE: Werkzeug[] = [
  // Live & Cups
  { slug: 'live', pfad: '/admin/live', titel: 'Live', text: 'Who is online right now and when everyone signed in', gruppe: 'live', eigen: true, stichworte: 'online presence anwesend sessions devices' },
  { slug: 'epic-friends', pfad: '/match-finder?ansicht=freunde', titel: 'All Epic friends', text: 'Friends of both Epic accounts live with match ID, plus the shares', gruppe: 'live', stichworte: 'match finder match-id friends freigaben' },
  { slug: 'status', pfad: '/admin?bereich=statistik', titel: 'Status & visitors', text: 'Jobs (incl. fast lane), load times, offline pages, visitors and usage', gruppe: 'live', stichworte: 'statistics visitors usage jobs status' },

  // Inhalte
  { slug: 'tweets', pfad: '/admin/tweets', titel: 'Posts', text: 'Create stat posts', gruppe: 'inhalte', eigen: true, stichworte: 'posts tweets x twitter stats beitraege' },
  { slug: 'daily-posts', pfad: '/posts', titel: 'Daily posts', text: 'The three posts of the day with text and image', gruppe: 'inhalte', stichworte: 'daily posts today' },
  { slug: 'post-ideen', pfad: '/admin/post-ideen', titel: 'Post ideas', text: 'Two ready posts for X every day from real data: image and text', gruppe: 'inhalte', stichworte: 'post ideas daily x orgs earnings banner' },
  { slug: 'tiktok', pfad: '/admin/tiktok', titel: 'TikTok', text: 'The daily video to download', gruppe: 'inhalte', stichworte: 'video clips' },
  { slug: 'plakate', pfad: '/admin/plakate', titel: 'Posters', text: 'Image and text for players, standings, finals and top 5', gruppe: 'inhalte', stichworte: 'posters grafik plakate' },
  { slug: 'maps', pfad: '/maps', titel: 'Maps', text: 'Build tournament maps and set drop spots', gruppe: 'inhalte', stichworte: 'maps drop spots karten' },
  { slug: 'alte-maps', pfad: '/admin/alte-maps', titel: 'Old maps', text: 'Maintain maps by hand: shapes, teams, leaderboard', gruppe: 'inhalte', stichworte: 'old maps archiv editor' },
  { slug: 'loot-routen', pfad: '/admin/loot-routen', titel: 'Loot routes', text: 'Paths, loot and chests of the pros per game, also in 3D', gruppe: 'inhalte', stichworte: 'loot routes 3d pros' },
  { slug: 'predictions', pfad: '/admin/predictions', titel: 'Predictions', text: 'Draw predictions', gruppe: 'inhalte', stichworte: 'predictions prognosen' },
  { slug: 'awards', pfad: '/admin/awards', titel: 'Awards editor', text: 'CompHub Awards 2026: categories, phases, nominees', gruppe: 'inhalte', stichworte: 'awards editor' },
  { slug: 'awards-page', pfad: '/awards', titel: 'Awards page', text: 'Preview of the awards page and voting (only for you)', gruppe: 'inhalte', stichworte: 'awards vote preview' },
  { slug: 'archive', pfad: '/admin/archive', titel: 'Archive', text: 'Photos and videos for events and players', gruppe: 'inhalte', stichworte: 'archive photos videos archiv' },
  { slug: 'assets', pfad: '/admin/assets', titel: 'Image library', text: 'Store logos and graphics', gruppe: 'inhalte', stichworte: 'assets logos bilder bildvorrat' },

  // Spieler & Teams
  { slug: 'players', pfad: '/admin/players', titel: 'Player Center', text: 'Maintain flags, display names and @ accounts', gruppe: 'spieler', eigen: true, stichworte: 'players spieler flags x photos' },
  { slug: 'flaggen', pfad: '/admin/flaggen', titel: 'Flags & X', text: 'Add missing flags or X accounts of important players', gruppe: 'spieler', stichworte: 'flags x twitter twitch socials flaggen' },
  { slug: 'fotos-credits', pfad: '/admin/fotos-credits', titel: 'Photos & photographers', text: 'Upload player photos, credit and confirm photographers', gruppe: 'spieler', stichworte: 'photos credits photographer' },
  { slug: 'fotos-pool', pfad: '/admin/fotos-pool', titel: 'Photo pool', text: 'Assign unnamed photos to players', gruppe: 'spieler', stichworte: 'photo pool assign' },
  { slug: 'prospects', pfad: '/admin/prospects', titel: 'Prospects', text: 'View the ranking, hide accounts', gruppe: 'spieler', stichworte: 'prospects talents' },
  { slug: 'orgs', pfad: '/admin/orgs', titel: 'Esports teams', text: 'Organisations, players and logos', gruppe: 'spieler', stichworte: 'orgs esports teams organisations' },
  { slug: 'vips', pfad: '/admin/vips', titel: 'VIPs', text: 'Who is shown on the homepage', gruppe: 'spieler', eigen: true, stichworte: 'vips homepage startseite' },

  // Daten & Replays
  { slug: 'replays', pfad: '/admin/replays', titel: 'Replays', text: 'Check tournament replays', gruppe: 'daten', stichworte: 'replays epic collect' },
  { slug: 'replay', pfad: '/admin/replay', titel: 'Zones & games', text: 'Build zone images, kills and zones per game', gruppe: 'daten', stichworte: 'zones games kills replay' },
  { slug: 'scrims', pfad: '/scrims', titel: 'Scrims', text: 'Scrims of the community servers (Noble, Poyo …) with sessions', gruppe: 'daten', stichworte: 'scrims noble poyo yunite' },

  // Nutzer & Zugang
  { slug: 'accounts', pfad: '/admin/accounts', titel: 'Accounts', text: 'Assign roles and VIP, keys, Discord, orgs', gruppe: 'nutzer', eigen: true, stichworte: 'accounts roles konten rollen' },
  { slug: 'vip-access', pfad: '/admin/vip-access', titel: 'VIP access', text: 'Deadline, chat and delete per VIP', gruppe: 'nutzer', eigen: true, stichworte: 'vip access keys deadline discord' },
  { slug: 'switch', pfad: '/admin/switch', titel: 'Switch account', text: 'See what a VIP or manager sees', gruppe: 'nutzer', stichworte: 'switch impersonate wechseln' },
  { slug: 'sections', pfad: '/admin/sections', titel: 'Sections', text: 'Put areas on standby or offline', gruppe: 'nutzer', eigen: true, stichworte: 'sections offline standby bereiche' },
  { slug: 'services', pfad: '/admin/services', titel: 'Sign-in services', text: 'Set up Twitch, Discord and Google', gruppe: 'nutzer', stichworte: 'services oauth discord google twitch' },

  // Posteingang
  { slug: 'contact', pfad: '/admin/contact', titel: 'Contact', text: 'Read messages from the form', gruppe: 'post', eigen: true, zaehler: 'kontakt', stichworte: 'contact inbox kontakt' },
  { slug: 'partner', pfad: '/admin/partner', titel: 'Partner requests', text: 'Copy ready emails and DMs to streamers', gruppe: 'post', stichworte: 'partner requests streamer mail dm' },

  // Die Bereiche des Dashboards der Seite selbst
  { slug: 'vip-tools', pfad: '/admin?bereich=vip', titel: 'VIP tools', text: 'Overlays, globals, POV, match ID finder, Twitch bot and stats', gruppe: 'dashboard', stichworte: 'overlays globals pov twitch bot' },
  { slug: 'quick-access', pfad: '/admin?bereich=schnell', titel: 'Quick access', text: 'Every public page with one click', gruppe: 'dashboard', stichworte: 'quick access' },
  { slug: 'site-dashboard', pfad: '/admin', titel: 'Site dashboard', text: 'The classic dashboard: archive, chat, everything', gruppe: 'dashboard', stichworte: 'dashboard classic overview uebersicht' },
];

export const werkzeugNach = (slug: string) => WERKZEUGE.find((w) => w.slug === slug) ?? null;

/** Suche ueber Titel, Text, Pfad und Stichworte. */
export function passt(w: Werkzeug, q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [w.titel, w.text, w.pfad, w.stichworte ?? ''].join(' ').toLowerCase().includes(s);
}
