'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { TierKey, TierListEntry } from '../types';
import { STORAGE_KEYS, TIER_LABELS_DEFAULT } from '../utils/constants';
import { storageService } from '../services/storageService';
import { generateId } from '../utils/helpers';
import { ohneDubletten } from '../utils/dubletten';

interface TierListStateData {
  listId: string;
  listName: string;
  tierLabels: Record<TierKey, string>;
  entries: TierListEntry[];
  updatedAt: number;
}

const createDefaultList = (listId: string): TierListStateData => ({
  listId,
  listName: 'Tierlist',
  tierLabels: { ...TIER_LABELS_DEFAULT },
  entries: [],
  updatedAt: Date.now(),
});

export function useTierList(listId: string, mode: 'solo' | 'duo') {
  const [listState, setListState] = useState<TierListStateData>(createDefaultList(listId));
  const [isLoaded, setIsLoaded] = useState(false);

  /*
   * Welcher Name zu welchem Konto gehoert.
   *
   * Wird zum Zusammenlegen gebraucht und liegt hier statt in der Seite, weil
   * genau hier zusammengelegt wird. Als Ref, damit der Ladevorgang unten
   * darauf zugreifen kann, ohne dass jede Aenderung ihn neu ausloest.
   */
  const konten = useRef<Record<string, string>>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let abgemeldet = false;
    void (async () => {
      try {
        const j = await (await fetch('/api/spieler-namen?nachName=1')).json();
        if (abgemeldet) return;
        konten.current = j?.nachName ?? {};
        // Was vorher nur ueber den Namen zusammenfiel, faellt jetzt auch
        // ueber das Konto zusammen - der vorhandene Stand wird nachgezogen.
        setListState((alt) => ({
          ...alt,
          entries: ohneDubletten(alt.entries, konten.current),
        }));
      } catch { /* dann bleibt es beim Namensvergleich */ }
    })();
    return () => { abgemeldet = true; };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const ausSpeicher = () => {
      const lists = storageService.getTierLists();
      const existing = lists.find(list => list.listId === listId);
      if (existing) {
        setListState({
          listId: existing.listId,
          listName: existing.listName || 'Tierlist',
          tierLabels: existing.tierLabels || { ...TIER_LABELS_DEFAULT },
          /*
           * Hier faellt dieselbe Person zusammen, egal woher die Liste kam.
           *
           * Der Ort ist mit Absicht gewaehlt: dies ist die einzige Stelle,
           * durch die jeder Stand geht - der aus dem Browserspeicher, der
           * frisch geholte und der aus der fertigen Anwendung, die ihre
           * eigenen Daten unter %APPDATA% fuehrt. Was hier zusammenfaellt,
           * wird gleich darauf auch so zurueckgeschrieben.
           */
          entries: ohneDubletten(existing.entries || [], konten.current),
          updatedAt: existing.updatedAt || Date.now(),
        });
        storageService.setCurrentListId(existing.listId);
      } else {
        setListState(createDefaultList(listId));
        storageService.setCurrentListId(listId);
      }
      setIsLoaded(true);
    };

    ausSpeicher();

    // Die Seite holt die offizielle Liste erst nach dem ersten Zeichnen und
    // meldet das mit diesem Ereignis. Ohne Zuhoerer blieb der Zustand auf dem
    // leeren Stand von eben stehen - und der zweite Effekt schrieb ihn gleich
    // wieder ueber die frisch geholten Daten. Genau deshalb sah die Tierlist
    // in einem frischen Browser immer leer aus.
    window.addEventListener('tierlist-cloud-sync', ausSpeicher);
    return () => window.removeEventListener('tierlist-cloud-sync', ausSpeicher);
  }, [listId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isLoaded) return;
    storageService.setCurrentListId(listId);
    const lists = storageService.getTierLists();
    const nextLists = [...lists.filter(item => item.listId !== listId), {
      ...listState,
      listId,
      updatedAt: Date.now(),
    }];
    storageService.saveTierLists(nextLists);
  }, [isLoaded, listId, listState.entries, listState.tierLabels, listState.listName]);

  const entries = listState.entries;
  const tierLabels = listState.tierLabels;

  const setTierLabel = (tier: TierKey, label: string) => {
    setListState(prev => ({
      ...prev,
      tierLabels: {
        ...prev.tierLabels,
        [tier]: label,
      },
    }));
  };

  const saveList = (nextList: Partial<TierListStateData>) => {
    setListState(prev => ({
      ...prev,
      ...nextList,
      updatedAt: Date.now(),
    }));
  };

  const moveToTier = (entryId: string, tier: TierKey) => {
    saveList({
      entries: entries.map(entry =>
        entry.id === entryId ? { ...entry, tier } : entry
      ),
    });
  };

  const reorderInTier = (draggedId: string, targetId: string, tier: TierKey) => {
    const tierEntries = entries.filter(entry => entry.tier === tier);
    const draggedIndex = tierEntries.findIndex(item => item.id === draggedId);
    const targetIndex = tierEntries.findIndex(item => item.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) return;

    const nextTierEntries = [...tierEntries];
    const [draggedEntry] = nextTierEntries.splice(draggedIndex, 1);
    nextTierEntries.splice(targetIndex, 0, draggedEntry);

    const reordered = entries.map(entry => {
      if (entry.tier !== tier) return entry;
      const next = nextTierEntries.find(item => item.id === entry.id);
      return next ?? entry;
    });

    saveList({ entries: reordered });
  };

  const reorderInPool = (draggedId: string, targetId: string | null) => {
    const poolEntries = entries.filter(entry => !entry.tier);
    const draggedIndex = poolEntries.findIndex(item => item.id === draggedId);
    if (draggedIndex === -1) return;
    const nextPool = [...poolEntries];
    const [draggedEntry] = nextPool.splice(draggedIndex, 1);

    if (targetId) {
      const targetIndex = nextPool.findIndex(item => item.id === targetId);
      if (targetIndex === -1) return;
      nextPool.splice(targetIndex, 0, draggedEntry);
    } else {
      nextPool.push(draggedEntry);
    }

    const reordered = [
      ...nextPool,
      ...entries.filter(entry => entry.tier),
    ];

    saveList({ entries: reordered });
  };

  const addEntries = (newEntries: Array<any>, options?: { localOnly?: boolean }) => {
    saveList({
      entries: [
        ...entries,
        ...newEntries.map(entry => {
          const data = entry?.data ? entry.data : entry;
          const isDuo = Boolean(data && typeof data === 'object' && 'player1' in data && 'player2' in data);
          return {
            id: entry.id || generateId(),
            tier: null,
            isDuo,
            data,
            localOnly: options?.localOnly,
          };
        }),
      ],
    });
  };

  /*
   * Ein Eintrag, den jemand selbst angelegt hat.
   *
   * Der Merker `vonHand` entscheidet spaeter darueber, ob der Flaggenfilter
   * ihn treffen darf. Wer einen Namen selbst eintippt, will ihn sehen - auch
   * ohne Flagge, auch wenn ihn sonst niemand kennt. Ohne den Merker
   * verschwand ein gerade angelegter Spieler sofort wieder aus der Liste,
   * blieb aber gespeichert: beim naechsten Anlegen hiess es dann, es gebe
   * ihn schon, obwohl nichts zu sehen war.
   */
  const addEntry = (
    entry: any, isDuo: boolean,
    options?: { localOnly?: boolean; vonHand?: boolean },
  ) => {
    saveList({
      entries: [...entries, {
        id: entry.id, tier: null, isDuo, data: entry,
        localOnly: options?.localOnly, vonHand: options?.vonHand,
      }],
    });
  };

  const deleteEntry = (entryId: string) => {
    saveList({ entries: entries.filter(entry => entry.id !== entryId) });
  };

  const clearList = () => {
    saveList({ entries: [] });
  };

  /**
   * Alles zurueck auf Anfang.
   *
   * "Reset" hat vorher nur die Kacheln aus den Stufen geraeumt und die
   * selbst vergebenen Stufennamen stehen lassen. Der Betreiber erwartet das
   * andere: "wenn ich auf Reset druecke, dass die Tierlist wirklich
   * resettet wird - auch diese Texte, wo man manuell eingeben kann, das ist
   * wieder auf S A B C D E F." Ein Reset, der die Haelfte des vorigen
   * Standes behaelt, ist keiner.
   */
  const resetTierAssignments = () => {
    saveList({
      entries: entries.map(entry => ({ ...entry, tier: null })),
      tierLabels: { ...TIER_LABELS_DEFAULT },
    });
  };

  const removeEntry = (entryId: string) => {
    saveList({ entries: entries.map(entry => entry.id === entryId ? { ...entry, tier: null } : entry) });
  };

  /**
   * Einen Spieler umbenennen.
   *
   * Bei einem Duo sagt "welcher", ob der erste oder der zweite gemeint ist.
   * Geaendert wird nur der Name - Herkunft und Zuordnung bleiben, wo sie
   * sind. Wer kein Admin ist, aendert damit seine eigene Ansicht; die
   * offizielle Liste schreibt nur der Admin fort.
   */
  const renameEntry = (entryId: string, name: string, welcher?: 1 | 2) => {
    const sauber = name.trim();
    if (!sauber) return;
    setListState(prev => ({
      ...prev,
      entries: prev.entries.map((eintrag: any) => {
        if (eintrag.id !== entryId) return eintrag;
        if (eintrag.isDuo) {
          const feld = welcher === 2 ? 'player2' : 'player1';
          return {
            ...eintrag,
            data: {
              ...eintrag.data,
              [feld]: { ...eintrag.data[feld], name: sauber },
            },
          };
        }
        return { ...eintrag, data: { ...eintrag.data, name: sauber } };
      }),
      updatedAt: Date.now(),
    }));
  };

  /*
   * Dasselbe ueber den Namen statt ueber die Eintrags-Id.
   *
   * Die Kachel kennt nur den Namen, den sie anzeigt - die Id liegt eine
   * Ebene hoeher. Der Admin-Weg nimmt ebenfalls den Namen, damit beide
   * dieselbe Form haben und sich in der Oberflaeche austauschen lassen.
   *
   * Geaendert wird ausschliesslich der eigene Stand: diese Funktion fasst
   * nur die Liste im Browser an. Die gepflegten Profile, die fuer alle
   * gelten, schreibt weiterhin nur der Admin fort.
   */
  const passt = (n: unknown, gesucht: string) =>
    String(n ?? '').trim().toLowerCase() === gesucht;

  const umbenennenNachName = (rohName: string, neu: string, welcher?: 1 | 2) => {
    const gesucht = String(rohName ?? '').trim().toLowerCase();
    const sauber = String(neu ?? '').trim();
    if (!gesucht || !sauber) return;
    setListState((prev) => ({
      ...prev,
      entries: prev.entries.map((e: any) => {
        if (e.isDuo) {
          const feld = welcher === 2 ? 'player2' : 'player1';
          if (!passt(e.data?.[feld]?.name, gesucht)) return e;
          return { ...e, data: { ...e.data,
            [feld]: { ...e.data[feld], name: sauber } } };
        }
        if (!passt(e.data?.name, gesucht)) return e;
        return { ...e, data: { ...e.data, name: sauber } };
      }),
      updatedAt: Date.now(),
    }));
  };

  /** Die Flagge eines eigenen Eintrags - ebenfalls nur im eigenen Stand. */
  const landNachName = (rohName: string, land: string) => {
    const gesucht = String(rohName ?? '').trim().toLowerCase();
    if (!gesucht) return;
    const code = String(land ?? '').trim();
    setListState((prev) => ({
      ...prev,
      entries: prev.entries.map((e: any) => {
        if (e.isDuo) {
          let d = e.data;
          if (passt(d?.player1?.name, gesucht)) {
            d = { ...d, player1: { ...d.player1, countryCode: code } };
          }
          if (passt(d?.player2?.name, gesucht)) {
            d = { ...d, player2: { ...d.player2, countryCode: code } };
          }
          return d === e.data ? e : { ...e, data: d };
        }
        if (!passt(e.data?.name, gesucht)) return e;
        return { ...e, data: { ...e.data, countryCode: code } };
      }),
      updatedAt: Date.now(),
    }));
  };

  return {
    entries,
    tierLabels,
    renameEntry,
    umbenennenNachName,
    landNachName,
    listName: listState.listName,
    setTierLabel,
    moveToTier,
    reorderInTier,
    reorderInPool,
    addEntries,
    addEntry,
    deleteEntry,
    clearList,
    resetTierAssignments,
    removeEntry,
  };
}
