'use client';
import LadeSchirm from '@/app/components/LadeSchirm';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getDashboardAccountName, getUserStorageKey, loadUserStorageValue, saveUserStorageValue, saveUserStorageCloud, loadUserStorageCloud } from '@/app/lib/userStorage';
import { normalizeLiveStatusUsername, shouldLoadLiveStatus } from '@/app/lib/liveStatus';


import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { useZugang } from '@/app/lib/zugang';
import Kachel from './Kachel';
import Multiview from './Multiview';
import Einzelansicht from './Einzelansicht';
import {
  EINSTELLUNGEN_STANDARD, SCHLUESSEL_EINSTELLUNGEN, ladeJson, speichereJson, type MvEinstellungen,
} from './mvTypen';
import type { BannerEinst, StatsEinst } from './PovVideo';
import { sichtbarerTakt } from '@/app/lib/takt';
interface Streamer {
  twitch: string;
  twitter: string;
  createdBy?: string;
}

interface Folder {
  id: string;
  name: string;
  streamers: Streamer[];
}

/*
 * Was ein Konto selbst hinzugefuegt hat.
 *
 * Die Ordner des Admins sind die Grundlage fuer alle. Was ein VIP darueber
 * hinaus eintraegt, gehoert nur ihm - der Betreiber: "wenn der Admin jemand
 * hinzufuegt, dann fuer jeden; wenn ein anderer mit Rechten hinzufuegt,
 * dann nur fuer den Account, der es hinzugefuegt hat, fuer immer, ausser er
 * loescht es manuell."
 *
 * Deshalb wird nicht mehr die ganze Ordnerliste je Konto abgelegt (damit
 * kam eine Aenderung des Admins bei niemandem mehr an), sondern nur der
 * Unterschied: eigene Ordner, und je Admin-Ordner die eigenen Streamer.
 */
interface EigeneErgaenzungen {
  ordner: Folder[];
  zusatz: Record<string, Streamer[]>;
}

/** Grundlage und Eigenes zusammenlegen - Eigenes hinten, Doppeltes weg. */
function zusammenfuehren(basis: Folder[], eigene: EigeneErgaenzungen | null): Folder[] {
  if (!eigene) return basis;
  const raus = basis.map((f) => {
    const extra = (eigene.zusatz?.[f.id] ?? []).filter(
      (e) => e.twitch && !f.streamers.some((b) => b.twitch === e.twitch));
    return extra.length ? { ...f, streamers: [...f.streamers, ...extra] } : f;
  });
  for (const o of eigene.ordner ?? []) {
    if (!raus.some((f) => f.id === o.id)) raus.push(o);
  }
  return raus;
}

/** Aus dem Stand im Werkzeug zurueckrechnen, was davon eigen ist. */
function eigenesDaraus(stand: Folder[], basis: Folder[]): EigeneErgaenzungen {
  const zusatz: Record<string, Streamer[]> = {};
  const ordner: Folder[] = [];
  for (const f of stand) {
    const b = basis.find((x) => x.id === f.id);
    if (!b) { ordner.push(f); continue; }
    const extra = f.streamers.filter((st) => !b.streamers.some((x) => x.twitch === st.twitch));
    if (extra.length) zusatz[f.id] = extra;
  }
  return { ordner, zusatz };
}

const DEFAULT_FOLDERS: Folder[] = [
  {
    id: 'fortnite-eu',
    name: 'Fortnite Pros EU',
    streamers: []
  },
  {
    id: 'fortnite-na',
    name: 'Fortnite Pros NA',
    streamers: []
  },
  {
    id: 'streamer',
    name: 'Streamer',
    streamers: []
  }
];

