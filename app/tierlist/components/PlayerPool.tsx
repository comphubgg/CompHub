'use client';

import React from 'react';
import T from '@/app/components/T';
import { TierListEntry } from '../types';
import { PlayerCard } from './PlayerCard';
import { matchesSearch, getDisplayName } from '../utils/helpers';

interface PlayerPoolProps {
  entries: TierListEntry[];
  searchQuery: string;
  /** Welche Kachel gerade gezogen wird (fuer das Abdunkeln). */
  ziehId: string | null;
  /** Der Pointer-Griff an jede Kachel (hooks/useZeigerZiehen). */
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  isAdmin?: boolean;
  currentUser?: string;
  onDelete?: (entryId: string) => void;
  /** Einen Namen aendern - siehe PlayerCard. */
  onRename?: (rohName: string, neuerName: string, welcher?: 1 | 2 | 3) => void;
  /** Das gepflegte Land zu einem Namen - siehe PlayerCard. */
  landVon?: (name: string) => string | undefined;
  /** Der gepflegte Anzeigename - siehe PlayerCard. */
  anzeigeVon?: (name: string) => string | undefined;
  /** Die Herkunft festhalten - siehe PlayerCard. */
  onLand?: (name: string, land: string) => void;
  /**
   * Was dastehen soll, wenn ueberhaupt nichts da ist.
   *
   * "All players assigned" stimmt nur, wenn es Spieler gibt und alle auf
   * einer Stufe stehen. Ist die Liste selbst leer - etwa weil niemand
   * angemeldet ist und die Tierlist am Konto haengt -, war dieser Satz
   * schlicht falsch und sah aus wie ein Fehler.
   */
  leerHinweis?: string;
  disabled?: boolean;
}

/**
 * PlayerPool: Shows all unassigned players/duos
 */
export const PlayerPool: React.FC<PlayerPoolProps> = ({
  entries,
  searchQuery,
  ziehId,
  onPointerDown,
  isAdmin = false,
  currentUser,
  onDelete,
  onRename,
  landVon,
  anzeigeVon,
  onLand,
  leerHinweis,
  disabled = false,
}) => {
  /*
   * Gesucht wird hier, sortiert nicht mehr.
   *
   * Vorher stand hier ein zweites Sortieren nach dem Anzeigenamen. Es lief
   * nach der Reihenfolge, die die Seite bereits festgelegt hatte, und machte
   * sie damit wirkungslos: die Liste stand weiter alphabetisch da, obwohl
   * oben laengst nach Region und nach dem Platz aus den Power Rankings
   * geordnet wurde. Die Reihenfolge gehoert an eine Stelle - dorthin, wo
   * auch die Daten dafuer liegen.
   */
  const filteredEntries = entries
    .filter(entry => entry?.data && matchesSearch(entry.data, searchQuery));

  return (
    <>
      {filteredEntries.length === 0 ? (
        <div className="pool-empty">
          {searchQuery
            ? <T>Kein Spieler gefunden</T>
            : leerHinweis
              ? <T>{leerHinweis}</T>
              : <T>Alle Spieler sind eingestuft</T>}
        </div>
      ) : (
        filteredEntries.map(entry => (
          <PlayerCard
            key={entry.id}
            entry={entry}
            variant="pool"
            isDragging={ziehId === entry.id}
            onPointerDown={onPointerDown}
            isAdmin={isAdmin}
            currentUser={currentUser}
            onDelete={onDelete}
            onRename={onRename}
            landVon={landVon}
            anzeigeVon={anzeigeVon}
            onLand={onLand}
            disabled={disabled}
          />
        ))
      )}
    </>
  );
};
