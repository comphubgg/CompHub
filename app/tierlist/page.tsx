'use client';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useIsMounted } from '../lib/hooks/useIsMounted';
import { useAuth } from '../lib/hooks/useAuth';
import './styles/tierlist.css';
import { getDashboardAccountName } from '../lib/userStorage';
import { STORAGE_KEYS } from './utils/constants';

// Hooks
import {
  useTierList,
  useDragDrop,
  useSearch,
  useMode,
} from './hooks';

// Services
import { dataProvider, duoService, playerService, storageService } from './services';

// Components
import { TierList, Sidebar } from './components';

// Types & Utils
import { TierKey, Player, Duo } from './types';
import { generateId, getSoloKey, getDuoKey, getDisplayName } from './utils/helpers';
import { getRegionFromCountryCode, TIER_LABELS_DEFAULT } from './utils/constants';
import { gefaltet, namensSchluessel } from '@/lib/homoglyph';

import T from '@/app/components/T';
/**
 * TierList Page: Main tier list application
 * Complete rebuild - fixed hook order stability
 */
export default function TierListPage() {
  // 1. Always call component state hooks in deterministic order
  const isMounted = useIsMounted();
  const { user, previewMode } = useAuth();
  const isGuest = !user;

  // List initialization
  const [listId, setListId] = useState<string>('static-tierlist');

  // Core hooks
  const { mode, switchMode } = useMode('solo');
  const { searchQuery, setSearchQuery, clearSearch } = useSearch();
  const {
    draggedId,
    dragOverId,
    dragOverTier,
    setDraggedId,
    setDragOverId,
    setDragOverTier,
    reset: resetDragState,
  } = useDragDrop();

  // Tier list state (stabiler Hook-Aufruf)
  const tierListState = useTierList(listId, mode);

  const [clipboardMessage, setClipboardMessage] = useState<string | null>(null);

  /**
   * Die gepflegten Spielerprofile - Herkunft an einer einzigen Stelle.
   *
   * In den Tierlist-Eintraegen steht zwar ein Laenderkuerzel, aber das ist
   * eine Kopie vom Tag des Anlegens. Wer die Flagge spaeter woanders pflegt -
   * im Leaderboard, auf einer Turnierkarte -, will sie hier genauso sehen.
   * Deshalb gilt das Profil, und das Kuerzel im Eintrag ist nur der Rueckfall.
   */
  const [spielerProfile, setSpielerProfile] = useState<Record<string, {
    land?: string; name?: string; namen?: string[]; anzeige?: string;
  }>>({});

  useEffect(() => {
    fetch('/api/spieler-profile').then(r => r.json())
      .then(j => setSpielerProfile(j.profile ?? {})).catch(() => {});
  }, []);

  /**
   * Die Herkunft eines Spielers festhalten.
   *
   * Geschrieben wird ins Profil und nicht in den Tierlist-Eintrag: dieselbe
   * Flagge steht dann auch im Leaderboard und auf den Turnierkarten. Die
   * uebrigen gepflegten Angaben gehen mit, sonst faellt beim Setzen einer
   * Flagge das X-Konto weg.
   */
  const landSetzen = useCallback(async (name: string, land: string) => {
    const sauber = String(name ?? '').trim();
    if (!sauber) return;
    const schluessel = sauber.toLowerCase().replace(/[^a-z0-9]/g, '');
    const vorher = Object.values(spielerProfile).find(pr =>
      [...(pr.namen ?? []), pr.name ?? '', pr.anzeige ?? '']
        .some(n => String(n).toLowerCase().replace(/[^a-z0-9]/g, '') === schluessel));

    await fetch('/api/spieler-profile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: sauber,
        land: land.toUpperCase(),
        x: (vorher as any)?.x ?? '',
        region: (vorher as any)?.region ?? '',
        anzeige: vorher?.anzeige ?? '',
      }),
    });
    const j = await fetch('/api/spieler-profile').then(r => r.json());
    setSpielerProfile(j.profile ?? {});
  }, [spielerProfile]);

  /**
   * Den Anzeigenamen zu einem Spieler festhalten - fuer alle.
   *
   * Genau wie bei der Flagge wird ins Profil geschrieben und nicht in den
   * Tierlist-Eintrag. Das hat zwei Gruende:
   *
   * 1. Es gilt ueberall. Der Betreiber wollte, "wenn ich als Admin die Duos
   *    umbenenne, dann wird das umbenannt fuer jeden" - und zwar nicht nur
   *    hier, sondern auch dort, wo derselbe Spieler sonst auftaucht.
   * 2. Der echte Turniername bleibt stehen. An ihm haengen die Flagge, der
   *    Platz aus den Power Rankings und das Zusammenlegen von Dubletten.
   *    Wuerde er ueberschrieben, waere der Spieler danach nicht mehr
   *    zuzuordnen - und ein zweites Umbenennen haette keinen Anker mehr.
   */
  const nameSetzen = useCallback(async (rohName: string, anzeige: string) => {
    const sauber = String(rohName ?? '').trim();
    const neu = String(anzeige ?? '').trim();
    if (!sauber) return;
    const schluessel = sauber.toLowerCase().replace(/[^a-z0-9]/g, '');
    const vorher = Object.values(spielerProfile).find(pr =>
      [...(pr.namen ?? []), pr.name ?? '', pr.anzeige ?? '']
        .some(n => String(n).toLowerCase().replace(/[^a-z0-9]/g, '') === schluessel));

    await fetch('/api/spieler-profile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: sauber,
        // Derselbe Name wie vorher heisst: die Abweichung ist aufgehoben.
        anzeige: neu === sauber ? '' : neu,
        land: (vorher as any)?.land ?? '',
        x: (vorher as any)?.x ?? '',
        region: (vorher as any)?.region ?? '',
      }),
    });
    const j = await fetch('/api/spieler-profile').then(r => r.json());
    setSpielerProfile(j.profile ?? {});
  }, [spielerProfile]);

  /*
   * Welcher Turniername zu welchem Konto gehoert.
   *
   * Dieselbe Auskunft, die das Zusammenlegen von Dubletten benutzt - hier
   * fuer den Anzeigenamen. Zum Grund siehe anzeigeVon weiter unten: der
   * gepflegte Name hing bisher daran, dass der Turniername zufaellig in der
   * kurzen Namensliste des Profils steht. Diese Liste kennt dagegen alle
   * Namen, unter denen ein Konto je angetreten ist.
   */
  const [kontoNachName, setKontoNachName] = useState<Record<string, string>>({});
  useEffect(() => {
    void Promise.resolve().then(async () => {
      try {
        const j = await (await fetch('/api/spieler-namen?nachName=1')).json();
        setKontoNachName(j?.nachName ?? {});
      } catch { /* ohne bleibt es bei der kurzen Liste im Profil */ }
    });
  }, []);

  /**
   * Der gepflegte Anzeigename zu einem Turniernamen, falls es einen gibt.
   *
   * Dieselbe Suche wie bei der Flagge - ueber alle Namen, unter denen das
   * Konto je gefuehrt wurde.
   */
  const anzeigeVon = useCallback((name: string): string | undefined => {
    const schluessel = String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!schluessel) return undefined;

    // 1. Das gepflegte Profil selbst. Was dort steht, gilt.
    for (const pr of Object.values(spielerProfile)) {
      if (!pr.anzeige) continue;
      const kandidaten = [...(pr.namen ?? []), pr.name ?? '', pr.anzeige ?? ''];
      if (kandidaten.some(n => String(n).toLowerCase().replace(/[^a-z0-9]/g, '') === schluessel)) {
        return pr.anzeige;
      }
    }

    /*
     * 2. Ueber das Konto - genau wie bei der Flagge.
     *
     * Hier endete die Suche vorher, und das war zu kurz gegriffen: die
     * Namensliste eines Profils enthaelt meist genau einen Namen, naemlich
     * den, unter dem der Spieler beim Anlegen antrat. Tritt er beim naechsten
     * Turnier unter einem anderen an - und das tun sie staendig -, findet ihn
     * der Vergleich nicht mehr, und auf der Karte steht wieder der rohe Name,
     * obwohl der Betreiber ihn laengst umbenannt hat.
     *
     * Die Kontoliste kennt dagegen jeden Namen, unter dem ein Konto je
     * angetreten ist. Ueber sie faellt "hvk pixie 67" mit "HAVOK Pixie"
     * zusammen, und der gepflegte Name greift auch dort.
     *
     * Mehrdeutige Namen liefert die Schnittstelle gar nicht erst aus - sie
     * bleiben beim rohen Namen, statt einen falschen zu bekommen.
     */
    /*
     * Achtung, zwei verschiedene Schluessel.
     *
     * Der Laender-Index entsteht mit der schlichten Vereinfachung (klein,
     * nur Buchstaben und Ziffern) - dort passt derselbe Handgriff wie oben.
     * Der Konto-Index dagegen wird mit namensSchluessel gebildet: Orgtag und
     * Startnummer fallen weg, Fremdalphabet-Zwillinge werden zurueckgefuehrt.
     * "hvk pixie 67" und "HAVOK Pixie" ergeben damit beide "pixie" - und
     * genau darum geht es hier.
     *
     * Mit dem falschen Schluessel gesucht findet der Index nichts, und der
     * gepflegte Name bliebe wieder aus. Nachgemessen: so fand "hvk pixie 67"
     * nichts, mit dem richtigen Schluessel dagegen "Pixie".
     */
    const konto = kontoNachName[namensSchluessel(name)];
    if (konto) {
      const pr = spielerProfile[konto];
      if (pr?.anzeige) return pr.anzeige;
    }
    return undefined;
  }, [spielerProfile, kontoNachName]);

  /**
   * Die Flagge zu einem Namen.
   *
   * Zuerst das gepflegte Profil - was von Hand eingetragen wurde, gilt.
   * Findet sich dort nichts, greift die Namensliste der Schnittstelle: sie
   * kennt zu 3538 Konten ein Land aus der Szene-Quelle und rechnet sie auf
   * alle Namen um, unter denen ein Konto je angetreten ist.
   *
   * Vorher endete die Suche beim gepflegten Profil - rund 235 Spieler hatten
   * damit eine Flagge, alle uebrigen keine, obwohl ihr Land laengst bekannt
   * war.
   *
   * Mehrdeutige Namen liefert die Schnittstelle gar nicht erst aus. Sie
   * bleiben ohne Flagge, statt eine falsche zu bekommen.
   */
  /** Land je Namensschluessel - aus der Szene-Quelle, ueber die Konto-Ids. */
  const [laenderNachName, setLaenderNachName] = useState<Record<string, string>>({});

  /**
   * Die Plaetze aus den Power Rankings, ueber den Namensschluessel.
   *
   * Damit laesst sich die Liste danach ordnen, wer gerade wirklich der beste
   * Spieler ist - statt danach, wessen Name mit einer Ziffer anfaengt. Ein
   * einziger Abruf; die Rangliste selbst ist zehntausend Eintraege lang.
   */
  const [raenge, setRaenge] = useState<Record<string, number>>({});
  useEffect(() => {
    void Promise.resolve().then(async () => {
      try {
        const j = await (await fetch('/api/power-rankings?raenge=1')).json();
        setRaenge(j?.raenge ?? {});
      } catch { /* ohne bleibt es bei der Sortierung nach Namen */ }
    });
  }, []);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      try {
        const j = await (await fetch('/api/spieler-laender?namen=1')).json();
        setLaenderNachName(j?.nachName ?? {});
      } catch { /* ohne bleibt es bei den gepflegten Profilen */ }
    });
  }, []);

  /*
   * Wen der Betreiber aus der Tierlist genommen hat.
   *
   * Jede Tierlist gehoert einem Konto und wird als Ganzes gespeichert. Loescht
   * der Betreiber ein Duo bei sich, verschwindet es deshalb nur aus seiner
   * eigenen Liste - in den gespeicherten Listen der anderen steht es weiter.
   * Diese gemeinsame Liste ist die Antwort darauf: was hier drinsteht, blendet
   * jede Ansicht aus, egal wem sie gehoert.
   */
  const [entfernt, setEntfernt] = useState<Set<string>>(new Set());
  const entferntLaden = useCallback(async () => {
    try {
      const j = await (await fetch('/api/tierlist-entfernt', { cache: 'no-store' })).json();
      setEntfernt(new Set<string>(Array.isArray(j?.schluessel) ? j.schluessel : []));
    } catch { /* ohne bleibt alles sichtbar - besser als eine leere Liste */ }
  }, []);
  useEffect(() => { void entferntLaden(); }, [entferntLaden]);

  /** Der Schluessel, unter dem ein Eintrag in der Entfernt-Liste steht. */
  const entfernSchluessel = useCallback((entry: any): string => (
    entry?.isDuo ? getDuoKey(entry.data as any) : getSoloKey(entry?.data)
  ), []);

  const landVon = useCallback((name: string): string | undefined => {
    const schluessel = String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!schluessel) return undefined;
    for (const pr of Object.values(spielerProfile)) {
      if (!pr.land) continue;
      const kandidaten = [...(pr.namen ?? []), pr.name ?? '', pr.anzeige ?? ''];
      if (kandidaten.some(n => String(n).toLowerCase().replace(/[^a-z0-9]/g, '') === schluessel)) {
        return pr.land.toLowerCase();
      }
    }
    const ausQuelle = laenderNachName[schluessel];
    if (ausQuelle) return ausQuelle.toLowerCase();
    return undefined;
  }, [spielerProfile, laenderNachName]);
  const [cloudSaveMessage, setCloudSaveMessage] = useState<string | null>(null);
  const [uploadStatusMessage, setUploadStatusMessage] = useState<string | null>(null);
  const [isCloudSaving, setIsCloudSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showImportTextArea, setShowImportTextArea] = useState(false);
  const [importText, setImportText] = useState('');
  const isInitialCloudSave = useRef(true);
  const uploadStatusTimer = useRef<number | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const currentUser = user?.name?.trim().toLowerCase() || '';
  const currentModeIsDuo = mode === 'duo';

  // Static list ID Sync
  useEffect(() => {
    setListId('static-tierlist');
  }, []);

  // Try to load shared cloud-stored tierlists and apply them if present
  useEffect(() => {
    const getLocalLatestUpdatedAt = () => {
      const localLists = storageService.getTierLists();
      return localLists.reduce((max: number, list: any) => {
        // Eine leere Liste ist kein Stand, den es zu bewahren gaebe.
        //
        // Beim ersten Aufruf legt der Browser eine leere Liste mit dem
        // Zeitstempel von jetzt an. Zaehlte die mit, waere der lokale Stand
        // immer neuer als der offizielle - ein frischer Besucher bekaeme die
        // gepflegte Tierlist nie zu sehen, obwohl sie vorliegt.
        if (!Array.isArray(list.entries) || list.entries.length === 0) return max;
        return Math.max(max, list.updatedAt || 0);
      }, 0);
    };

    const tryLoadCloud = async () => {
      try {
        const response = await fetch('/api/tierlists', { cache: 'no-store' });
        if (!response.ok) return;

        const data = await response.json();
        const cloudLists = Array.isArray(data?.lists)
          ? (data.lists as Array<{ updatedAt?: number; listId?: string; entries?: any[] }>)
          : [];
        if (cloudLists.length === 0) return;

        const localLists = storageService.getTierLists();
        const cloudLatestUpdatedAt = cloudLists.reduce((max: number, list) => Math.max(max, list.updatedAt || 0), 0);
        const localLatestUpdatedAt = getLocalLatestUpdatedAt();
        if (cloudLatestUpdatedAt <= localLatestUpdatedAt) return;

        const mergedLists = cloudLists.map(cloudList => {
          const localList = localLists.find(list => list.listId === cloudList.listId);
          const localOnlyEntries = Array.isArray(localList?.entries)
            ? localList.entries.filter((entry: any) => entry.localOnly)
            : [];
          const filteredCloudEntries = Array.isArray(cloudList.entries) ? cloudList.entries : [];
          return {
            ...cloudList,
            entries: [...filteredCloudEntries, ...localOnlyEntries],
          };
        });

        const preservedLocalLists = localLists
          .filter(localList => !mergedLists.some(cloudList => cloudList.listId === localList.listId))
          .map(localList => ({
            ...localList,
            entries: Array.isArray(localList.entries)
              ? localList.entries.filter((entry: any) => entry.localOnly)
              : [],
          }));

        storageService.saveTierLists([...mergedLists, ...preservedLocalLists] as any);
        const nextListId = data?.currentListId || cloudLists[0].listId;
        storageService.setCurrentListId(nextListId);
        setListId(nextListId);
        window.dispatchEvent(new Event('tierlist-cloud-sync'));
      } catch (err) {
        // ignore
      }
    };

    void tryLoadCloud();

    const intervalId = window.setInterval(() => {
      void tryLoadCloud();
    }, 5000);

    const handleFocus = () => {
      void tryLoadCloud();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, []);

  // Check admin status via API
  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const response = await fetch('/api/auth/check-admin', {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (response.ok) {
          const data = await response.json();
          setIsAdmin(data.isAdmin === true);
          return;
        }
        setIsAdmin(false);
      } catch (error) {
        console.warn('Failed to check admin status:', error);
        const isLocalDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
        if (isLocalDev) {
          const dashboardName = getDashboardAccountName();
          setIsAdmin((user?.name || '').toLowerCase() === 'admin-juanito' || dashboardName === 'admin-juanito');
        } else {
          setIsAdmin(false);
        }
      }
    };

    checkAdminStatus();
  }, [user]);

  const saveTierlistsToCloud = async (): Promise<boolean> => {
    if (!isAdmin) {
      setCloudSaveMessage('Only admin can save the global tierlist');
      return false;
    }

    setCloudSaveMessage(null);
    setIsCloudSaving(true);

    try {
      const lists = storageService.getTierLists();
      const currentListId = storageService.getCurrentListId();
      const sharedLists = lists.map((list: any) => ({
        ...list,
        entries: Array.isArray(list.entries)
          ? list.entries.filter((entry: any) => !entry.localOnly)
          : [],
      }));
      const response = await fetch('/api/tierlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lists: sharedLists, currentListId }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        const error = result?.error || 'Cloud save failed';
        setCloudSaveMessage(`Cloud save failed: ${error}`);
        return false;
      }

      setCloudSaveMessage('Global tierlist saved successfully');
      return true;
    } catch (error: any) {
      setCloudSaveMessage(`Cloud save failed: ${error?.message || 'unknown error'}`);
      return false;
    } finally {
      setIsCloudSaving(false);
      window.setTimeout(() => setCloudSaveMessage(null), 4000);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    if (isInitialCloudSave.current) {
      isInitialCloudSave.current = false;
      return;
    }

    // Eine leere Liste wird nie hochgeschrieben.
    //
    // Beim Aufruf steht der Zustand kurz auf leer, bis die offizielle Liste
    // eintrifft. Lief in diesem Moment das automatische Sichern los, schrieb
    // ein einziger geoeffneter Reiter die gepflegte Liste fuer alle weg -
    // genau so sind schon einmal Hunderte Eintraege verschwunden. Leeren
    // laesst sich die Liste weiterhin, aber nur ueber "Reset", das
    // ausdruecklich sichert.
    if (!tierListState.entries.length) return;

    const timeout = window.setTimeout(() => {
      void saveTierlistsToCloud();
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [isAdmin, tierListState.entries, tierListState.tierLabels, tierListState.listName]);

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  };

  const exportTierData = async () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      listName: tierListState.listName,
      listId,
      entries: tierListState.entries.map((entry: any) => {
        if (entry.isDuo) {
          const duo = entry.data as Duo;
          return {
            type: 'duo',
            tier: entry.tier,
            region: duo.region,
            player1: {
              name: duo.player1.name,
              region: duo.player1.region,
              countryCode: duo.player1.countryCode,
              twitterHandle: duo.player1.twitterHandle,
            },
            player2: {
              name: duo.player2.name,
              region: duo.player2.region,
              countryCode: duo.player2.countryCode,
              twitterHandle: duo.player2.twitterHandle,
            },
            isGlobal: duo.isGlobal,
          };
        }

        const player = entry.data as Player;
        return {
          type: 'solo',
          tier: entry.tier,
          name: player.name,
          region: player.region,
          countryCode: player.countryCode,
          twitterHandle: player.twitterHandle,
          isGlobal: player.isGlobal,
        };
      }),
    };

    const exportText = JSON.stringify(payload, null, 2);
    const blob = new Blob([exportText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fileName = `tierlist-${new Date().toISOString().slice(0, 10)}.json`;
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setClipboardMessage(`Tierlist saved as ${fileName}`);
  };

  const importTierData = async (jsonText: string): Promise<boolean> => {
    if (previewMode || isGuest) {
      setClipboardMessage('Please log in as VIP to import tier data');
      return false;
    }

    if (!isAdmin) {
      setClipboardMessage('Only admin can import tier data');
      return false;
    }

    if (!jsonText) {
      setClipboardMessage('Import cancelled');
      return false;
    }

    try {
      const data = JSON.parse(jsonText);
      if (!data || !Array.isArray(data.entries)) throw new Error('Invalid import format');

      const existingSoloKeys = new Set<string>(
        tierListState.entries
          .filter((entry: any) => !entry.isDuo && entry?.data && typeof entry.data === 'object')
          .map((entry: any) => getSoloKey(entry.data))
          .filter(Boolean)
      );

      const existingDuoKeys = new Set<string>(
        tierListState.entries
          .filter((entry: any) => entry.isDuo && entry?.data && typeof entry.data === 'object')
          .map((entry: any) => getDuoKey(entry.data))
          .filter(Boolean)
      );

      const importedSoloKeys = new Set<string>();
      const importedDuoKeys = new Set<string>();

      const importEntities: Array<Player | Duo> = [];

      for (const entry of data.entries) {
        if (!entry || typeof entry !== 'object') continue;

        if (entry.type === 'duo') {
          if (!entry.player1?.name || !entry.player2?.name) continue;
          const potential = {
            id: generateId(),
            player1: {
              id: generateId(),
              name: String(entry.player1.name),
              region: String(entry.player1.region || 'EU'),
              countryCode: String(entry.player1.countryCode || 'us'),
              twitterHandle: entry.player1.twitterHandle,
            },
            player2: {
              id: generateId(),
              name: String(entry.player2.name),
              region: String(entry.player2.region || 'EU'),
              countryCode: String(entry.player2.countryCode || 'us'),
              twitterHandle: entry.player2.twitterHandle,
            },
            region: String(entry.region || 'EU'),
            isGlobal: !!entry.isGlobal,
            createdBy: !isAdmin ? currentUser || undefined : undefined,
          } as Duo;
          const key = getDuoKey(potential);
          if (!key || existingDuoKeys.has(key) || importedDuoKeys.has(key)) continue;
          importedDuoKeys.add(key);
          importEntities.push(potential);
        } else if (entry.type === 'solo') {
          if (!entry.name) continue;
          const potential = {
            id: generateId(),
            name: String(entry.name),
            region: String(entry.region || 'EU'),
            countryCode: String(entry.countryCode || 'us'),
            twitterHandle: entry.twitterHandle,
            isGlobal: !!entry.isGlobal,
            createdBy: !isAdmin ? currentUser || undefined : undefined,
          } as Player;
          const key = getSoloKey(potential);
          if (!key || existingSoloKeys.has(key) || importedSoloKeys.has(key)) continue;
          importedSoloKeys.add(key);
          importEntities.push(potential);
        }
      }

      if (importEntities.length === 0) throw new Error('No valid entries found in import data');
      tierListState.addEntries(importEntities, { localOnly: !isAdmin });

      if (isAdmin) {
        const saved = await saveTierlistsToCloud();
        if (saved) {
          setUploadStatusMessage(`Imported ${importEntities.length} entries and saved online`);
        } else {
          setClipboardMessage(`Imported ${importEntities.length} entries locally but failed to save online`);
        }
      } else {
        setUploadStatusMessage(`Imported ${importEntities.length} entries locally`);
      }

      return true;
    } catch (error: any) {
      console.error('Failed to import tierlist data', error);
      setClipboardMessage(`Import failed: ${error?.message || 'invalid data'}`);
      return false;
    }
  };

  const openImportPicker = () => {
    if (!isAdmin) return;
    if (importInputRef.current) {
      importInputRef.current.click();
    }
  };

  useEffect(() => {
    if (!uploadStatusMessage) return;
    if (uploadStatusTimer.current) {
      window.clearTimeout(uploadStatusTimer.current);
    }
    uploadStatusTimer.current = window.setTimeout(() => {
      setUploadStatusMessage(null);
      uploadStatusTimer.current = null;
    }, 5000);
    return () => {
      if (uploadStatusTimer.current) {
        window.clearTimeout(uploadStatusTimer.current);
        uploadStatusTimer.current = null;
      }
    };
  }, [uploadStatusMessage]);

  const handleImportText = async () => {
    if (!importText.trim()) {
      setClipboardMessage('Import cancelled');
      return;
    }
    await importTierData(importText);
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      await importTierData(text);
    } catch (error: any) {
      console.error('Failed to read import file', error);
      setClipboardMessage(`Import failed: ${error?.message || 'could not read file'}`);
    }
  };

  /**
   * Wie viele der Beteiligten eine Flagge haben - 0, 1 oder 2.
   *
   * Dieselbe Aufloesung wie in der Kachel: erst das gepflegte Profil, dann
   * das Kuerzel im Eintrag.
   */
  const flaggenZahl = useCallback((entry: any): number => {
    const hat = (name?: string, kuerzel?: string) =>
      (landVon(String(name ?? '').trim()) ?? (kuerzel || undefined)) ? 1 : 0;
    if (entry?.isDuo) {
      return hat(entry.data?.player1?.name, entry.data?.player1?.countryCode)
        + hat(entry.data?.player2?.name, entry.data?.player2?.countryCode);
    }
    return hat(entry?.data?.name, entry?.data?.countryCode);
  }, [landVon]);

  /*
   * Stehen die Flaggenquellen ueberhaupt schon?
   *
   * Profile und Laenderverzeichnis kommen erst nach dem ersten Zeichnen. So
   * lange sieht jeder Eintrag flaggenlos aus - ohne diese Sperre waere die
   * Liste beim Aufbau kurz leer und fuellte sich dann ruckartig. Faellt eine
   * der Quellen aus, bleibt die Liste lieber vollstaendig als leer.
   */
  const flaggenQuellenDa = Object.keys(laenderNachName).length > 0
    || Object.keys(spielerProfile).length > 0;

  const filteredEntries = tierListState.entries.filter((entry: any) => {
    /*
     * Was der Betreiber entfernt hat, ist fuer alle weg.
     *
     * Diese Regel steht bewusst ganz vorn und kennt keine Ausnahme - auch
     * nicht fuer selbst Angelegtes. Wer als Betreiber einen Eintrag
     * herausnimmt, will ihn nirgends mehr sehen.
     */
    const weg = entfernSchluessel(entry);
    if (weg && entfernt.has(weg)) return false;

    /*
     * Wen niemand kennt, muss auch nicht in der Liste stehen.
     *
     * Der Betreiber dazu: "Leute ohne Flagge kannst Du entfernen, weil die
     * kennt legit niemand - hat eh viel zu viele Duos gerade. Mach nur die,
     * die mindestens einen im Team mit Flagge haben."
     *
     * Die Flagge ist das brauchbarste Zeichen dafuer, dass jemand ein
     * bekannter Spieler ist: sie steht nur an Konten, deren Herkunft
     * jemand gepflegt hat. Bei einem Duo genuegt einer von beiden - der
     * Mitspieler eines bekannten Spielers gehoert dazu.
     *
     * Ausgeblendet, nicht geloescht: die Flaggen haengen an Quellen, die
     * beim Laden auch mal ausbleiben koennen. Ein Filter laesst sich
     * zuruecknehmen, geloeschte Eintraege nicht.
     */
    /*
     * Selbst Angelegtes bleibt immer stehen.
     *
     * Der Filter oben ist fuer die automatisch geladenen Duos gedacht, von
     * denen es hunderte gibt. Wer dagegen selbst einen Namen eintippt, hat
     * sich dabei etwas gedacht - den darf keine Regel wieder ausblenden.
     * Genau das geschah bisher: ein neu angelegter Spieler ohne Flagge war
     * gespeichert, aber unsichtbar, und beim zweiten Versuch hiess es, es
     * gebe ihn schon.
     */
    const selbstAngelegt = Boolean(
      entry.vonHand || entry.localOnly || entry.data?.createdBy,
    );
    if (!selbstAngelegt && flaggenQuellenDa && !entry.tier
        && flaggenZahl(entry) === 0) {
      return false;
    }

    if (entry.localOnly) {
      const entryOwner = String(entry.data?.createdBy || '').trim().toLowerCase();
      return Boolean(currentUser && entryOwner === currentUser && entry.isDuo === currentModeIsDuo);
    }
    return entry.isDuo === currentModeIsDuo;
  });

  /**
   * Der beste Platz aus den Power Rankings, den dieser Eintrag mitbringt.
   *
   * Bei einem Duo zaehlt der bessere der beiden - ein Duo ist so bekannt wie
   * sein bekannterer Spieler. Wer gar nicht in der Rangliste steht, landet
   * hinten.
   */
  const bestPlatz = useCallback((entry: any): number => {
    const platz = (name?: string) => {
      const k = gefaltet(namensSchluessel(String(name ?? '')));
      return k && raenge[k] !== undefined ? raenge[k] : Number.MAX_SAFE_INTEGER;
    };
    if (entry?.isDuo) {
      return Math.min(platz(entry.data?.player1?.name), platz(entry.data?.player2?.name));
    }
    return platz(entry?.data?.name);
  }, [raenge]);

  /** Die Region eines Eintrags - beim Duo die des Duos, sonst die des Spielers. */
  const regionVon = (entry: any): string => String(
    entry?.data?.region || entry?.data?.player1?.region
    || entry?.data?.player2?.region || '',
  ).toUpperCase();

  /*
   * Der Pool sortiert nach Koennen und Herkunft, nicht nach dem Alphabet.
   *
   * Vorher stand oben, was mit einer Ziffer anfaengt - "00 TURKI", "1992
   * RX7", "112345ABCDE". Wer die Liste durchsieht, sucht aber die Namen, die
   * er kennt. Der Betreiber dazu: "filtere nicht nach Buchstaben/Zahlen,
   * sondern nach Stats, wer gerade der Beste ist bzw. das beste Duo, wen man
   * am meisten kennt - und mach alle EU-Spieler zuerst, dann alle anderen."
   *
   * Also in dieser Reihenfolge:
   *
   *   1. EU zuerst, dann alles andere.
   *   2. Der Platz aus den Power Rankings - eine gemessene Groesse, taeglich
   *      erneuert, nicht geschaetzt. "Sky + Scroll" steht damit ganz oben,
   *      weil Scroll global Erster und Sky Dritter ist.
   *   3. Wer dort nicht auftaucht, danach nach Namen - damit die Reihenfolge
   *      wenigstens stabil bleibt.
   */
  const filteredPoolEntries = filteredEntries
    .filter((entry: any) => !entry.tier)
    .slice()
    .sort((a: any, b: any) => {
      const eu = (e: any) => (regionVon(e) === 'EU' ? 0 : 1);
      if (eu(a) !== eu(b)) return eu(a) - eu(b);
      const p = bestPlatz(a) - bestPlatz(b);
      if (p !== 0) return p;
      return getDisplayName(a.data).localeCompare(getDisplayName(b.data));
    });
  const poolEntryCount = filteredPoolEntries.length;

  // Handle drag operations
  const handleTierDrop = (tier: TierKey) => {
    if (!draggedId) return;
    tierListState.moveToTier(draggedId, tier);
    resetDragState();
  };

  const handleCardDrop = (draggedId: string, targetId: string) => {
    const draggedEntry = tierListState.entries.find((e: any) => e.id === draggedId);
    const targetEntry = tierListState.entries.find((e: any) => e.id === targetId);

    if (draggedEntry?.tier && draggedEntry.tier === targetEntry?.tier) {
      tierListState.reorderInTier(draggedId, targetId, draggedEntry.tier);
    }
    resetDragState();
  };

  const handleDragOver = (entryId: string | null, tier?: TierKey) => {
    setDragOverId(entryId);
    setDragOverTier(tier ?? null);
  };

  const handlePoolDrop = (draggedId: string, targetId: string | null) => {
    tierListState.reorderInPool(draggedId, targetId);
    resetDragState();
  };

  // Create player/duo
  const getUsedDuoKeys = (): Set<string> => {
    return new Set(
      tierListState.entries.flatMap((entry: any) => {
        if (!entry.isDuo) return [];
        return [getDuoKey(entry.data as any)].filter(Boolean);
      })
    );
  };

  const getUsedDuoNames = (): Set<string> => {
    return new Set(
      tierListState.entries.flatMap((entry: any) => {
        if (!entry.isDuo) return [];
        const duo = entry.data as any;
        return [duo.player1?.name, duo.player2?.name]
          .filter(Boolean)
          .map(name => String(name).trim().toLowerCase());
      })
    );
  };

  const getUsedSoloPlayerKeys = (): Set<string> => {
    return new Set(
      tierListState.entries.flatMap((entry: any) => {
        if (entry.isDuo || !entry?.data || typeof entry.data !== 'object') return [];
        return [getSoloKey(entry.data)].filter(Boolean);
      })
    );
  };

  const handleCreatePlayer = async (name: string, region: any, countryCode: string) => {
    if (previewMode) return;

    const playerCandidate = {
      id: generateId(),
      name: String(name).trim(),
      region,
      countryCode,
    };

    const soloPlayerKeys = getUsedSoloPlayerKeys();
    const playerKey = getSoloKey(playerCandidate);
    if (playerKey && soloPlayerKeys.has(playerKey)) {
      throw new Error('A solo player with the same name already exists');
    }

    let player: any;
    if (isAdmin) {
      const saved = await playerService.addPlayer(name.trim(), region, countryCode);
      if (!saved) {
        throw new Error('Failed to save player online');
      }
      player = {
        id: generateId(),
        name: String(saved.name).trim(),
        region: saved.region,
        countryCode: saved.countryCode,
        twitterHandle: saved.twitterHandle,
        isGlobal: saved.isGlobal,
      };
    } else {
      player = {
        id: generateId(),
        name: String(name).trim(),
        region,
        countryCode,
        createdBy: currentUser || undefined,
      };
    }

    tierListState.addEntry(player, false, { localOnly: !isAdmin, vonHand: true });
  };

  const handleCreateDuo = async (
    player1: string,
    player2: string,
    countryCode1: string,
    countryCode2: string
  ) => {
    if (previewMode) return;

    const normalized1 = player1.trim().toLowerCase();
    const normalized2 = player2.trim().toLowerCase();
    if (normalized1 === normalized2) {
      throw new Error('A duo requires two different player names');
    }

    const usedNames = getUsedDuoNames();
    if (usedNames.has(normalized1) || usedNames.has(normalized2)) {
      throw new Error('Each player name may only be used once in the current duo list');
    }

    try {
      console.log('[handleCreateDuo] creating duo', { player1, player2, countryCode1, countryCode2 });
      const region1 = getRegionFromCountryCode(countryCode1);
      const region2 = getRegionFromCountryCode(countryCode2);
      let duo;
      if (isAdmin) {
        duo = await duoService.createDuo(player1, player2, countryCode1, countryCode2);
      } else {
        duo = {
          id: generateId(),
          player1: { id: generateId(), name: player1, region: region1, countryCode: countryCode1 },
          player2: { id: generateId(), name: player2, region: region2, countryCode: countryCode2 },
          region: region1,
          createdBy: currentUser || undefined,
        } as any;
      }

      if (duo) {
        console.log('[handleCreateDuo] duo prepared, adding to state', duo);
        tierListState.addEntry(duo, true, { localOnly: !isAdmin, vonHand: true });
        console.log('[handleCreateDuo] addEntry called');
      }
    } catch (error) {
      console.error('Error creating duo:', error);
      throw error;
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    const entry = tierListState.entries.find((e: any) => e.id === entryId);
    if (!entry) return;

    const entryOwner = String((entry.data as any).createdBy || '').trim().toLowerCase();
    const canDelete = isAdmin || Boolean(
      currentUser &&
      (entry.localOnly || (entryOwner && entryOwner === currentUser))
    );
    if (!canDelete) return;

    if (isAdmin) {
      if (entry.isDuo) {
        const duo = entry.data as any;
        const deleted = await duoService.deleteDuo(duo.player1.name, duo.player2.name, duo.region);
        if (!deleted) {
          console.warn('Failed to delete duo from backend, removing locally only');
        }
      } else {
        const player = entry.data as any;
        const deleted = await playerService.deletePlayer(player.name, player.region);
        if (!deleted) {
          console.warn('Failed to delete player from backend, removing locally only');
        }
      }

      /*
       * Und in die gemeinsame Liste eintragen.
       *
       * Die beiden Aufrufe darueber nehmen den Eintrag aus der Quelle, aus der
       * neue Listen entstehen. Sie erreichen aber nicht die Listen, die andere
       * Konten schon gespeichert haben - dort stuende das Duo weiter. Erst
       * dieser Vermerk sorgt dafuer, dass es ueberall verschwindet.
       */
      const schluessel = entfernSchluessel(entry);
      if (schluessel) {
        try {
          await fetch('/api/tierlist-entfernt', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              schluessel,
              name: entry.isDuo
                ? `${(entry.data as any).player1?.name} & ${(entry.data as any).player2?.name}`
                : (entry.data as any).name,
            }),
          });
          setEntfernt((alt) => new Set(alt).add(schluessel));
        } catch { /* dann greift es beim naechsten Laden */ }
      }
    }

    tierListState.deleteEntry(entryId);
  };

  // Safe client-side render check after all hooks are executed
  if (!isMounted) return null;

  return (
    <div className="tierlist-page new">
      <div className="page-wrapper">
        <div className="tierlist-panel">
          <div className="tierlist-header">
            {/* Die Ueberschrift "Tierlist" ist entfernt - man sieht ja, wo
                man ist, und die Zeile kostete nur Hoehe. */}
            <div className="tierlist-controls">
              <button
                type="button"
                className="reset-btn"
                onClick={() => tierListState.resetTierAssignments()}
              >
                <T>Reset</T>
              </button>
              <button
                type="button"
                className={`tierlist-button ${mode === 'duo' ? 'tierlist-button-primary' : 'tierlist-button-secondary'}`}
                onClick={() => switchMode('duo')}
              >
                Duos
              </button>
              <button
                type="button"
                className={`tierlist-button ${mode === 'solo' ? 'tierlist-button-primary' : 'tierlist-button-secondary'}`}
                onClick={() => switchMode('solo')}
              >
                Solo
              </button>
            </div>
            {/* Der Dateiimport ist entfernt.
                Eine Tierlist aus einer fremden Datei zu laden hat sich nicht
                bewaehrt: was dabei hereinkam, war weder geprueft noch mit den
                gepflegten Profilen abgeglichen. Angelegt wird von Hand, und
                die Grundausstattung kommt aus den Turnierdaten. */}
          </div>
          <TierList
            entries={filteredEntries}
            tierLabels={isGuest ? TIER_LABELS_DEFAULT : tierListState.tierLabels}
            draggedId={draggedId}
            dragOverId={dragOverId}
            dragOverTier={dragOverTier}
            onTierLabelChange={tierListState.setTierLabel}
            onDragStart={setDraggedId}
            onDragEnd={resetDragState}
            onDragOver={setDragOverId}
            onDragLeave={() => setDragOverTier(null)}
            onTierDrop={handleTierDrop}
            onCardDrop={handleCardDrop}
            onReturnToPool={tierListState.removeEntry}
            isAdmin={isAdmin}
            currentUser={currentUser}
            onDeletePlayer={isAdmin ? handleDeleteEntry : undefined}
            onRename={isAdmin ? nameSetzen : tierListState.umbenennenNachName}
            landVon={landVon}
            anzeigeVon={anzeigeVon}
            onLand={isAdmin ? landSetzen : tierListState.landNachName}
            disableLabelEdit={isGuest}
          />
        </div>

        <Sidebar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          poolEntries={filteredPoolEntries}
          draggedId={draggedId}
          dragOverId={dragOverId}
          onPoolDragStart={setDraggedId}
          onPoolDragEnd={resetDragState}
          onPoolDragOver={setDragOverId}
          onPoolDragLeave={() => setDragOverId(null)}
          onPoolDrop={handlePoolDrop}
          currentMode={mode}
          onSwitchMode={switchMode}
          onReset={tierListState.resetTierAssignments}
          onCreatePlayer={handleCreatePlayer}
          onCreateDuo={handleCreateDuo}
          existingEntries={tierListState.entries}
          isAdmin={isAdmin}
          currentUser={currentUser}
          onRenameEntry={isAdmin ? nameSetzen : tierListState.umbenennenNachName}
          landVon={landVon}
          anzeigeVon={anzeigeVon}
          onLand={isAdmin ? landSetzen : tierListState.landNachName}
          onDeleteEntry={isAdmin ? handleDeleteEntry : undefined}
          createDisabled={previewMode}
        />
      </div>
    </div>
  );
}
