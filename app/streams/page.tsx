'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getDashboardAccountName, getUserStorageKey, loadUserStorageValue, saveUserStorageValue, saveUserStorageCloud, loadUserStorageCloud } from '@/app/lib/userStorage';
import { normalizeLiveStatusUsername, shouldLoadLiveStatus } from '@/app/lib/liveStatus';


import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { useZugang } from '@/app/lib/zugang';
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

interface Tournament {
  id: string;
  name: string;
  category?: string;
  round?: string;
  status: 'live' | 'upcoming' | 'completed';
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
  const [activeStreamerTwitch, setActiveStreamerTwitch] = useState<string>('');
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
  const [lastAdCheck, setLastAdCheck] = useState(0);
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
        if (isAdmin) {
          const response = await fetch('/api/dashboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folders: normalizedFolders }),
          });
          if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to save dashboard:', response.status, errorText);
          }
        } else if (authorized) {
          await saveUserStorageCloud('multihub_folders', normalizedFolders);
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
  const [showLiveFinalsLeaderboard, setShowLiveFinalsLeaderboard] = useState(false);
  
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

  // Notifications für Favorites-Streamer
  useEffect(() => {
    const fetchLiveFinalsStatus = async () => {
      try {
        const response = await fetch('/api/tournaments');
        if (!response.ok) return;

        const data = await response.json();
        const hasLiveFinals = Array.isArray(data.tournaments) && data.tournaments.some((tournament: Tournament) => {
          const summary = `${tournament.name} ${tournament.category ?? ''} ${tournament.round ?? ''}`.toLowerCase();
          return tournament.status === 'live' && summary.includes('final');
        });

        setShowLiveFinalsLeaderboard(hasLiveFinals);
      } catch (error) {
        console.error('Unable to determine live finals status:', error);
      }
    };

    fetchLiveFinalsStatus();
    const interval = setInterval(fetchLiveFinalsStatus, 30000);
    return () => clearInterval(interval);
  }, []);

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

    const timer = window.setTimeout(() => {
      void loadAllLiveStatus();
    }, 1500);

    const interval = window.setInterval(loadAllLiveStatus, 60000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [isMounted, isGuest, loadAllLiveStatus]);

  // Auto-skip ads / ad-break fallback
  // Vollständige Ad-Erkennung über Twitch-Embeds ist in Browsern nicht zuverlässig möglich,
  // da der eingebettete Player aus Sicherheitsgründen nicht vollständig ausgelesen werden kann.
  // Daher wechseln wir bestmöglich auf einen anderen live Streamer, wenn der aktuelle Stream
  // gerade nicht mehr live ist oder der Player in einen Ad-/Break-Zustand geraten ist.
  useEffect(() => {
    const checkForAds = setInterval(() => {
      try {
        if (!activeStreamerTwitch) return;

        const currentName = activeStreamerTwitch.toLowerCase();
        const currentIsLive = liveStatusMap[currentName] === true;

        if (!currentIsLive && Date.now() - lastAdCheck > 3000) {
          const allAvailableStreamers = folders.flatMap(folder =>
            folder.streamers.map(streamer => streamer.twitch.toLowerCase())
          );

          const onlineStreams = allAvailableStreamers.filter(
            streamer => streamer !== currentName && liveStatusMap[streamer] === true
          );

          if (onlineStreams.length > 0) {
            const nextStream = onlineStreams[0];
            setActiveStreamerTwitch(nextStream);
            localStorage.setItem('multihub_last_streamer', nextStream);
            setLastAdCheck(Date.now());
            console.log(`[Auto-switch] ${currentName} not live -> ${nextStream}`);
          }
        }
      } catch (e) {
        console.error('Ad switch error:', e);
      }
    }, 2000);

    return () => clearInterval(checkForAds);
  }, [activeStreamerTwitch, folders, lastAdCheck, liveStatusMap]);



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

  const loadDashboardData = useCallback(async () => {
    if (isAdmin) {
      const serverFolders = await loadDashboardFromServer();
      setFolders(serverFolders);
      return serverFolders;
    }

    if (authorized) {
      const userFolders = await loadUserStorageCloud<Folder[]>('multihub_folders');
      if (Array.isArray(userFolders) && userFolders.length > 0) {
        setFolders(userFolders);
        return userFolders;
      }
    }

    const serverFolders = await loadDashboardFromServer();
    setFolders(serverFolders);
    return serverFolders;
  }, [authorized, isAdmin, loadDashboardFromServer]);

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

    // Lade Dashboard-Daten vom Server
loadDashboardData().then(loadedFolders => {
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
    // check server auth for verified user
    (async () => {
      try {
        const res = await fetch('/api/auth/verify');
        if (!res.ok) {
          setAuthorized(false);
          return;
        }
        const j = await res.json();
        if (j?.authorized && j.user) {
          const login = String(j.user).trim().toLowerCase();
          setVerifiedUser(login);
          setAuthorized(true);
          setIsAdmin(login === 'admin-juanito');
        } else {
          setAuthorized(false);
          setIsAdmin(false);
        }
      } catch (e) {
        setAuthorized(false);
      }
    })();

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
      const gewaehlt = kachelWahl
        .map((name) => alleStreamer.get(name))
        .filter((st): st is Streamer => Boolean(st)
          && !hiddenStreamers.includes((st as Streamer).twitch));
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
  const kachelReihen = useMemo(() => {
    const n = kachelnGezeigt.length;
    if (!n) return { spalten: 1, reihen: [] as Streamer[][] };
    const spalten = Math.ceil(Math.sqrt(n));
    const reihen: Streamer[][] = [];
    for (let i = 0; i < n; i += spalten) {
      reihen.push(kachelnGezeigt.slice(i, i + spalten));
    }
    return { spalten, reihen };
  }, [kachelnGezeigt]);
  const currentDashboardUser = verifiedUser?.trim().toLowerCase() || '';
  const twitchChatUsername = activeStreamerTwitch?.trim().toLowerCase() || '';
  const canShowTwitchChat = Boolean(showChat && currentHost && activeStreamerTwitch);

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
    return <div className="min-h-screen bg-zinc-950 text-zinc-500 p-6 font-sans"><T>Loading...</T></div>;
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

  return (
    <div className="h-screen w-full bg-zinc-950 text-white max-w-[2000px] mx-auto px-4 md:px-6 font-sans flex flex-col gap-2 relative overflow-auto pb-8 ${(previewMode && tourMode) ? 'pointer-events-none' : ''}">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white"><T>Streamer Dashboard</T></h1>
          <p className="text-sm text-slate-400">Use the login page to start a preview tour; editing is locked unless authenticated.</p>
        </div>
      </div>
      {previewMode && (
        <div className="rounded-3xl border border-slate-700 bg-slate-950/90 p-3 text-sm text-slate-300 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-slate-100"><T>Preview tour active</T></p>
              <p className="text-slate-400"><T>This tour guides you through the dashboard only. User interaction is limited until the tour is finished.</T></p>
            </div>
              {tourMode && (
              <button
                type="button"
                onClick={() => router.replace('/anmelden')}
                className="inline-flex items-center justify-center rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400"
              >
                <T>Finish tour</T>
              </button>
            )}
          </div>
        </div>
      )}
<div className={`flex-1 grid grid-cols-1 gap-2 items-stretch min-h-0 ${showFolderPanel ? 'lg:grid-cols-[450px_minmax(0,1fr)]' : 'lg:grid-cols-1'}`}>
        
        <div data-tour="sidebar" className={`${showFolderPanel
          ? (ordnerAufHandy ? 'block' : 'hidden lg:block')
          : 'hidden'} relative flex flex-col gap-6 bg-zinc-900/30 p-4 rounded-xl border border-zinc-900 transition-all duration-300`}>
          <button
            onClick={toggleFolderPanel}
            className="absolute top-5 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-950/95 shadow-sm shadow-black/20 transition hover:bg-zinc-900"
            title={showFolderPanel ? 'Hide folder panel' : 'Show folder panel'}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
              <svg viewBox="0 0 24 24" className="h-3 w-3 text-slate-300">
                <polyline points={showFolderPanel ? "14 18 8 12 14 6" : "10 18 16 12 10 6"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
            {/* Favorites-Sektion */}
          {favoriteStreamers.length > 0 && (
            <div className="border-t border-zinc-800 pt-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400 mb-3"> Favorites ({favoriteStreamers.length})</h2>
              <div className="flex flex-col gap-1.5">
                {favoriteStreamers.map((twitchName) => {
                  const streamer = folders.flatMap(f => f.streamers).find(s => s.twitch === twitchName);
                  const isLive = liveStatusMap[twitchName.toLowerCase()] || false;
                  
                  return (
                    <button
                      key={twitchName}
                      onClick={() => {
                        setActiveStreamerTwitch(twitchName);
                        localStorage.setItem('multihub_last_streamer', twitchName);
                      }}
                      className={`text-left px-2.5 py-1.5 rounded text-xs font-semibold transition-all border ${
                        activeStreamerTwitch === twitchName
                          ? 'bg-slate-900/60 border-slate-700 shadow-md'
                          : isLive
                          ? 'bg-slate-900/60 border-slate-700 hover:border-slate-500'
                          : 'bg-zinc-900/50 border-zinc-800/50 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {isLive ? (
                          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-zinc-700" />
                        )}
                        <span>{twitchName}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500"><T>My folders</T></h2>
            </div>

            <div className="relative mb-3 flex items-center gap-2 flex-nowrap">
              <input
                ref={sidebarSearchInputRef}
                type="text"
                value={sidebarSearchQuery}
                onChange={(e) => setSidebarSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { if (!showFolderPanel) setShowFolderPanel(true); performSidebarSearch(); } }}
                placeholder={t('Folder / streamer search...')}
                className="min-w-[130px] max-w-[190px] bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-200 outline-none placeholder:text-zinc-600"
                aria-label={t('Search')}
              />
              <button
                type="button"
                onClick={() => {
                  if (!showFolderPanel) setShowFolderPanel(true);
                  if (!sidebarSearchQuery.trim()) {
                    sidebarSearchInputRef.current?.focus();
                  } else {
                    performSidebarSearch();
                  }
                }}
                className="h-7 w-7 flex items-center justify-center rounded-full border border-zinc-800 bg-zinc-950/70 text-[13px] text-zinc-500 hover:text-zinc-200"
                title={t('Search')}
              >
                ⌕
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              {filteredFolders.map(f => {
                return (
                  <div
                    key={f.id}
                    className={`flex items-center justify-between group/folder rounded px-3 py-2 transition-all ${
                        (activeFolderId === f.id || selectedFolderIds.includes(f.id))
                          ? 'bg-slate-800 text-white shadow-md shadow-slate-900/20' 
                          : 'bg-zinc-950/50 border border-zinc-900/60 text-slate-400 hover:border-slate-800'
                      }`}
                  >
                    {renamingFolderId === f.id ? (
                    <input
                      autoFocus
                      type="text"
                      placeholder={t('Folder name')}
                      aria-label={t('Edit folder name')}
                      value={renameFolderInput}
                      onChange={(e) => setRenameFolderInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleFolderRename(f.id, renameFolderInput);
                        } else if (e.key === 'Escape') {
                          setRenamingFolderId(null);
                          setRenameFolderInput('');
                        }
                      }}
                      onBlur={() => {
                        handleFolderRename(f.id, renameFolderInput);
                      }}
                      className="bg-zinc-900 border border-slate-700 rounded px-2 py-1 text-xs font-semibold uppercase tracking-wider flex-1"
                    />
                  ) : (
                    <button
                      onClick={(e) => handleFolderClick(e, f.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'F2' && activeFolderId === f.id) {
                          e.preventDefault();
                          setRenamingFolderId(f.id);
                          setRenameFolderInput(f.name);
                        }
                      }}
                      className={`text-left text-xs font-semibold uppercase tracking-wider flex-1 truncate`}
                    >
                      📁 {f.name}
                      <span className="text-[10px] opacity-60 ml-2">({f.streamers?.length || 0})</span>
                      <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                        {getFolderLiveCount(f)}
                      </span>
                    </button>
                  )}
                  <div className="flex items-center gap-1 opacity-0 group-hover/folder:opacity-100 transition-opacity">
                          {!isGuest && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingFolderId(f.id);
                            setRenameFolderInput(f.name);
                          }}
                          className={`text-xs opacity-0 group-hover/folder:opacity-100 transition-opacity ${
                            activeFolderId === f.id ? 'text-slate-100 hover:text-white' : 'text-slate-400 hover:text-slate-100'
                          }`}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if(confirm(`Ordner "${f.name}" wirklich löschen?`)) deleteFolder(f.id);
                          }}
                          className={`text-xs ml-2 opacity-0 group-hover/folder:opacity-100 transition-opacity ${
                            activeFolderId === f.id ? 'text-slate-100 hover:text-white' : 'text-slate-400 hover:text-slate-100'
                          }`}
                        >
                          ⌫
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            </div>

            {!darfOrdner ? (
              <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-slate-400">
                {isGuest
                  ? <T>Ordner anlegen geht nur angemeldet.</T>
                  : <T>Eigene Ordner anlegen gehört zum VIP-Zugang. Spieler
                       hinzufügen kannst du mit deinem Konto trotzdem.</T>}
              </div>
            ) : (
              <form onSubmit={createFolder} className="mt-3 flex gap-2">
                <input
                  type="text"
                  placeholder={t('+ New folder name...')}
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="bg-zinc-950 border border-zinc-900 rounded px-2 py-1.5 text-xs w-full focus:outline-none focus:border-zinc-700 text-zinc-300"
                />
                <button type="submit" className="bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded text-xs font-bold transition"><T>Create</T></button>
              </form>
            )}


          </div>

          

          {(currentFolder || (selectedFolderIds && selectedFolderIds.length > 0)) && (
            <div data-tour="search" className="border-t border-zinc-900 pt-4">
             

              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">{
                  selectedFolderIds && selectedFolderIds.length > 0
                    ? `Selected: ${folders.filter(f => selectedFolderIds.includes(f.id)).map(f => f.name).join(', ')}`
                    : `Streamers in "${currentFolder?.name || ''}"`
                }</h2>
              </div>

              {isGuest || (selectedFolderIds && selectedFolderIds.length > 0) ? (
                <div className="flex flex-col gap-2 mb-4 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 text-xs text-slate-400">
                  <div className="font-semibold text-slate-100"><T>Streamer add/remove disabled</T></div>
                  <div>
                    {selectedFolderIds && selectedFolderIds.length > 0
                      ? <T>Bei mehreren gewählten Ordnern lässt sich nichts hinzufügen.</T>
                      : <T>Angemeldet kannst du hier Spieler hinzufügen und entfernen.</T>}
                  </div>
                </div>
              ) : (
                <form onSubmit={addStreamerToFolder} className="flex flex-col gap-2 mb-4 bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-900">
                  <input
                    type="text"
                    placeholder="1. Twitch Name (e.g. vadeal)"
                    value={newTwitchName}
                    onChange={(e) => setNewTwitchName(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-slate-500 text-zinc-200"
                  />
                  <input
                    type="text"
                    placeholder="2. Twitter Handle (optional)"
                    value={newTwitterName}
                    onChange={(e) => setNewTwitterName(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-slate-500 text-zinc-200"
                  />
                  <button type="submit" className="bg-slate-700 hover:bg-slate-600 py-1.5 rounded text-xs font-bold transition text-white"><T>Add streamer</T></button>
                </form>
              )}

              <div className="relative mb-3">
                <input
                  type="text"
                  placeholder=" Looking for streamers..."
                  value={streamerSearchQuery}
                  onChange={(e) => setStreamerSearchQuery(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-slate-500 text-zinc-200 placeholder-zinc-600"
                />
                {streamerSearchQuery && (
                  <button onClick={() => setStreamerSearchQuery('')} className="absolute right-2.5 top-2 text-xs text-zinc-500 hover:text-zinc-300">✕</button>
                )}
              </div>

              <div className="flex flex-col gap-1.5 max-h-[350px] overflow-y-auto pr-1">
                {getSortedStreamers(
                  displayedStreamers.filter(s => s.twitch.toLowerCase().includes(streamerSearchQuery.toLowerCase()))
                ).map((s, idx) => {
                    const isHidden = hiddenStreamers.includes(s.twitch);
                    const isCurrentActive = activeStreamerTwitch === s.twitch;
                    const isLive = liveStatusMap[s.twitch.toLowerCase()] || false;

                    return (
                      <div 
                        key={s.twitch}
                        className={`flex items-center justify-between p-2 rounded border group transition-all ${
                          isCurrentActive ? 'bg-zinc-900/80 border-zinc-700 shadow-md' : 'bg-zinc-950/30 border-zinc-900/50 hover:border-zinc-800'
                        } ${isHidden ? 'opacity-30' : ''}`}
                      >
                        <div className="flex-1 flex flex-col min-w-0">
                          <button 
                            type="button"
                            onClick={() => {
                              setActiveStreamerTwitch(s.twitch);
                              setStreamVolume(DEFAULT_STREAM_VOLUME);
                              localStorage.setItem('multihub_last_streamer', s.twitch);
                            }}
                            className="text-left text-sm font-medium truncate hover:text-slate-200 transition-colors"
                          >
                            <span className="flex items-center gap-1.5">
                              {isLive ? (
                                <>
                                  <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" title={t('Live!')} />
                                  <span className="text-[8px] bg-red-900 text-red-100 px-1.5 rounded font-semibold uppercase tracking-[0.12em]"><T>LIVE</T></span>
                                </>
                              ) : (
                                <span className="text-[8px] bg-zinc-700 text-zinc-300 px-1.5 rounded font-medium"><T>Offline</T></span>
                              )}
                                <span className={isLive ? 'text-white font-semibold' : 'text-slate-400'}>{s.twitch}</span>
                            </span>
                          </button>
                          {editingTwitter === s.twitch ? (
                            <div className="mt-1 flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                              <input
                                type="text"
                                value={editTwitterInput}
                                onChange={(event) => setEditTwitterInput(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    saveEditTwitter(s.twitch);
                                  }
                                }}
                                placeholder="@handle"
                                className="w-full bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-zinc-200 focus:outline-none focus:border-slate-500"
                              />
                              <button
                                type="button"
                                onClick={() => saveEditTwitter(s.twitch)}
                                className="px-1.5 py-1 rounded bg-emerald-700/80 text-[10px] text-white hover:bg-emerald-600"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditTwitter}
                                className="px-1.5 py-1 rounded bg-zinc-700 text-[10px] text-zinc-200 hover:bg-zinc-600"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <div className="text-[9px] font-normal tracking-normal text-slate-400 mt-1 flex items-center gap-1">
                              <span className="text-slate-500">𝕏:&nbsp;</span>
                              {s.twitter ? (
                                <a
                                  href={`https://twitter.com/${s.twitter.replace(/^@/, '')}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(event) => event.stopPropagation()}
                                  className="inline-block max-w-max text-slate-400 hover:text-slate-100 hover:underline"
                                >
                                  {s.twitter}
                                </a>
                              ) : (
                                <span className="text-zinc-600"><T>kein Handle</T></span>
                              )}
                              {!isGuest && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openEditTwitter(s.twitch, s.twitter);
                                  }}
                                  className="text-[10px] text-slate-500 hover:text-slate-200"
                                  title={t('Twitter-Handle bearbeiten')}
                                >
                                  ✎
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1 opacity-100 xl:opacity-0 group-hover:opacity-100 transition-opacity">
                          {/*
                            * In die Kachelansicht nehmen. Bleibt sichtbar,
                            * sobald etwas gewaehlt ist - sonst faende man
                            * nicht wieder heraus, warum nur diese vier
                            * Kacheln erscheinen.
                            */}
                          <button
                            type="button"
                            onClick={() => kachelWahlUmschalten(s.twitch)}
                            className={`rounded p-1 text-xs transition ${
                              kachelWahl.includes(s.twitch)
                                ? 'bg-sky-500/15 text-sky-400'
                                : 'text-slate-400 hover:bg-zinc-800'}`}
                            title={kachelWahl.includes(s.twitch)
                              ? t('Aus der Kachelansicht nehmen')
                              : t('In die Kachelansicht nehmen')}
                          >
                            {kachelWahl.includes(s.twitch) ? '−' : '+'}
                          </button>
                          <button type="button" onClick={() => toggleFavorite(s.twitch)} className="p-1 hover:bg-zinc-800 rounded text-xs transition text-slate-400">
                            {favoriteStreamers.includes(s.twitch) ? '⭐' : '☆'}
                          </button>
                          {!isGuest && (isAdmin || s.createdBy?.trim().toLowerCase() === currentDashboardUser) && (
                            <button type="button" onClick={() => removeStreamerFromFolder(s.twitch)} className="p-1 hover:bg-zinc-800 rounded text-xs text-zinc-500 hover:text-white" title={t('Remove')}>⌫</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div data-tour="controls" className="flex flex-col gap-3 mb-4">
            {isGuest && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-3 text-xs text-slate-400">
                <T>Guest mode active: editing is disabled. Log in to manage your own folders.</T>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {/*
                * Nur auf dem Handy: die Ordner ein- und ausblenden.
                *
                * Steht links in der Reihe, damit er nicht zwischen den
                * Ansichtsknoepfen rechts untergeht - er ist hier der
                * haeufigste Griff.
                */}
              {showFolderPanel && (
                <button type="button" onClick={() => setOrdnerAufHandy((o) => !o)}
                  aria-expanded={ordnerAufHandy}
                  className="mr-auto flex items-center gap-2 rounded-lg border
                             border-zinc-800 bg-zinc-900/80 px-3 py-2 text-sm
                             text-slate-200 transition hover:border-sky-500
                             lg:hidden">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                    strokeLinejoin="round" aria-hidden>
                    <path d="M3 7a2 2 0 0 1 2-2h3.9l1.7 2H19a2 2 0 0 1 2 2v8a2 2
                             0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                  </svg>
                  {ordnerAufHandy ? <T>Ordner ausblenden</T> : <T>Ordner</T>}
                </button>
              )}
              {!showFolderPanel && (
                <button
                  onClick={toggleFolderPanel}
                  className="text-slate-200 bg-zinc-900/80 border border-zinc-800 p-2
                             rounded-full shadow-sm hover:bg-zinc-800 transition"
                  title={t('Ordnerliste anzeigen')}
                >
                  {/*
                    * Vorher stand hier das Zeichen ▶. Neben dem gezeichneten
                    * Winkel des Einklappers sah das aus wie zwei verschiedene
                    * Baustellen. Jetzt dasselbe Bild wie dort: ein Rahmen mit
                    * abgeteilter linker Spalte - die Ordnerliste, die
                    * wiederkommt.
                    */}
                  <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none"
                    stroke="currentColor" strokeWidth="1.6"
                    strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
                    <line x1="8" y1="3.5" x2="8" y2="16.5" />
                  </svg>
                </button>
              )}
              <button
                onClick={mehrfachUmschalten}
                className={`flex items-center gap-2 text-[11px] border px-3 py-1.5
                            rounded-full font-semibold uppercase tracking-[0.18em]
                            transition ${mehrfach
                  ? 'border-sky-500 bg-sky-500/15 text-sky-400'
                  : 'border-zinc-800 bg-zinc-900/80 text-slate-200 hover:bg-zinc-800'}`}
                title={t('Alle laufenden Streams nebeneinander zeigen')}
              >
                <svg viewBox="0 0 20 20" className="h-[14px] w-[14px]" fill="none"
                  stroke="currentColor" strokeWidth="1.6"
                  strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
                  {mehrfach
                    ? <line x1="10" y1="3.5" x2="10" y2="16.5" />
                    : <><line x1="10" y1="3.5" x2="10" y2="16.5" />
                        <line x1="2.5" y1="10" x2="17.5" y2="10" /></>}
                </svg>
                {mehrfach ? <T>Single view</T> : <T>Multi view</T>}
                {eigeneWahl && kachelWahl.length > 0 && (
                  <span className="rounded-full bg-zinc-800 px-1.5 text-[10px]
                                   tabular-nums text-slate-300">
                    {kachelWahl.length}
                  </span>
                )}
              </button>
              <button
                onClick={toggleChatVisibility}
                className="text-[11px] bg-zinc-900/80 border border-zinc-800 text-slate-200 px-3 py-1.5 rounded-full font-semibold uppercase tracking-[0.18em] transition hover:bg-zinc-800"
                title={t('Toggle chat')}
              >
                {showChat ? 'Chat off' : 'Chat on'}
              </button>
            </div>
          </div>
          <div className={`grid grid-cols-1 gap-4 items-stretch min-h-0 h-full ${showChat ? 'md:grid-cols-[1fr_420px]' : 'md:grid-cols-1'}`} data-stream-container>
            <div className="order-1 md:order-1 flex-1 h-full min-w-0 min-h-0">
              <div data-tour="preview" className="flex flex-col flex-1 h-full transition-all bg-zinc-950 rounded-3xl overflow-hidden min-h-0">
                  {mehrfach && !kachelReihen.reihen.length ? (
                    <div className="flex h-full w-full flex-col items-center
                                    justify-center gap-3 bg-zinc-950 p-6 text-center">
                      <p className="text-xs text-slate-500">
                        <T>Keine Kachel ausgewählt. Mit dem Plus in der
                           Streamerliste welche hinzufügen.</T>
                      </p>
                      <button
                        type="button"
                        onClick={kachelWahlLeeren}
                        className="rounded-full border border-zinc-700 px-3 py-1.5
                                   text-[11px] font-semibold uppercase
                                   tracking-[0.14em] text-slate-300 transition
                                   hover:border-sky-500 hover:text-sky-400"
                      >
                        <T>Wieder alle laufenden zeigen</T>
                      </button>
                    </div>
                  ) : mehrfach && kachelReihen.reihen.length && currentHost ? (
                    /*
                     * Die Kachelansicht. Jede Reihe ist fuer sich mittig
                     * gesetzt: eine unvollstaendige letzte Reihe steht damit
                     * in der Mitte statt links angeschlagen - so, wie die
                     * Streams auf den Vorlagen liegen.
                     *
                     * Die Breite einer Kachel richtet sich nach der
                     * Spaltenzahl der vollen Reihen, nicht nach der eigenen
                     * Reihe. Sonst wuerde der einzelne Stream unten so breit
                     * wie die drei darueber zusammen.
                     */
                    <div className="flex h-full w-full flex-col justify-center gap-3
                                    overflow-y-auto bg-zinc-950 p-3">
                      {kachelReihen.reihen.map((reihe, r) => (
                        <div key={r} className="flex justify-center gap-3">
                          {reihe.map((st) => {
                            const aktiv = st.twitch === activeStreamerTwitch;
                            return (
                              <div
                                key={`${st.twitch}#${kachelNeu[st.twitch] ?? 0}`}
                                style={{
                                  flex: `0 0 calc((100% - ${(kachelReihen.spalten - 1) * 12}px)`
                                    + ` / ${kachelReihen.spalten})`,
                                }}
                                className={`relative overflow-hidden rounded-xl border
                                            transition ${aktiv
                                  ? 'border-sky-500'
                                  : 'border-zinc-800 hover:border-zinc-600'}`}
                              >
                                <div className="aspect-video w-full">
                                  <iframe
                                    title={`Twitch stream ${st.twitch}`}
                                    src={`https://player.twitch.tv/?channel=${st.twitch}`
                                      + `&parent=${currentHost}&autoplay=true`
                                      + `&muted=${aktiv ? 'false' : 'true'}`
                                      + `&volume=${aktiv ? streamVolume : 0}`}
                                    allow="autoplay; fullscreen"
                                    className="h-full w-full"
                                    allowFullScreen
                                  ></iframe>
                                </div>
                                {/*
                                  * Die Leiste unter dem Player. Der Player
                                  * selbst faengt Klicks ab, deshalb liegen
                                  * die Bedienelemente darunter und nicht
                                  * darauf.
                                  *
                                  * Alle Zeichen in Grau: die Farbe traegt
                                  * schon der Rahmen der aktiven Kachel, ein
                                  * zweites farbiges Signal daneben waere
                                  * Laerm.
                                  */}
                                <div className={`flex w-full items-center gap-1
                                                 px-2 py-1 ${aktiv
                                  ? 'bg-zinc-900' : 'bg-zinc-900/80'}`}>
                                  <button
                                    type="button"
                                    onClick={() => setActiveStreamerTwitch(st.twitch)}
                                    title={aktiv
                                      ? t('Dieser Stream hat den Ton')
                                      : t('Ton auf diesen Stream legen')}
                                    className="shrink-0 rounded p-1 text-slate-400
                                               transition hover:bg-zinc-800
                                               hover:text-slate-100"
                                  >
                                    <svg viewBox="0 0 20 20" className="h-[15px] w-[15px]"
                                      fill="none" stroke="currentColor" strokeWidth="1.6"
                                      strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M4 7.5h2.5L10 4.5v11L6.5 12.5H4z" />
                                      {aktiv
                                        ? <><path d="M13 7.5a3.5 3.5 0 0 1 0 5" />
                                            <path d="M15.2 5.3a6.5 6.5 0 0 1 0 9.4" /></>
                                        : <><line x1="13" y1="7.5" x2="17" y2="12.5" />
                                            <line x1="17" y1="7.5" x2="13" y2="12.5" /></>}
                                    </svg>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setActiveStreamerTwitch(st.twitch)}
                                    className="min-w-0 flex-1 truncate text-left
                                               text-[11px] font-semibold text-slate-300
                                               transition hover:text-slate-100"
                                  >
                                    {st.twitch}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => kachelNeuLaden(st.twitch)}
                                    title={t('Diesen Stream neu laden')}
                                    className="shrink-0 rounded p-1 text-slate-500
                                               transition hover:bg-zinc-800
                                               hover:text-slate-100"
                                  >
                                    <svg viewBox="0 0 20 20" className="h-[14px] w-[14px]"
                                      fill="none" stroke="currentColor" strokeWidth="1.6"
                                      strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M16 10a6 6 0 1 1-1.8-4.3" />
                                      <polyline points="16 3 16 6.2 12.8 6.2" />
                                    </svg>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => kachelEntfernen(
                                      st.twitch, kachelnGezeigt.map((k) => k.twitch))}
                                    title={t('Diese Kachel entfernen')}
                                    className="shrink-0 rounded p-1 text-slate-500
                                               transition hover:bg-zinc-800
                                               hover:text-slate-100"
                                  >
                                    <svg viewBox="0 0 20 20" className="h-[14px] w-[14px]"
                                      fill="none" stroke="currentColor" strokeWidth="1.6"
                                      strokeLinecap="round" strokeLinejoin="round">
                                      <line x1="5.5" y1="5.5" x2="14.5" y2="14.5" />
                                      <line x1="14.5" y1="5.5" x2="5.5" y2="14.5" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ) : activeStreamerTwitch ? (
                    <div className="flex flex-col w-full h-full min-h-0 bg-zinc-950 overflow-hidden">
                      <div className="relative w-full overflow-hidden flex-1 flex h-full" style={{ padding: 0, minHeight: 0 }}>
                        {currentHost && (
                          <div className="w-full h-full overflow-hidden">
                            <iframe
                              title={`Twitch stream ${activeStreamerTwitch}`}
                              src={`https://player.twitch.tv/?channel=${activeStreamerTwitch}&parent=${currentHost}&muted=false&autoplay=true&volume=${streamVolume}`}
                              allow="autoplay; fullscreen"
                              className="w-full h-full"
                              allowFullScreen
                            ></iframe>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className={`flex flex-col w-full h-full min-h-0 ${showFolderPanel ? 'bg-zinc-950 rounded-lg overflow-hidden border border-zinc-800/80' : 'overflow-hidden'}`}>
                      <div className="relative w-full h-full min-h-0 bg-zinc-950 flex items-center justify-center text-zinc-500 text-xs italic mx-auto">
                        <T>No stream selected</T>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            {showChat && canShowTwitchChat && (
              <div data-tour="chat" className="order-2 bg-zinc-950 rounded-xl overflow-hidden border border-zinc-900 shadow-2xl flex flex-col min-h-0 h-full lg:w-[420px] md:w-[420px] w-full">
                <div className="bg-zinc-950/90 px-3 py-2 border-b border-zinc-900 text-[10px] font-bold uppercase tracking-widest text-zinc-400 flex items-center justify-between">
                  <span> Chat: {twitchChatUsername || 'None'}</span>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden bg-zinc-950">
                  {twitchChatUsername ? (
                    <iframe
                      title={`Twitch chat für ${twitchChatUsername}`}
                      src={`https://www.twitch.tv/embed/${twitchChatUsername}/chat?parent=${currentHost}&darkpopout`}
                      className="w-full h-full"
                    ></iframe>
                  ) : (
                    <div className="h-full flex items-center justify-center text-zinc-600 text-xs italic"><T>No chat loaded</T></div>
                  )}
                </div>
              </div>
            )}
          </div>

          {tourOpen && tourTargetRect && windowSize.width > 0 && windowSize.height > 0 && (
            <div className="fixed inset-0 z-50 pointer-events-none">
              <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${windowSize.width} ${windowSize.height}`} preserveAspectRatio="none">
                <rect x="0" y="0" width={windowSize.width} height={windowSize.height} fill="rgba(0,0,0,0.8)" />
                <rect x="0" y="0" width={windowSize.width} height={tourTargetRect.top} fill="rgba(0,0,0,0.8)" />
                <rect x="0" y={tourTargetRect.top} width={tourTargetRect.left} height={tourTargetRect.height} fill="rgba(0,0,0,0.8)" />
                <rect x={tourTargetRect.left + tourTargetRect.width} y={tourTargetRect.top} width={tourTargetRect.right} height={tourTargetRect.height} fill="rgba(0,0,0,0.8)" />
                <rect x="0" y={tourTargetRect.top + tourTargetRect.height} width={windowSize.width} height={windowSize.height - tourTargetRect.top - tourTargetRect.height} fill="rgba(0,0,0,0.8)" />
                <rect
                  x={tourTargetRect.left}
                  y={tourTargetRect.top}
                  width={tourTargetRect.width}
                  height={tourTargetRect.height}
                  rx="22"
                  ry="22"
                  fill="none"
                  stroke="rgba(168,85,247,0.9)"
                  strokeWidth="4"
                />
              </svg>
              <div
                className={`pointer-events-auto absolute w-[360px] rounded-3xl border border-slate-700 bg-zinc-950/95 p-5 shadow-2xl text-white ${
                  tourTooltipPlacement === 'top'
                    ? 'left-1/2 top-20 -translate-x-1/2'
                    : tourTooltipPlacement === 'bottom'
                    ? 'left-1/2 bottom-20 -translate-x-1/2'
                    : tourTooltipPlacement === 'left'
                    ? 'top-[20%] left-12'
                    : 'top-[20%] right-12'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500"><T>Dashboard tour</T></p>
                    <h2 className="text-xl font-semibold text-white">{currentTourStep.title}</h2>
                  </div>
                  <button
                    onClick={closeTour}
                    className="rounded-full border border-slate-700 bg-zinc-900/90 px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-500 hover:bg-slate-800"
                  >
                    <T>Close</T>
                  </button>
                </div>
                <p className="mt-3 text-sm text-slate-300 leading-6">{currentTourStep.description}</p>
                <p className="mt-2 text-sm text-slate-400 italic">{currentTourStep.tip}</p>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-xs uppercase tracking-[0.3em] text-slate-500">Step {tourStep + 1} / {tourStepCount}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={prevTourStep}
                      disabled={tourStep === 0}
                      className="rounded-full border border-slate-700 bg-zinc-900/90 px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <T>Previous</T>
                    </button>
                    <button
                      onClick={nextTourStep}
                      disabled={tourStep === tourStepCount - 1}
                      className="rounded-full border border-slate-700 bg-slate-700/95 px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-500 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <T>Next</T>
                    </button>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500"><T>This preview is read-only. All dashboard controls are disabled while the tour is open.</T></p>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}