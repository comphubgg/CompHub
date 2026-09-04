'use client';

import React from 'react';
import { TierListEntry } from '../types';
import { PlayerCard } from './PlayerCard';
import { matchesSearch, getDisplayName } from '../utils/helpers';

interface PlayerPoolProps {
  entries: TierListEntry[];
  searchQuery: string;
  draggedId: string | null;
  dragOverId: string | null;
  onDragStart: (entryId: string) => void;
  onDragEnd: () => void;
  onDragOver: (entryId: string) => void;
  onDragLeave: () => void;
  onDrop: (draggedId: string, targetId: string | null) => void;
  isAdmin?: boolean;
  currentUser?: string;
  onDelete?: (entryId: string) => void;
  /** Einen Namen aendern - siehe PlayerCard. */
  onRename?: (rohName: string, neuerName: string, welcher?: 1 | 2) => void;
  /** Das gepflegte Land zu einem Namen - siehe PlayerCard. */
  landVon?: (name: string) => string | undefined;
  /** Der gepflegte Anzeigename - siehe PlayerCard. */
  anzeigeVon?: (name: string) => string | undefined;
  /** Die Herkunft festhalten - siehe PlayerCard. */
  onLand?: (name: string, land: string) => void;
  disabled?: boolean;
}

/**
 * PlayerPool: Shows all unassigned players/duos
 */
export const PlayerPool: React.FC<PlayerPoolProps> = ({
  entries,
  searchQuery,
  draggedId,
  dragOverId,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  isAdmin = false,
  currentUser,
  onDelete,
  onRename,
  landVon,
  anzeigeVon,
  onLand,
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
          {searchQuery ? 'No players found' : 'All players assigned'}
        </div>
      ) : (
        filteredEntries.map(entry => (
          <PlayerCard
            key={entry.id}
            entry={entry}
            variant="pool"
            isDragging={draggedId === entry.id}
            onDragStart={() => onDragStart(entry.id)}
            onDragEnd={onDragEnd}
            onDragOver={() => onDragOver(entry.id)}
            onDragLeave={onDragLeave}
            onDrop={(event) => {
              if (!disabled && draggedId) {
                onDrop(draggedId, entry.id);
              }
            }}
            isAdmin={isAdmin}
            currentUser={currentUser}
            onDelete={() => onDelete?.(entry.id)}
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
