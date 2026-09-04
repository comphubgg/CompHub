'use client';

import React from 'react';
import { TierListEntry, TierKey } from '../types';
import { TIER_KEYS } from '../utils/constants';
import { TierRow } from './TierRow';
import { PlayerCard } from './PlayerCard';

interface TierListProps {
  entries: TierListEntry[];
  tierLabels: Record<TierKey, string>;
  draggedId: string | null;
  dragOverId: string | null;
  dragOverTier: TierKey | null;
  onTierLabelChange: (tier: TierKey, label: string) => void;
  onDragStart: (entryId: string) => void;
  onDragEnd: () => void;
  onDragOver: (entryId: string | null, tier?: TierKey) => void;
  onDragLeave: () => void;
  onTierDrop: (tier: TierKey) => void;
  onCardDrop: (draggedId: string, targetId: string) => void;
  onReturnToPool: (entryId: string) => void;
  isAdmin?: boolean;
  currentUser?: string;
  onDeletePlayer?: (entryId: string) => void;
  /** Einen Namen aendern - siehe PlayerCard. */
  onRename?: (rohName: string, neuerName: string, welcher?: 1 | 2) => void;
  /** Das gepflegte Land zu einem Namen - siehe PlayerCard. */
  landVon?: (name: string) => string | undefined;
  /** Der gepflegte Anzeigename - siehe PlayerCard. */
  anzeigeVon?: (name: string) => string | undefined;
  /** Die Herkunft festhalten - siehe PlayerCard. */
  onLand?: (name: string, land: string) => void;
  disableLabelEdit?: boolean;
  disabled?: boolean;
}

export function TierList({
  entries,
  tierLabels,
  draggedId,
  dragOverId,
  dragOverTier,
  onTierLabelChange,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onTierDrop,
  onCardDrop,
  onReturnToPool,
  isAdmin = false,
  currentUser,
  onDeletePlayer,
  onRename,
  landVon,
  anzeigeVon,
  onLand,
  disableLabelEdit = false,
}: TierListProps) {
  const getEntriesInTier = (tier: TierKey) => entries.filter(entry => entry.tier === tier);

  return (
    <div className="flex flex-col gap-3 w-full">
      {TIER_KEYS.map(tier => (
        <TierRow
          key={tier}
          tier={tier}
          tierLabel={tierLabels[tier]}
          entryCount={getEntriesInTier(tier).length}
          onLabelChange={label => onTierLabelChange(tier, label)}
          isDragOver={dragOverTier === tier}
          onDragOver={() => onDragOver(null, tier)}
          onDragLeave={onDragLeave}
          onDrop={() => onTierDrop(tier)}
          disableLabelEdit={disableLabelEdit}
        >
          {getEntriesInTier(tier).map(entry => (
            <PlayerCard
              key={entry.id}
              entry={entry}
              variant="list"
              isDragging={draggedId === entry.id}
              onDragStart={() => onDragStart(entry.id)}
              onDragEnd={onDragEnd}
              onDragOver={() => onDragOver(entry.id, tier)}
              onDragLeave={onDragLeave}
              onDrop={() => draggedId && draggedId !== entry.id && onCardDrop(draggedId, entry.id)}
              onReturnToPool={() => onReturnToPool(entry.id)}
              isAdmin={isAdmin}
              currentUser={currentUser}
              onRename={onRename}
              landVon={landVon}
              anzeigeVon={anzeigeVon}
            onLand={onLand}
              disabled={false}
            />
          ))}
        </TierRow>
      ))}
    </div>
  );
}