export default function Home() {

  const t = useT();
  const [isMounted, setIsMounted] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string>('fortnite-eu');
  const [activeStreamerTwitch, setActiveStreamerTwitchRoh] = useState<string>('');
  /**
   * Das Pro-POV, das gerade in der Einzelansicht laeuft (Kennung) - leer: ein Twitch-Stream.
   *
   * Der Betreiber (12.10.2026): auch in der Einzelansicht sollen die Profis zu sehen sein, die ihn als VIP freigegeben
   * haben. Wer einen Streamer waehlt, verlaesst das POV wieder - deshalb geht jede Wahl durch diese eine Funktion.
   */
  const [aktivPov, setAktivPov] = useState<string>('');
  const setActiveStreamerTwitch = useCallback((v: string) => { setAktivPov(''); setActiveStreamerTwitchRoh(v); }, []);
  /** Banner und Statistik auf dem POV: dieselben Einstellungen wie in der Multiview (gemeinsam im Browser gespeichert). */
  const [mvEinst, setMvEinst] = useState<MvEinstellungen>(EINSTELLUNGEN_STANDARD);
  useEffect(() => {
    setMvEinst({ ...EINSTELLUNGEN_STANDARD, ...ladeJson<Partial<MvEinstellungen>>(SCHLUESSEL_EINSTELLUNGEN, {}) });
  }, []);
  const aendereMvEinst = useCallback((teil: Partial<MvEinstellungen>) => {
    setMvEinst((alt) => { const n = { ...alt, ...teil }; speichereJson(SCHLUESSEL_EINSTELLUNGEN, { ...n, _v: 2 }); return n; });
  }, []);
  const aendereBannerSolo = useCallback((teil: Partial<BannerEinst>) => {
    aendereMvEinst({
      ...(teil.an !== undefined ? { povBanner: teil.an } : {}),
      ...(teil.ort !== undefined ? { povBannerOrt: teil.ort } : {}),
      ...(teil.mitBild !== undefined ? { povBannerBild: teil.mitBild } : {}),
      ...(teil.groesse !== undefined ? { povBannerGroesse: teil.groesse } : {}),
    });
  }, [aendereMvEinst]);
  const aendereStatsSolo = useCallback((teil: Partial<StatsEinst>) => {
    aendereMvEinst({
      ...(teil.an !== undefined ? { povStats: teil.an } : {}),
      ...(teil.ort !== undefined ? { povStatsOrt: teil.ort } : {}),
      ...(teil.mitBild !== undefined ? { povStatsBild: teil.mitBild } : {}),
      ...(teil.groesse !== undefined ? { povStatsGroesse: teil.groesse } : {}),
    });
  }, [aendereMvEinst]);
  const [showChat, setShowChat] = useState<boolean>(true);
  /**
   * Kachelansicht statt eines einzelnen Streams.
   *
   * Aus, solange nichts anderes gespeichert ist: wer die Seite zum ersten
   * Mal oeffnet, will einen Stream sehen und nicht sechs gleichzeitig.
   */
  const [mehrfach, setMehrfach] = useState<boolean>(false);
  /**
   * Von Hand fuer die Kachelansicht gewaehlte Streamer.
   *
   * Leer heisst nicht "keine Kacheln", sondern "entscheide selbst" - dann
   * erscheinen alle, die gerade senden. Erst ein Eintrag hier uebernimmt
   * die Auswahl.
   */
  const [kachelWahl, setKachelWahl] = useState<string[]>([]);
  /**
   * Wie oft eine Kachel neu geladen wurde.
   *
   * Der Zaehler steht im Schluessel des iframe. Wird er hochgezaehlt, baut
   * React das Element neu auf - und nur so laedt ein Player mit
   * unveraenderter Adresse wirklich neu.
   */
  const [kachelNeu, setKachelNeu] = useState<Record<string, number>>({});
  /**
   * Hat jemand von Hand eingegriffen?
   *
   * Ohne diese Unterscheidung waere das Kreuz an der letzten Kachel
   * wirkungslos - die leere Auswahl saehe aus wie "noch nichts gewaehlt"
   * und alles kaeme zurueck.
   */
  const [eigeneWahl, setEigeneWahl] = useState<boolean>(false);
  const [showFolderPanel, setShowFolderPanel] = useState<boolean>(true);
  /*
   * Die Ordnerliste auf dem Handy.
   *
   * Auf schmalen Bildschirmen stehen die beiden Spalten untereinander, und
   * die Ordnerliste ist die obere - man scrollte also an Ordnern, Suchfeld
   * und Streamerliste vorbei, bevor der erste Stream auftauchte. Wer die
   * Seite auf dem Telefon oeffnete, sah von den Streams schlicht nichts.
   *
   * Deshalb ein zweiter Schalter, der nur unterhalb von lg greift: die
   * Streams stehen oben, die Ordner klappen auf Wunsch darueber auf. Der
   * gespeicherte Zustand von showFolderPanel bleibt davon unberuehrt - sonst
   * haette ein Blick aufs Handy die Ansicht am Rechner umgestellt.
   */
  const [ordnerAufHandy, setOrdnerAufHandy] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [currentHost, setCurrentHost] = useState<string>('');
  const removedStreamers = useMemo(() => new Set(['darmfn_']), []);
  const sidebarSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('');
  const [streamerSearchQuery, setStreamerSearchQuery] = useState('');
  const [newTwitchName, setNewTwitchName] = useState('');
  const [newTwitterName, setNewTwitterName] = useState('');
  const [twitchSearchQuery, setTwitchSearchQuery] = useState('');
  const [twitchSearchResults, setTwitchSearchResults] = useState<any[]>([]);
  const [liveStatusMap, setLiveStatusMap] = useState<{ [key: string]: boolean }>({});
  const liveStatusAbortRef = useRef<AbortController | null>(null);
  const DEFAULT_STREAM_VOLUME = 0.45;
  const [streamVolume, setStreamVolume] = useState<number>(DEFAULT_STREAM_VOLUME);
  const [searchingTwitch, setSearchingTwitch] = useState(false);
  const [searchSortBy, setSearchSortBy] = useState<'followers' | 'live'>('followers');
  const [searchLiveOnly, setSearchLiveOnly] = useState(false);
  const [hiddenStreamers, setHiddenStreamers] = useState<string[]>([]);
  const [hiddenStats, setHiddenStats] = useState<string[]>([]);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderInput, setRenameFolderInput] = useState('');
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);

  const [editingTwitter, setEditingTwitter] = useState<string | null>(null);
  const [editTwitterInput, setEditTwitterInput] = useState<string>('');
  const [verifiedUser, setVerifiedUser] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  /*
   * Dieselben Werte noch einmal als Ref.
   *
   * persistFolders hatte "authorized" und "isAdmin" in der Klammer
   * eingefroren: beim Aufbau der Seite sind beide falsch, und die Funktion
   * behielt das - ein hinzugefuegter Streamer wurde deshalb nie
   * gespeichert. Der Betreiber: "wenn ich die Seite schliesse und wieder
   * oeffne, ist der Streamer nicht mehr im Ordner." Eine Ref hat immer
   * den Stand von jetzt.
   */
  const authorizedRef = useRef(false);
  const isAdminRef = useRef(false);
  useEffect(() => { authorizedRef.current = authorized; }, [authorized]);
  useEffect(() => { isAdminRef.current = isAdmin; }, [isAdmin]);
  /** Die Ordner des Admins, wie sie vom Server kamen - die Grundlage. */
  const serverBasis = useRef<Folder[]>([]);
  const zugang = useZugang();
  /*
   * Drei Stufen statt zwei.
   *
   * "isGuest" hiess bisher "nicht VIP" und traf damit auch jeden, der sich
   * gerade ein Konto angelegt hatte - der bekam an jeder Ecke den Hinweis,
   * er solle sich anmelden. Jetzt gilt:
   *
   *   Gast   - darf zusehen
   *   Nutzer - darf Spieler hinzufuegen und ausblenden
   *   VIP    - darf zusaetzlich eigene Ordner anlegen
   */
  const isGuest = !zugang.laedt && zugang.gast;
  const darfOrdner = zugang.vip || authorized === true;

  const normalizeSearchText = useCallback((text: string) => {
    return text.trim().toLowerCase().replace(/[^a-z0-9@]/g, '');
  }, []);

  const levenshteinDistance = useCallback((a: string, b: string) => {
    const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
      }
    }
    return matrix[a.length][b.length];
  }, []);

  const getSearchScore = useCallback((query: string, target: string) => {
    const normalizedQuery = normalizeSearchText(query);
    const normalizedTarget = normalizeSearchText(target);
    if (!normalizedQuery || !normalizedTarget) return 0;
    if (normalizedTarget.includes(normalizedQuery)) return 1;
    const maxLen = Math.max(normalizedQuery.length, normalizedTarget.length);
    const distance = levenshteinDistance(normalizedQuery, normalizedTarget);
    return Math.max(0, 1 - distance / Math.max(1, maxLen));
  }, [levenshteinDistance, normalizeSearchText]);

  // Sidebar search: finds the best matching streamer or folder and jumps there
  const performSidebarSearch = useCallback((query?: string) => {
    const q = (query ?? sidebarSearchQuery).trim();
    if (!q) return;
    const normalizedQuery = normalizeSearchText(q);

    let bestMatch: { score: number; folder: Folder; streamer?: Streamer } | null = null;
    for (const folder of folders) {
      for (const streamer of folder.streamers || []) {
        const twitchScore = getSearchScore(normalizedQuery, streamer.twitch || '');
        const twitterScore = getSearchScore(normalizedQuery, streamer.twitter || '');
        const score = Math.max(twitchScore, twitterScore);
        if (score > 0 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { score, folder, streamer };
        }
      }
    }

    if (bestMatch && bestMatch.score >= 0.5 && bestMatch.streamer) {
      setActiveFolderId(bestMatch.folder.id);
      setActiveStreamerTwitch(bestMatch.streamer.twitch);
      localStorage.setItem('multihub_last_folder', bestMatch.folder.id);
      localStorage.setItem('multihub_last_streamer', bestMatch.streamer.twitch);
      setSidebarSearchQuery('');
      return;
    }

    let bestFolderMatch: { score: number; folder: Folder } | null = null;
    for (const folder of folders) {
      const score = getSearchScore(normalizedQuery, folder.name || '');
      if (score > 0 && (!bestFolderMatch || score > bestFolderMatch.score)) {
        bestFolderMatch = { score, folder };
      }
    }

    if (bestFolderMatch && bestFolderMatch.score >= 0.5) {
      setActiveFolderId(bestFolderMatch.folder.id);
      localStorage.setItem('multihub_last_folder', bestFolderMatch.folder.id);
      setSidebarSearchQuery('');
      return;
    }

    alert('No streamer or folder found');
  }, [folders, sidebarSearchQuery, getSearchScore, normalizeSearchText]);
  const [avatarError, setAvatarError] = useState<boolean>(false);
  const [streamerLiveStatus, setStreamerLiveStatus] = useState<{ [key: string]: number }>({});
  const [autoSortByLive, setAutoSortByLive] = useState<boolean>(true);
  const [playerTwitterMap, setPlayerTwitterMap] = useState<{ [key: string]: string }>({});
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
  const searchParams = useSearchParams();
  const previewMode = searchParams.get('preview') === '1';
  /*
   * Ein Kanal aus der Adresse.
   *
   * Von der Eventseite fuehrt jeder laufende Stream hierher - auf die eigene
   * Streamerseite mit Chat und Ordnern, nicht nach Twitch hinaus. Der
   * Betreiber: "Ich soll eigentlich auf meine Streamer-Seite gehen und den
   * Streamer oeffnen, nicht auf Twitch direkt."
   *
   * Was in der Adresse steht, gilt vor dem zuletzt gemerkten Kanal.
   */
  const kanalAusUrl = (searchParams.get('kanal') ?? '').trim().toLowerCase();

  useEffect(() => {
    if (kanalAusUrl) setActiveStreamerTwitch(kanalAusUrl);
  }, [kanalAusUrl]);
  const tourMode = searchParams.get('tour') === '1';
  const [tourOpen, setTourOpen] = useState<boolean>(tourMode);
  const [tourStep, setTourStep] = useState<number>(0);
  const [tourTargetRect, setTourTargetRect] = useState<DOMRect | null>(null);
  const [tourTooltipPlacement, setTourTooltipPlacement] = useState<'top' | 'bottom' | 'left' | 'right'>('bottom');

  const tourSteps = useMemo(() => [
    {
      target: 'sidebar',
      title: 'Folder sidebar',
      description: 'This panel shows folders and streamer counts. It is view-only in this tour.',
      tip: 'Use folders to organize streamer lists and keep an overview.',
    },
    {
      target: 'controls',
      title: 'Streamer controls',
      description: 'These buttons let you switch chat visibility and manage the stream preview.',
      tip: 'In the real app, these change the display without affecting the tour.',
    },
    {
      target: 'preview',
      title: 'Main stream preview',
      description: 'This is the main preview area for selected streams.',
      tip: 'No stream is actually playing while the tour is open.',
    },
    {
      target: 'chat',
      title: 'Chat pane',
      description: 'The chat panel shows Twitch chat when enabled, but it is not interactive here.',
      tip: 'You can read the UI, but not type or send messages.',
    },
    {
      target: 'search',
      title: 'Search and add form',
      description: 'This form is for adding streamers and searching. In the tour, it is only shown as a preview.',
      tip: 'Buttons and fields are disabled in tour mode and only explained visually.',
    },
  ], []);

  const tourStepCount = tourSteps.length;
  const currentTourStep = tourSteps[tourStep] || tourSteps[0];

  const persistFolders = useCallback((updatedFolders: Folder[], options?: { activeFolderId?: string; activeStreamerTwitch?: string }) => {
    const normalizedFolders = updatedFolders.map((folder) => ({
      ...folder,
      streamers: Array.isArray(folder.streamers) ? folder.streamers : []
    }));

    setFolders(normalizedFolders);

    const saveDashboard = async () => {
      try {
        if (isAdminRef.current) {
          // Der Admin schreibt die Grundlage - fuer alle.
          const response = await fetch('/api/dashboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folders: normalizedFolders }),
          });
          if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to save dashboard:', response.status, errorText);
          } else {
            serverBasis.current = normalizedFolders;
          }
        } else if (authorizedRef.current) {
          // Alle anderen schreiben nur, was ueber die Grundlage hinausgeht.
          await saveUserStorageCloud('multihub_eigene',
            eigenesDaraus(normalizedFolders, serverBasis.current));
        }
      } catch (error) {
        console.error('Failed to save dashboard:', error);
      }
    };

    void saveDashboard();

    const currentLayout = localStorage.getItem('multihub_layout_config');
    let parsedLayout: Record<string, any> = {};
    if (currentLayout) {
      try {
        parsedLayout = JSON.parse(currentLayout);
      } catch {
        parsedLayout = {};
      }
    }

    localStorage.setItem('multihub_layout_config', JSON.stringify({
      ...parsedLayout,
      activeFolderId: options?.activeFolderId ?? activeFolderId,
      activeStreamerTwitch: options?.activeStreamerTwitch ?? activeStreamerTwitch,
      hiddenStreamers,
      hiddenStats,
      showChat,
      showFolderPanel,
      autoSortByLive,
    }));
  }, [activeFolderId, activeStreamerTwitch, hiddenStreamers, hiddenStats, showChat, showFolderPanel, autoSortByLive]);

  const getRegionFromFolderId = useCallback((folderId: string): 'EU' | 'NA' | null => {
    if (folderId === 'fortnite-eu') return 'EU';
    if (folderId === 'fortnite-na') return 'NA';
    return null;
  }, []);

  const saveStreamerToServer = useCallback(async (streamer: Streamer, region: 'EU' | 'NA') => {
    const response = await fetch('/api/streamers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ twitch: streamer.twitch, twitter: streamer.twitter, region }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to save streamer: ${response.status} ${errorText}`);
    }
    return response.json();
  }, []);

  const updateStreamerOnServer = useCallback(async (streamer: Streamer, region: 'EU' | 'NA') => {
    const response = await fetch('/api/streamers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ twitch: streamer.twitch, twitter: streamer.twitter, region }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update streamer: ${response.status} ${errorText}`);
    }
    return response.json();
  }, []);

  const deleteStreamerFromServer = useCallback(async (twitch: string, region: 'EU' | 'NA') => {
    const response = await fetch('/api/streamers', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ twitch, region }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete streamer: ${response.status} ${errorText}`);
    }
    return response.json();
  }, []);

  useEffect(() => {
    if (!tourOpen) {
      setTourTargetRect(null);
      return;
    }

    const updateTargetRect = () => {
      const element = document.querySelector<HTMLElement>(`[data-tour="${currentTourStep.target}"]`);
      if (element) {
        setTourTargetRect(element.getBoundingClientRect());
      } else {
        setTourTargetRect(null);
      }
    };

    updateTargetRect();
    window.addEventListener('resize', updateTargetRect);
    return () => window.removeEventListener('resize', updateTargetRect);
  }, [tourOpen, currentTourStep]);

  const closeTour = () => setTourOpen(false);
  const prevTourStep = () => setTourStep((step) => Math.max(0, step - 1));
  const nextTourStep = () => setTourStep((step) => Math.min(tourStepCount - 1, step + 1));


  const router = useRouter();

  const getApiUrl = (path: string) => {
    if (typeof window === 'undefined') return path;
    return `${window.location.origin}${path}`;
  };

  useEffect(() => {
    const updateWindowSize = () => {
      if (typeof window !== 'undefined') {
        setWindowSize({ width: window.innerWidth, height: window.innerHeight });
      }
    };

    updateWindowSize();
    window.addEventListener('resize', updateWindowSize);
    return () => window.removeEventListener('resize', updateWindowSize);
  }, []);

  // Live Status für Sortierung
  
  // Favorites-System
  const [favoriteStreamers, setFavoriteStreamers] = useState<string[]>([]);
  
  // Notifications
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notifiedStreamers, setNotifiedStreamers] = useState<Set<string>>(new Set());
  const [newNotificationAlert, setNewNotificationAlert] = useState(false);
  
  // Definiere checkStreamerStatus VOR allen useEffect Hooks
  const checkStreamerStatus = useCallback(async (twitchName: string) => {
    try {
const response = await fetch(getApiUrl(`/api/search?q=${encodeURIComponent(twitchName)}`));
      if (!response.ok) throw new Error(`API responded with status ${response.status}`);
      
      const data = await response.json();
      
      if (data.channels && data.channels.length > 0) {
        const streamer = data.channels[0];
        // Check if live based on viewers or isLive flag
        const isLive = streamer.isLive === true || (streamer.viewers && streamer.viewers > 0);
        const viewers = streamer.viewers || 0;
        
        console.log(`[Live Status] ${twitchName}: ${isLive ? 'LIVE (' + viewers + ' viewers)' : 'offline'}`);
        
        setStreamerLiveStatus(prev => ({
          ...prev,
          [twitchName]: isLive ? viewers : 0
        }));
      } else {
        console.log(`[Live Status] ${twitchName}: offline (not found)`);
        setStreamerLiveStatus(prev => ({
          ...prev,
          [twitchName]: 0
        }));
      }
    } catch (error) {
      console.error(`[Live Status Error] ${twitchName}:`, error);
      setStreamerLiveStatus(prev => ({
        ...prev,
        [twitchName]: 0
      }));
    }
  }, []);

  // Lade Live-Status für alle Streamer nur bei Bedarf und nur einmal pro Session
  const loadAllLiveStatus = useCallback(async () => {
    try {
      const allStreamers = new Set<string>();
      folders.forEach(folder => {
        folder.streamers.forEach(streamer => {
          allStreamers.add(normalizeLiveStatusUsername(streamer.twitch));
        });
      });

      if (allStreamers.size === 0) {
        return;
      }

      const usernames = Array.from(allStreamers);

      const response = await fetch('/api/live-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames })
      });

      if (!response.ok) return;
      const liveData = await response.json();
      const newStatusMap: { [key: string]: boolean } = {};

      usernames.forEach(name => {
        const normalizedName = normalizeLiveStatusUsername(name);
        newStatusMap[normalizedName] = liveData[normalizedName]?.isLive || false;
      });
      setLiveStatusMap(prev => ({ ...prev, ...newStatusMap }));
    } catch (error) {
      console.error('Failed to load live status:', error);
    }
  }, [folders]);

  useEffect(() => {
    if (!notificationsEnabled) return;

    Object.entries(liveStatusMap).forEach(([streamerName, isLive]) => {
      const isFavorite = favoriteStreamers.includes(streamerName);

      if (isLive && isFavorite && !notifiedStreamers.has(streamerName)) {
        // Notification senden
        new Notification(`🔴 ${streamerName} ist live!`, {
          icon: '🎮',
          tag: `stream-${streamerName}`
        });

        // Glocke triggern
        setNewNotificationAlert(true);

        // Merken dass wir eine Notification gesendet haben
        setNotifiedStreamers(prev => new Set([...prev, streamerName]));
      } else if (!isLive) {
        // Clearen wenn offline
        setNotifiedStreamers(prev => {
          const updated = new Set(prev);
          updated.delete(streamerName);
          return updated;
        });
      }
    });
  }, [liveStatusMap, notificationsEnabled, favoriteStreamers]);

  useEffect(() => {
    if (!shouldLoadLiveStatus({ isMounted, isGuest })) return;
    // Die Multiview fragt selbst nach allen Ordnern und der Wand - eine zweite Abfrage waere doppelt (und kostet bei Netlify Punkte).
    if (mehrfach) return;

    const timer = window.setTimeout(() => {
      void loadAllLiveStatus();
    }, 1500);

    const stopp = sichtbarerTakt(() => { void loadAllLiveStatus(); }, 60000);
    return () => {
      window.clearTimeout(timer);
      stopp();
    };
  }, [isMounted, isGuest, loadAllLiveStatus, mehrfach]);

  /*
   * Kein Springen mehr auf einen anderen Stream.
   *
   * Hier stand ein "Auto-Switch": sobald der aktive Stream nicht mehr als
   * live galt, sprang die Ansicht alle zwei Sekunden auf irgendeinen
   * anderen, der sendet. Gedacht war das gegen Werbung, erkennen laesst
   * sich die im eingebetteten Player aber nicht - und der Betreiber wollte
   * das Verhalten nicht: "wenn Leute nicht live sind, heisst es nicht,
   * dass man automatisch zu einem geht, wo live ist." Ein Stream, der
   * nicht sendet, zeigt jetzt das, was Twitch zeigt: dass er offline ist.
   */

  // Auto-Update Live Status nur bei Bedarf und ohne Massen-Search-Requests beim Start
  useEffect(() => {
    if (isGuest || !isMounted) return;

    const currentFolder = folders.find(f => f.id === activeFolderId);
    if (!currentFolder || currentFolder.streamers.length === 0) return;

    liveStatusAbortRef.current?.abort();
    const abortController = new AbortController();
    liveStatusAbortRef.current = abortController;

    if (!abortController.signal.aborted) {
      const initialStatus: { [key: string]: number } = {};
      currentFolder.streamers.forEach(s => {
        initialStatus[s.twitch] = 0;
      });
      setStreamerLiveStatus(initialStatus);
    }

    return () => {
      abortController.abort();
      liveStatusAbortRef.current = null;
    };
  }, [activeFolderId, folders, isMounted, isGuest]);

  // Lade Dashboard-Daten vom Server
  const loadDashboardFromServer = useCallback(async () => {
    try {
      const response = await fetch('/api/dashboard');
      if (!response.ok) throw new Error('Failed to load dashboard');

      const data = await response.json();
      const loadedFolders: Folder[] = Array.isArray(data.folders)
        ? data.folders.map((folder: any) => ({
            id: String(folder.id || `folder-${Date.now()}`),
            name: String(folder.name || 'Unbenannter Ordner'),
            streamers: Array.isArray(folder.streamers)
              ? folder.streamers.map((streamer: any) => ({
                  twitch: String(streamer.twitch || '').trim().toLowerCase(),
                  twitter: String(streamer.twitter || '').trim() || String(streamer.twitch || '').trim().toLowerCase(),
                  createdBy: streamer.createdBy ? String(streamer.createdBy).trim().toLowerCase() : undefined,
                }))
              : [],
          }))
        : JSON.parse(JSON.stringify(DEFAULT_FOLDERS));

      return loadedFolders;
    } catch (error) {
      console.error('Failed to load dashboard from server:', error);
      return DEFAULT_FOLDERS;
    }
  }, []);

  /*
   * Erst die Grundlage vom Server, dann das Eigene dazu.
   *
   * Wer angemeldet ist, wird der Funktion mitgegeben statt aus dem Zustand
   * gelesen: beim Aufbau der Seite lief das Laden, bevor die Anmeldung
   * geprueft war, und nahm deshalb immer den Weg fuer Gaeste - die eigenen
   * Eintraege wurden nie gelesen.
   */
  const loadDashboardData = useCallback(async (wer: { authorized: boolean; isAdmin: boolean }) => {
    const serverFolders = await loadDashboardFromServer();
    serverBasis.current = serverFolders;
    if (wer.isAdmin || !wer.authorized) {
      setFolders(serverFolders);
      return serverFolders;
    }

    let eigene = await loadUserStorageCloud<EigeneErgaenzungen>('multihub_eigene');
    if (!eigene) {
      /*
       * Der alte Stand: eine ganze Ordnerliste je Konto.
       *
       * Daraus wird einmal der Unterschied zur Grundlage gebildet und so
       * abgelegt, wie es jetzt gilt - was jemand frueher hinzugefuegt hat,
       * bleibt ihm erhalten.
       */
      const alt = await loadUserStorageCloud<Folder[]>('multihub_folders');
      if (Array.isArray(alt) && alt.length) {
        eigene = eigenesDaraus(alt, serverFolders);
        await saveUserStorageCloud('multihub_eigene', eigene);
      }
    }
    const zusammen = zusammenfuehren(serverFolders, eigene);
    setFolders(zusammen);
    return zusammen;
  }, [loadDashboardFromServer]);

  // Prüft alle Streamer und wählt beim ersten gefundenen Live-Stream automatisch seinen Ordner + Stream aus
  const selectFirstLiveStreamerIfAny = useCallback(async (foldersToCheck?: Folder[]) => {
    try {
      const sourceFolders = Array.isArray(foldersToCheck) ? foldersToCheck : folders;
      const allStreamers = new Set<string>();
      sourceFolders.forEach(folder => {
        (folder.streamers || []).forEach(s => allStreamers.add(s.twitch.toLowerCase()));
      });
      if (allStreamers.size === 0) return;

      const response = await fetch('/api/live-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: Array.from(allStreamers) })
      });
      if (!response.ok) return;
      const liveData = await response.json();

      const liveUser = Object.keys(liveData).find(u => liveData[u]?.isLive);
      if (!liveUser) return;

      const folder = sourceFolders.find(f => (f.streamers || []).some(s => s.twitch.toLowerCase() === liveUser.toLowerCase()));
      if (folder) {
        setActiveFolderId(folder.id);
        setActiveStreamerTwitch(liveUser);
        localStorage.setItem('multihub_last_folder', folder.id);
        localStorage.setItem('multihub_last_streamer', liveUser);
      }
    } catch (e) {
      console.error('Failed to auto-select live streamer/folder:', e);
    }
  }, [folders]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentHost(window.location.hostname);
    }

    /*
     * Erst wissen, wer da ist - dann laden.
     *
     * Vorher liefen beide gleichzeitig los, und das Laden gewann immer:
     * es sah einen Gast und las nur die Grundlage.
     */
    const werIstDa = async (): Promise<{ authorized: boolean; isAdmin: boolean }> => {
      try {
        const res = await fetch('/api/auth/verify');
        if (!res.ok) return { authorized: false, isAdmin: false };
        const j = await res.json();
        if (j?.authorized && j.user) {
          const login = String(j.user).trim().toLowerCase();
          setVerifiedUser(login);
          return { authorized: true, isAdmin: login === 'admin-juanito' };
        }
      } catch { /* dann ist es ein Gast */ }
      return { authorized: false, isAdmin: false };
    };

    werIstDa().then((wer) => {
      setAuthorized(wer.authorized);
      setIsAdmin(wer.isAdmin);
      authorizedRef.current = wer.authorized;
      isAdminRef.current = wer.isAdmin;
      return loadDashboardData(wer);
    }).then(loadedFolders => {
      // WICHTIG: Setze Ordner-ID Fallback
      const initialFolders = loadedFolders.map(f => ({
        ...f,
        streamers: f.streamers && f.streamers.length > 0 ? f.streamers : []
      }));
      
      // Nur lade vom localStorage wenn API-Ordner auch Streamer haben!
      const savedHidden = localStorage.getItem('multihub_hidden_v2');
      const savedActiveFolder = localStorage.getItem('multihub_last_folder');
      const savedActiveStreamer = localStorage.getItem('multihub_last_streamer');
      const savedShowChat = localStorage.getItem('multihub_show_chat');
      const savedMehrfach = localStorage.getItem('multihub_mehrfach');
      const savedKachelWahl = localStorage.getItem('multihub_kachel_wahl');
      const savedFolderPanel = localStorage.getItem('multihub_show_folder_panel');

      if (savedActiveFolder && initialFolders.some((f: Folder) => f.id === savedActiveFolder)) {
        setActiveFolderId(savedActiveFolder);
      } else {
        const defaultFolderExists = initialFolders.some((f: Folder) => f.id === 'fortnite-eu');
        if (defaultFolderExists) {
          setActiveFolderId('fortnite-eu');
        } else if (initialFolders.length > 0) {
          setActiveFolderId(initialFolders[0].id);
        }
      }

      if (savedActiveStreamer && !removedStreamers.has(savedActiveStreamer) && initialFolders.flatMap(f => f.streamers).some(s => s.twitch === savedActiveStreamer)) {
        setActiveStreamerTwitch(savedActiveStreamer);
      }

      // Wenn ein Stream live ist, wähle automatisch dessen Ordner/Stream
      void selectFirstLiveStreamerIfAny(loadedFolders);

      if (savedHidden) {
        setHiddenStreamers(JSON.parse(savedHidden));
      }

      const savedHiddenStats = localStorage.getItem('multihub_hidden_stats_v2');
      if (savedHiddenStats) {
        setHiddenStats(JSON.parse(savedHiddenStats));
      }

        if (savedMehrfach !== null) setMehrfach(savedMehrfach === 'true');
        if (savedKachelWahl) {
          try {
            const liste = JSON.parse(savedKachelWahl);
            if (Array.isArray(liste)) {
              setKachelWahl(liste.filter((x) => typeof x === 'string'));
              setEigeneWahl(true);
            }
          } catch { /* unbrauchbar gespeichert - dann eben von vorn */ }
        }
        if (savedShowChat !== null) {
        setShowChat(savedShowChat === 'true');
      }

      if (savedFolderPanel !== null) {
        setShowFolderPanel(savedFolderPanel === 'true');
      }

      const savedAutoSortLive = localStorage.getItem('multihub_auto_sort_live');
      if (savedAutoSortLive !== null) {
        setAutoSortByLive(JSON.parse(savedAutoSortLive));
      }

      // Lade Favorites pro Account
      const savedFavorites = localStorage.getItem(getUserStorageKey('multihub_favorites'));
      if (savedFavorites) {
        try {
          setFavoriteStreamers(JSON.parse(savedFavorites));
        } catch {
          setFavoriteStreamers([]);
        }
      } else {
        setFavoriteStreamers([]);
      }

      // Lade Layout Config
      const savedLayout = localStorage.getItem('multihub_layout_config');
      if (savedLayout) {
        try {
          const config = JSON.parse(savedLayout);
          
          // Chat & Stream
          if (config.showChat !== undefined) setShowChat(config.showChat);
          
          // Aktive Auswahl
          // Ein Kanal aus der Adresse geht vor dem gemerkten.
          if (!kanalAusUrl
            && config.activeStreamerTwitch !== undefined
            && !removedStreamers.has(config.activeStreamerTwitch)) {
            setActiveStreamerTwitch(config.activeStreamerTwitch);
          }
          if (config.activeFolderId !== undefined) setActiveFolderId(config.activeFolderId);
          
          // Streamer & Ordner
          if (config.hiddenStreamers !== undefined) setHiddenStreamers(config.hiddenStreamers);
          if (config.hiddenStats !== undefined) setHiddenStats(config.hiddenStats);
          
          // Andere
          if (config.autoSortByLive !== undefined) setAutoSortByLive(config.autoSortByLive);
          
          console.log('✅ Gespeicherte Session wiederhergestellt');
        } catch (e) {
          console.error('Fehler beim Laden des Layouts:', e);
        }
      }

      // Lade Notifications-Setting
      const savedNotifications = localStorage.getItem('multihub_notifications_enabled');
      if (savedNotifications === 'true') {
        setNotificationsEnabled(true);
      }

      setIsMounted(true);
    }).catch((error) => {
      console.error('Error loading folders:', error);
      setFolders(DEFAULT_FOLDERS);
      setIsMounted(true);
    });
  }, [loadDashboardFromServer]);

  const currentStreamerObj = folders.flatMap(f => f.streamers).find(s => s.twitch === activeStreamerTwitch);


  const currentFolder = Array.isArray(folders) ? folders.find(f => f.id === activeFolderId) : undefined;

  const displayedStreamers = useMemo(() => {
    if (selectedFolderIds && selectedFolderIds.length > 0) {
      const map = new Map<string, Streamer>();
      folders.filter(f => selectedFolderIds.includes(f.id)).forEach(f => {
        (f.streamers || []).forEach(s => {
          const key = (s.twitch || '').toLowerCase();
          if (!map.has(key) && key) map.set(key, s);
        });
      });
      return Array.from(map.values()).sort((a, b) => a.twitch.localeCompare(b.twitch));
    }

    if (currentFolder) return currentFolder.streamers || [];
    return [] as Streamer[];
  }, [folders, selectedFolderIds, currentFolder]);

  /**
   * Wer in der Kachelansicht erscheint.
   *
   * Die sichtbaren Streamer des Ordners, ausgeblendete weg, und davon die
   * gerade sendenden - alles andere waere eine Wand aus schwarzen Kacheln.
   * Sendet niemand, bleibt es beim einzelnen Stream; ein leeres Raster
   * saehe nach einem Fehler aus.
   *
   * Der aktive Stream steht vorn und ist der einzige mit Ton. Sechs
   * gleichzeitig sprechende Streams sind unbrauchbar, und Twitch spielt
   * ohne vorherigen Klick ohnehin nur stumm ab.
   */
  const kachelStreams = useMemo(() => {
    /*
     * Die Auswahl gilt ueber alle Ordner hinweg.
     *
     * Sie wurde zuerst nur im gerade offenen Ordner gesucht. Damit war die
     * Ansicht beim Wechsel des Ordners leer, und wer aus zwei Ordnern
     * zusammenstellen wollte, fing jedes Mal von vorn an. Gesucht wird
     * deshalb in allen Ordnern - in der Reihenfolge, in der angeheftet
     * wurde, damit die Kacheln nicht bei jedem Ordnerwechsel springen.
     */
    if (eigeneWahl) {
      const alleStreamer = new Map<string, Streamer>();
      folders.forEach((f) => (f.streamers || []).forEach((st) => {
        if (st.twitch && !alleStreamer.has(st.twitch)) alleStreamer.set(st.twitch, st);
      }));
      /*
       * Wer in keinem Ordner steht, kommt trotzdem herein.
       *
       * Die Suche ueber der Kachelansicht nimmt jeden Twitch-Namen - der
       * Betreiber: "da kann ich Spieler suchen, die nicht in meinen
       * Ordnern sind, und wenn ich Enter druecke, kommen die in die
       * Multiview." Ein solcher Name hat keinen Ordnereintrag; er wird
       * hier zu einem Streamer ohne Twitter.
       */
      const gewaehlt = kachelWahl
        .map((name) => alleStreamer.get(name) ?? { twitch: name, twitter: '' })
        .filter((st) => !hiddenStreamers.includes(st.twitch));
      // Auch eine leere Auswahl gilt - dann bleibt die Ansicht leer und
      // sagt das darunter, statt heimlich alles zurueckzuholen.
      return gewaehlt;
    }

    /*
     * Ohne Auswahl entscheidet die Ansicht selbst - und dann nur im
     * offenen Ordner: alle sendenden Streamer aus allen Ordnern waeren
     * beim ersten Einschalten eine Ueberraschung, keine Hilfe.
     */
    const sichtbar = displayedStreamers.filter(
      (s) => !hiddenStreamers.includes(s.twitch));
    const live = sichtbar.filter(
      (s) => liveStatusMap[s.twitch.toLowerCase()] === true);
    return [...live].sort((a, b) => {
      if (a.twitch === activeStreamerTwitch) return -1;
      if (b.twitch === activeStreamerTwitch) return 1;
      return 0;
    });
  }, [displayedStreamers, folders, hiddenStreamers, liveStatusMap,
      activeStreamerTwitch, kachelWahl, eigeneWahl]);

  /*
   * Alle, die senden - ohne Obergrenze.
   *
   * Hier standen neun, und darunter der Satz "zwei weitere senden gerade -
   * in der Liste ausblenden, um sie hier zu tauschen". Der Betreiber wollte
   * das ausdruecklich weg: wer die Mehrfachansicht aufmacht, will sehen,
   * wer laeuft, und nicht erst jemanden verstecken, um jemand anderen
   * hereinzuholen.
   *
   * Die Kacheln werden dabei von selbst kleiner - die Spaltenzahl ist die
   * aufgerundete Wurzel aus der Anzahl, und die Reihen teilen sich die
   * Hoehe. Genau so verhaelt sich auch das Vorbild: je mehr Streams, desto
   * kleiner die einzelnen.
   */
  const kachelnGezeigt = kachelStreams;

  /**
   * Die Reihen der Kachelansicht.
   *
   * Die Spaltenzahl ist die aufgerundete Wurzel aus der Anzahl. Damit
   * ergibt sich genau die Anordnung der Vorlagen: 2 -> 2, 3 -> 2+1,
   * 4 -> 2+2, 5 -> 3+2, 6 -> 3+3, 7 -> 3+3+1.
   */
  /*
   * Wie gross die Flaeche ist, auf der die Kacheln liegen.
   *
   * Ohne dieses Mass war die Spaltenzahl die Wurzel aus der Anzahl - ein
   * Quadrat also, egal wie breit das Fenster ist. Auf einem breiten
   * Bildschirm mit ausgeblendetem Chat und geschlossener Ordnerleiste blieb
   * links und rechts Platz liegen, waehrend die Kacheln unnoetig klein
   * waren. Der Betreiber: "wenn man beides ausblendet, hat es noch mehr
   * Platz, dann koennen in einer Reihe fuenf bis sechs sein."
   */
  /*
   * Welche Player gebaut sind.
   *
   * In der Kachelansicht die Kacheln. In der Einzelansicht der aktive
   * Stream - und dazu die von Hand gewaehlten Kacheln, verborgen, damit
   * sie beim Wechsel zurueck nicht neu anlaufen. Der Betreiber: "die ganze
   * Zeit weiterlaufen, auch bei Multiview, da laeuft jeder einzelne
   * Stream." Ohne eigene Auswahl bleibt es beim einen: dann waeren es alle
   * Sendenden des Ordners, und die wechseln ohnehin.
   */
  const spielerPool = useMemo(() => {
    if (mehrfach) return kachelnGezeigt;
    // Die Mehrfachansicht ist seit dem 11.10.2026 eine eigene Wand (Multiview.tsx) und fuehrt ihre
    // Player selbst - hier laeuft nur noch der eine aktive Stream.
    return activeStreamerTwitch ? [{ twitch: activeStreamerTwitch, twitter: '' }] as Streamer[] : [];
  }, [mehrfach, kachelnGezeigt, activeStreamerTwitch]);

  /*
   * Die Suche ueber der Kachelansicht.
   *
   * Ein Twitch-Name, Enter, drin - ob er sendet oder nicht. Auch eine
   * ganze Adresse wie twitch.tv/name geht; Twitch-Namen bestehen aus
   * Buchstaben, Ziffern und Unterstrich.
   */
  const [kachelSuche, setKachelSuche] = useState('');

  /*
   * Die Profi-POVs, die dieser Besucher sehen darf.
   *
   * Die Profis geben sie in ihrem Dashboard einzeln frei (app/admin/ProDashboard.tsx); der Server
   * liefert nur, was fuer diesen Besucher freigegeben ist. Nur fuer VIPs - alle anderen fragen gar nicht.
   */
  const [povs, setPovs] = useState<Array<{
    ident: string; name: string; bild: string | null; live: boolean;
    /** Hat der Profi ein verbundenes Epic-Konto? Dann kann das POV seine Statistik zeigen. */
    stats?: boolean;
    /** Derselbe Anschluss wie der Sender: das POV beginnt stumm (sonst Echo). */
    lokal?: boolean;
    hud: { an: boolean; ort: 'oben' | 'unten' | 'links' | 'rechts'; mitBild: boolean; text: string };
    discord?: { streamt: boolean; kanal: string | null; link: string | null } | null;
  }>>([]);
  useEffect(() => {
    if (!zugang.vip) return undefined;
    let weg = false;
    const holen = () => {
      fetch('/api/pov?modus=sichtbar', { cache: 'no-store' })
        .then((r) => r.json())
        .then((j) => { if (!weg && j?.ok && Array.isArray(j.pros)) setPovs(j.pros); })
        .catch(() => { /* beim naechsten Takt wieder */ });
    };
    holen();
    // Alle zwanzig Sekunden: so zeigt sich auch "Live auf Discord" zeitnah (der Server merkt sich die Antwort von Discord zwoelf Sekunden).
    const abbau = sichtbarerTakt(holen, 20_000);
    return () => { weg = true; abbau(); };
  }, [zugang.vip]);

  /*
   * Die Vorschlaege unter dem Suchfeld.
   *
   * Der Betreiber: "am besten kommt noch eine Liste darunter von den
   * Streamern, die gerade live sind ... die mit den meisten Zuschauern
   * zuerst. Wenn niemand live ist, die Top fuenf nach Followern. Und wenn
   * man doch jemand anderen meint, geht man auf Show more."
   *
   * Geholt wird bei jedem Buchstaben, ohne Pause - der Betreiber wollte
   * sehen, wie die Liste beim Tippen kleiner wird, "auch wenn ich keine
   * Pause mache, sondern durchgehend druecke". Die vorige Anfrage wird
   * dabei abgebrochen, und die vorige Liste bleibt stehen, bis die neue da
   * ist - sonst flackerte sie bei jedem Buchstaben leer.
   */
  interface KanalFund {
    login: string; name: string; live: boolean;
    zuschauer: number | null; follower: number | null; spiel: string; bild: string;
  }
  const [kanalFunde, setKanalFunde] = useState<KanalFund[]>([]);
  const [kanalSucheLaeuft, setKanalSucheLaeuft] = useState(false);
  const [kanalMehr, setKanalMehr] = useState(false);
  const [kanalListeOffen, setKanalListeOffen] = useState(false);
  useEffect(() => {
    const q = kachelSuche.trim();
    setKanalMehr(false);
    if (!q) { setKanalFunde([]); setKanalSucheLaeuft(false); return undefined; }
    const abbruch = new AbortController();
    setKanalSucheLaeuft(true);
    fetch(`/api/kanal-suche?q=${encodeURIComponent(q)}`, { signal: abbruch.signal })
      .then((r) => r.json())
      .then((j) => {
        if (abbruch.signal.aborted) return;
        setKanalFunde(Array.isArray(j?.kanaele) ? j.kanaele : []);
        setKanalListeOffen(true);
        setKanalSucheLaeuft(false);
      })
      .catch(() => { if (!abbruch.signal.aborted) { setKanalFunde([]); setKanalSucheLaeuft(false); } });
    return () => abbruch.abort();
  }, [kachelSuche]);

  /*
   * Was von den Funden zuerst zu sehen ist.
   *
   * Die Sendenden, wenn es welche gibt - sonst die fuenf mit den meisten
   * Followern. Alles Uebrige hinter "mehr anzeigen".
   */
  const kanalErste = useMemo(() => {
    const live = kanalFunde.filter((k) => k.live);
    return live.length ? live : kanalFunde.slice(0, 5);
  }, [kanalFunde]);
  const kanalGezeigt = kanalMehr ? kanalFunde : kanalErste;
  const kanalRest = kanalFunde.length - kanalErste.length;

  /** Zahlen wie Twitch sie schreibt: 1.2K, 107K. */
  const kurz = (n: number) => new Intl.NumberFormat('en', {
    notation: 'compact', maximumFractionDigits: 1,
  }).format(n);

  const kachelHinzufuegen = (eingabe: string) => {
    const name = eingabe.trim().toLowerCase()
      .replace(/^(https?:\/\/)?(www\.)?twitch\.tv\//, '')
      .replace(/[/?#].*$/, '')
      .replace(/^@/, '');
    if (!/^[a-z0-9_]{3,25}$/.test(name)) return false;
    /*
     * Was gerade zu sehen ist, bleibt.
     *
     * Ohne eigene Auswahl zeigt die Ansicht alle Sendenden des Ordners;
     * der erste getippte Name schreibt diese Kacheln fest und haengt sich
     * an - sonst verschwaenden drei laufende Streams, weil ein vierter
     * dazukommt.
     */
    const bisher = kachelnGezeigt.map((k) => k.twitch);
    setEigeneWahl(true);
    setKachelWahl((alt) => {
      const grundlage = alt.length ? alt : bisher;
      const neu = grundlage.includes(name) ? grundlage : [...grundlage, name];
      localStorage.setItem('multihub_kachel_wahl', JSON.stringify(neu));
      return neu;
    });
    setKachelSuche('');
    setKanalFunde([]);
    setKanalListeOffen(false);
    return true;
  };

  /*
   * Enter: der genaue Treffer, sonst der erste, sonst das Getippte.
   *
   * Wer "okis" tippt und "okisfn" ganz oben sieht, meint den; wer den
   * exakten Namen tippt, meint den, auch wenn ein groesserer Kanal
   * daruebersteht.
   */
  const kachelAusSuche = () => {
    const q = kachelSuche.trim().toLowerCase();
    const genau = kanalFunde.find((k) => k.login === q);
    const erster = kanalGezeigt[0];
    kachelHinzufuegen(genau?.login ?? erster?.login ?? kachelSuche);
  };

  const kachelFlaeche = useRef<HTMLDivElement | null>(null);
  const [flaeche, setFlaeche] = useState({ breite: 0, hoehe: 0 });
  useEffect(() => {
    const el = kachelFlaeche.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const beobachter = new ResizeObserver(() => {
      setFlaeche({ breite: el.clientWidth, hoehe: el.clientHeight });
    });
    beobachter.observe(el);
    setFlaeche({ breite: el.clientWidth, hoehe: el.clientHeight });
    return () => beobachter.disconnect();
  }, [mehrfach]);

  /**
   * Die Reihen der Kachelansicht.
   *
   * Gesucht ist die Spaltenzahl, bei der eine einzelne Kachel am groessten
   * wird - bei sechzehn zu neun und dem Platz, der wirklich da ist. Dafuer
   * werden alle Spaltenzahlen durchgerechnet: je Zahl ergibt sich eine
   * Reihenzahl, daraus eine Kachelbreite (begrenzt durch die Hoehe), und die
   * groesste gewinnt.
   *
   * Eine Obergrenze gibt es nicht. Wer zwanzig Streams offen hat, bekommt
   * zwanzig - sie werden eben kleiner, so wie beim Vorbild.
   */
  const kachelReihen = useMemo(() => {
    const n = kachelnGezeigt.length;
    if (!n) return { spalten: 1, reihen: [] as Streamer[][] };

    const breite = flaeche.breite || 1600;
    const hoehe = flaeche.hoehe || 900;
    const luecke = 12;

    let spalten = Math.ceil(Math.sqrt(n));
    let beste = 0;
    for (let k = 1; k <= n; k += 1) {
      const reihenZahl = Math.ceil(n / k);
      const kw = (breite - (k - 1) * luecke) / k;
      const kh = (hoehe - (reihenZahl - 1) * luecke) / reihenZahl;
      if (kw <= 0 || kh <= 0) continue;
      // Sechzehn zu neun: was zuerst ausgeht, bestimmt die Groesse.
      const wirklich = Math.min(kw, (kh * 16) / 9);
      if (wirklich > beste) { beste = wirklich; spalten = k; }
    }

    const reihen: Streamer[][] = [];
    for (let i = 0; i < n; i += spalten) {
      reihen.push(kachelnGezeigt.slice(i, i + spalten));
    }
    return { spalten, reihen };
  }, [kachelnGezeigt, flaeche]);
  const currentDashboardUser = verifiedUser?.trim().toLowerCase() || '';
  const twitchChatUsername = activeStreamerTwitch?.trim().toLowerCase() || '';
  const canShowTwitchChat = Boolean(showChat && currentHost && activeStreamerTwitch && !aktivPov);

  const filteredFolders = folders;

  const globalSearchResults = useMemo(() => {
    const query = sidebarSearchQuery.trim().toLowerCase();
    if (!query) return [] as Array<{ folderId: string; folderName: string; twitch: string | null; twitter: string | null }>;

    return folders.flatMap((folder) => {
      const folderMatches = folder.name.toLowerCase().includes(query);
      const matchingStreamers = (folder.streamers || []).filter((streamer) => {
        const twitch = streamer.twitch?.toLowerCase() || '';
        const twitter = streamer.twitter?.toLowerCase() || '';
        return twitch.includes(query) || twitter.includes(query) || folderMatches;
      });

      if (!folderMatches && matchingStreamers.length === 0) return [] as Array<{ folderId: string; folderName: string; twitch: string | null; twitter: string | null }>;

      return matchingStreamers.length > 0
        ? matchingStreamers.map((streamer) => ({
            folderId: folder.id,
            folderName: folder.name,
            twitch: streamer.twitch,
            twitter: streamer.twitter,
          }))
        : [{ folderId: folder.id, folderName: folder.name, twitch: null, twitter: null }];
    }).slice(0, 20);
  }, [folders, sidebarSearchQuery]);

  useEffect(() => {
    if (!isMounted || !activeStreamerTwitch) return;

    let cancelled = false;

    async function loadStats() {
      if (cancelled) return;
      setLoadingStats(true);
      try {
        const playerName = activeStreamerTwitch;
        let res = await fetch(`/api/br-statistik?playerName=${encodeURIComponent(playerName)}`);
        let data = await res.json();

        if (!cancelled && data && !data.error) {
          setStats(data);
        } else if (!cancelled) {
          res = await fetch(`/api/stats?epic=${encodeURIComponent(playerName)}`);
          data = await res.json();
          if (!cancelled) {
            setStats(data);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Fehler beim Laden der Stats:", err);
        }
      } finally {
        if (!cancelled) {
          setLoadingStats(false);
        }
      }
    }

    const timer = window.setTimeout(loadStats, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeStreamerTwitch, isMounted]);



  if (!isMounted) {
    return <LadeSchirm />;
  }

  const toggleChatVisibility = () => {
    const nextState = !showChat;
    setShowChat(nextState);
    localStorage.setItem('multihub_show_chat', String(nextState));
  };

  const toggleFolderPanel = () => {
    const nextState = !showFolderPanel;
    setShowFolderPanel(nextState);
    localStorage.setItem('multihub_show_folder_panel', String(nextState));
  };

  /** Genau diesen Stream neu laden - der Rest der Ansicht bleibt stehen. */
  const kachelNeuLaden = (twitch: string) => {
    setKachelNeu((alt) => ({ ...alt, [twitch]: (alt[twitch] ?? 0) + 1 }));
  };

  /**
   * Eine Kachel aus der Ansicht nehmen.
   *
   * Steht noch keine Auswahl fest, entscheidet die Ansicht selbst - dann
   * muss das Kreuz die uebrigen erst festschreiben, sonst waere die Kachel
   * beim naechsten Zeichnen wieder da.
   */
  const kachelEntfernen = (twitch: string, aktuell: string[]) => {
    setEigeneWahl(true);
    setKachelWahl((alt) => {
      const grundlage = alt.length ? alt : aktuell;
      const neu = grundlage.filter((x) => x !== twitch);
      localStorage.setItem('multihub_kachel_wahl', JSON.stringify(neu));
      return neu;
    });
  };

  /** Zurueck zur selbsttaetigen Wahl - alle, die gerade senden. */
  const kachelWahlLeeren = () => {
    setEigeneWahl(false);
    setKachelWahl([]);
    localStorage.removeItem('multihub_kachel_wahl');
  };

  /** Einen Streamer in die Kachelansicht nehmen oder herausnehmen. */
  const kachelWahlUmschalten = (twitch: string) => {
    setEigeneWahl(true);
    setKachelWahl((alt) => {
      const neu = alt.includes(twitch)
        ? alt.filter((x) => x !== twitch)
        : [...alt, twitch];
      localStorage.setItem('multihub_kachel_wahl', JSON.stringify(neu));
      return neu;
    });
  };

  const mehrfachUmschalten = () => {
    const naechster = !mehrfach;
    setMehrfach(naechster);
    localStorage.setItem('multihub_mehrfach', String(naechster));
  };

  const handleLogout = () => {
    localStorage.removeItem('streamer_dashboard_logged_in');
    setVerifiedUser(null);
    setAuthorized(false);
    window.location.href = '/api/auth/logout';
  };

  // Favorites-System
  const toggleFavorite = (twitchName: string) => {
    const updated = favoriteStreamers.includes(twitchName)
      ? favoriteStreamers.filter(s => s !== twitchName)
      : [...favoriteStreamers, twitchName];
    setFavoriteStreamers(updated);
    localStorage.setItem(getUserStorageKey('multihub_favorites'), JSON.stringify(updated));
  };

  // Notifications initialisieren / Toggle
  const toggleNotifications = () => {
    const newState = !notificationsEnabled;
    setNotificationsEnabled(newState);
    localStorage.setItem('multihub_notifications_enabled', newState ? 'true' : 'false');
    
    if (newState) {
      if (!('Notification' in window)) {
        alert('Your browser does not support notifications');
        setNotificationsEnabled(false);
        localStorage.setItem('multihub_notifications_enabled', 'false');
        return;
      }

      if (Notification.permission === 'denied') {
        alert('Browser notifications are disabled. Please enable them in your browser settings.');
        setNotificationsEnabled(false);
        localStorage.setItem('multihub_notifications_enabled', 'false');
        return;
      }

      if (Notification.permission !== 'granted') {
        Notification.requestPermission().then(permission => {
          if (permission !== 'granted') {
            setNotificationsEnabled(false);
            localStorage.setItem('multihub_notifications_enabled', 'false');
          }
        });
      }
    }
  };

  // Layout speichern - Alles speichern!
  const saveLayout = () => {
    const config = {
      // Chat & Stream
      chatHeight: showChat ? 450 : 0,
      sidebarWidth: 'auto',
      showChat: showChat,
      showFolderPanel: showFolderPanel,
      
      // Aktive Auswahl
      activeStreamerTwitch: activeStreamerTwitch,
      activeFolderId: activeFolderId,
      
      // UI-Status
      hiddenStreamers: hiddenStreamers,
      hiddenStats: hiddenStats,
      
      // Andere
      autoSortByLive: autoSortByLive,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem('multihub_layout_config', JSON.stringify(config));
    console.log('✅ Session gespeichert:', config);
  };

  // Layout laden - Alles wiederherstellen!
  const loadLayout = () => {
    const saved = localStorage.getItem('multihub_layout_config');
    if (saved) {
      try {
        const config = JSON.parse(saved);
        
        // Chat & Stream
        if (config.showChat !== undefined) setShowChat(config.showChat);
        if (config.showFolderPanel !== undefined) setShowFolderPanel(config.showFolderPanel);
        
        // Aktive Auswahl
        if (config.activeStreamerTwitch !== undefined) setActiveStreamerTwitch(config.activeStreamerTwitch);
        if (config.activeFolderId !== undefined) setActiveFolderId(config.activeFolderId);
        
        // Streamer & Ordner
        if (config.hiddenStats !== undefined) setHiddenStats(config.hiddenStats);
        
        // Andere
        if (config.autoSortByLive !== undefined) setAutoSortByLive(config.autoSortByLive);
        
        console.log('✅ Komplette Session wiederhergestellt:', config);
      } catch (e) {
        console.error('Fehler beim Laden des Layouts:', e);
      }
    }
  };

  const handleStreamerClick = (twitch: string) => {
    setActiveStreamerTwitch(twitch);
    setStreamVolume(DEFAULT_STREAM_VOLUME);
    localStorage.setItem('multihub_last_streamer', twitch);
  };

  const selectFolder = (folderId: string) => {
    setActiveFolderId(folderId);
    localStorage.setItem('multihub_last_folder', folderId);
  };

  const handleFolderClick = (e: React.MouseEvent, folderId: string) => {
    // Shift+click: toggle folder selection for multi-select
    if (e.shiftKey) {
      setSelectedFolderIds(prev => {
        const exists = prev.includes(folderId);
        if (exists) return prev.filter(id => id !== folderId);
        return [...prev, folderId];
      });
      // clear single active folder when multi-selecting
      setActiveFolderId('');
      localStorage.removeItem('multihub_last_folder');
      return;
    }

    // Regular click: clear multi-selection and select single folder
    setSelectedFolderIds([]);
    setActiveFolderId(folderId);
    localStorage.setItem('multihub_last_folder', folderId);
  };

  const deleteFolder = (folderId: string) => {
    if (folders.length <= 1) {
      alert("Du musst mindestens einen Ordner behalten!");
      return;
    }
    const updated = folders.filter(f => f.id !== folderId);
    persistFolders(updated);
    
    if (activeFolderId === folderId) {
      const nextFolder = updated[0];
      setActiveFolderId(nextFolder.id);
      localStorage.setItem('multihub_last_folder', nextFolder.id);
    }
  };

  const getFolderLiveCount = (folder: Folder) => {
    return folder.streamers.filter(s => liveStatusMap[s.twitch.toLowerCase()]).length;
  };

  // Sortiere Streamer nach Online-Status (Live nach Zuschauerzahl absteigend, dann Offline alphabetisch)
  const getSortedStreamers = (streamers: Streamer[]) => {
    if (!autoSortByLive || isGuest) {
      return streamers;
    }

    return [...streamers].sort((a, b) => {
      const aIsLive = liveStatusMap[a.twitch.toLowerCase()] || false;
      const bIsLive = liveStatusMap[b.twitch.toLowerCase()] || false;
      
      // Live-Streamer zuerst
      if (aIsLive && !bIsLive) return -1;
      if (!aIsLive && bIsLive) return 1;
      
      // Falls gleicher Status: alphabetisch
      return a.twitch.localeCompare(b.twitch);
    });
  };

  // Check status of all streamers in the folder
  const checkAllStreamersStatus = async (folderStreamers: Streamer[]) => {
    for (const streamer of folderStreamers) {
      await checkStreamerStatus(streamer.twitch);
    }
  };

  const createFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest) return;
    if (!newFolderName.trim()) return;
    
    const newFolder: Folder = {
      id: Date.now().toString(),
      name: newFolderName.trim(),
      streamers: []
    };

    const updated = [...folders, newFolder];
    setActiveFolderId(newFolder.id);
    localStorage.setItem('multihub_last_folder', newFolder.id);
    persistFolders(updated, { activeFolderId: newFolder.id });
    setNewFolderName('');
  };

  const addStreamerToFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest) return;
    if (!newTwitchName.trim()) return;

    const twitchClean = newTwitchName.trim().toLowerCase();
    const twitterClean = newTwitterName.trim() ? newTwitterName.trim().replace('@', '') : twitchClean;
    
    const newStreamer: Streamer = {
      twitch: twitchClean,
      twitter: twitterClean,
      createdBy: currentDashboardUser || undefined,
    };

    const updated = folders.map(f => {
      if (f.id === activeFolderId) {
        const list = Array.isArray(f.streamers) ? f.streamers : [];
        if (list.some(s => s.twitch === twitchClean)) return f;
        return {
          ...f,
          streamers: [...list, newStreamer]
        };
      }
      return f;
    });

    persistFolders(updated);
    
    // Speichere neuen Streamer in custom streamers
    handleStreamerClick(twitchClean);
    setNewTwitchName('');
    setNewTwitterName('');
  };

  const updateStreamerSpecs = () => {
    if (!currentStreamerObj) return;

    const updated = folders.map(f => {
      return {
        ...f,
        streamers: f.streamers.map(s => {
          if (s.twitch === activeStreamerTwitch) {
            return { 
              ...s, 
              twitter: newTwitterName.trim().replace('@', '') || s.twitch
            };
          }
          return s;
        })
      };
    });

    persistFolders(updated);
  };

  const openEditTwitter = (twitchName: string, currentTwitter?: string) => {
    setEditingTwitter(twitchName);
    setEditTwitterInput(currentTwitter || twitchName);
  };

  const cancelEditTwitter = () => {
    setEditingTwitter(null);
    setEditTwitterInput('');
  };

  const saveEditTwitter = (twitchName: string) => {
    const newHandle = editTwitterInput.trim().replace('@', '') || twitchName;

    const updated = folders.map(f => ({
      ...f,
      streamers: f.streamers.map(s => s.twitch === twitchName ? { ...s, twitter: newHandle } : s)
    }));

    persistFolders(updated);
    setEditingTwitter(null);
    setEditTwitterInput('');
  };

  const removeStreamerFromFolder = (twitchName: string) => {
    if (isGuest) return;

    const currentUser = verifiedUser?.trim().toLowerCase() || '';
    const updated = folders.map(f => {
      if (f.id === activeFolderId) {
        return {
          ...f,
          streamers: f.streamers.filter((s) => {
            if (s.twitch !== twitchName) return true;
            if (isAdmin) return false;
            return s.createdBy?.trim().toLowerCase() === currentUser;
          }),
        };
      }
      return f;
    });
    persistFolders(updated);
  };

  const toggleHideStreamer = (twitchName: string) => {
    let updatedHidden = [...hiddenStreamers];
    if (updatedHidden.includes(twitchName)) {
      updatedHidden = updatedHidden.filter(s => s !== twitchName);
    } else {
      updatedHidden.push(twitchName);
    }
    setHiddenStreamers(updatedHidden);
    localStorage.setItem('multihub_hidden_v2', JSON.stringify(updatedHidden));
  };



  const toggleHideStats = (twitchName: string) => {
    let updatedHiddenStats = [...hiddenStats];
    if (updatedHiddenStats.includes(twitchName)) {
      updatedHiddenStats = updatedHiddenStats.filter(s => s !== twitchName);
    } else {
      updatedHiddenStats.push(twitchName);
    }
    setHiddenStats(updatedHiddenStats);
    localStorage.setItem('multihub_hidden_stats_v2', JSON.stringify(updatedHiddenStats));
  };

  const handleFolderRename = (folderId: string, newName: string) => {
    if (isGuest) return;
    if (!newName.trim()) return;
    const updated = folders.map(f => 
      f.id === folderId ? { ...f, name: newName.trim() } : f
    );
    persistFolders(updated);
    setRenamingFolderId(null);
    setRenameFolderInput('');
  };

  // Twitch Search Function
  const searchTwitchChannels = async (query: string) => {
    if (!query.trim()) {
      setTwitchSearchResults([]);
      return;
    }

    setSearchingTwitch(true);
    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(query)}&sortBy=${searchSortBy}&liveOnly=${searchLiveOnly}`
      );
      
      if (!response.ok) {
        setTwitchSearchResults([]);
      } else {
        const data = await response.json();
        setTwitchSearchResults(data.channels || []);
      }
    } catch (err) {
      console.error('Search error:', err);
      setTwitchSearchResults([]);
    } finally {
      setSearchingTwitch(false);
    }
  };

  const addFromSearch = (result: any) => {
    if (!currentFolder) return;
    const twitchClean = result.twitch.toLowerCase();
    const twitterClean = result.twitter || result.twitch;
    
    const newStreamer: Streamer = {
      twitch: twitchClean,
      twitter: twitterClean,
      createdBy: currentDashboardUser || undefined,
    };

    const updated = folders.map(f => {
      if (f.id === activeFolderId) {
        const list = Array.isArray(f.streamers) ? f.streamers : [];
        if (list.some(s => s.twitch === twitchClean)) return f;
        return {
          ...f,
          streamers: [...list, newStreamer]
        };
      }
      return f;
    });

    persistFolders(updated);
    setTwitchSearchQuery('');
    setTwitchSearchResults([]);
  };

  /*
   * Die Mehrfachansicht: eine eigene Wand nach dem Vorbild von viewington.com/watch.
   *
   * Der Betreiber (11.10.2026): die Stream-Seite soll "eins zu eins wie bei Viewington" werden - Wand
   * ueber den ganzen Bildschirm, Seitenleiste, Einstellungen -, nur in den Farben von CompHub. Die
   * Ordner bleiben: die Wand liest sie, legt Streamer hinein und speichert die Wand als neuen Ordner.
   * Die Einzelansicht darunter bleibt, wie sie war.
   */
  if (mehrfach && currentHost) {
    const mvStart = eigeneWahl && kachelWahl.length
      ? kachelWahl
      : kachelnGezeigt.length ? kachelnGezeigt.map((k) => k.twitch)
      : activeStreamerTwitch ? [activeStreamerTwitch] : [];
    return (
      <Multiview
        host={currentHost}
        start={mvStart}
        ordner={folders}
        ordnerLive={liveStatusMap}
        povs={povs}
        darfOrdner={!isGuest && (darfOrdner || isAdmin)}
        ordnerSpeichern={(name, kanaele) => {
          if (isGuest) return;
          const neuerOrdner: Folder = {
            id: Date.now().toString(),
            name,
            streamers: kanaele.map((k) => ({ twitch: k, twitter: k, createdBy: currentDashboardUser || undefined })),
          };
          persistFolders([...folders, neuerOrdner]);
        }}
        kannAusOrdner={(ordnerId, kanal) => {
          if (isGuest) return false;
          if (isAdmin) return true;
          const st = folders.find((f) => f.id === ordnerId)?.streamers.find((x) => x.twitch === kanal);
          // Wer nicht Admin ist, nimmt nur heraus, was er selbst hineingelegt hat.
          return !!st && !!currentDashboardUser && st.createdBy?.trim().toLowerCase() === currentDashboardUser;
        }}
        ausOrdner={(ordnerId, kanal) => {
          if (isGuest) return;
          persistFolders(folders.map((f) => (f.id === ordnerId
            ? { ...f, streamers: f.streamers.filter((x) => x.twitch !== kanal) }
            : f)));
        }}
        zuOrdner={(ordnerId, kanal) => {
          if (isGuest) return;
          persistFolders(folders.map((f) => (f.id === ordnerId && !f.streamers.some((x) => x.twitch === kanal)
            ? { ...f, streamers: [...f.streamers, { twitch: kanal, twitter: kanal, createdBy: currentDashboardUser || undefined }] }
            : f)));
        }}
        zurEinzelansicht={mehrfachUmschalten}
      />
    );
  }

  /*
   * Die Einzelansicht: ein Stream gross, links dieselbe Seitenleiste wie in der Multiview (app/streams/Einzelansicht.tsx).
   *
   * Der Betreiber (12.10.2026): die Einzelansicht soll "komplett gleich" aussehen wie die Multiview. Hier bleibt, was
   * gerechnet und gespeichert wird - Ordner, Favoriten, Live-Stand; die Anzeige liegt in der eigenen Datei.
   */
  const darfOrdnerHier = !isGuest && (darfOrdner || isAdmin);
  return (
    <Einzelansicht
      host={currentHost}
      ordner={folders}
      aktivOrdner={activeFolderId}
      waehleOrdner={(id) => {
        setActiveFolderId(id);
        if (id) localStorage.setItem('multihub_last_folder', id); else localStorage.removeItem('multihub_last_folder');
      }}
      live={liveStatusMap}
      favoriten={favoriteStreamers}
      favoritUmschalten={toggleFavorite}
      aktiv={activeStreamerTwitch}
      waehleStreamer={handleStreamerClick}
      aktivPov={aktivPov}
      waehlePov={setAktivPov}
      povs={povs}
      einst={mvEinst}
      aendereBanner={aendereBannerSolo}
      aendereStats={aendereStatsSolo}
      gast={isGuest}
      darfOrdner={darfOrdnerHier}
      kannEntfernen={(ordnerId, kanal) => {
        if (isGuest) return false;
        if (isAdmin) return true;
        const st = folders.find((f) => f.id === ordnerId)?.streamers.find((x) => x.twitch === kanal);
        return !!st && !!currentDashboardUser && st.createdBy?.trim().toLowerCase() === currentDashboardUser;
      }}
      ordnerAnlegen={(name) => {
        if (isGuest || !name.trim()) return;
        const neu: Folder = { id: Date.now().toString(), name: name.trim(), streamers: [] };
        setActiveFolderId(neu.id);
        localStorage.setItem('multihub_last_folder', neu.id);
        persistFolders([...folders, neu], { activeFolderId: neu.id });
      }}
      ordnerUmbenennen={handleFolderRename}
      ordnerLoeschen={deleteFolder}
      streamerHinzufuegen={(ordnerId, kanal) => {
        if (isGuest) return;
        const sauber = kanal.trim().toLowerCase();
        if (!sauber) return;
        persistFolders(folders.map((f) => (f.id === ordnerId && !f.streamers.some((x) => x.twitch === sauber)
          ? { ...f, streamers: [...f.streamers, { twitch: sauber, twitter: sauber, createdBy: currentDashboardUser || undefined }] }
          : f)));
        handleStreamerClick(sauber);
      }}
      streamerEntfernen={(ordnerId, kanal) => {
        if (isGuest) return;
        persistFolders(folders.map((f) => (f.id === ordnerId
          ? {
            ...f,
            streamers: f.streamers.filter((x) => {
              if (x.twitch !== kanal) return true;
              if (isAdmin) return false;
              return x.createdBy?.trim().toLowerCase() === currentDashboardUser;
            }),
          }
          : f)));
      }}
      chatAn={showChat}
      chatUmschalten={toggleChatVisibility}
      lautstaerke={streamVolume}
      zurMultiview={mehrfachUmschalten}
    />
  );
}