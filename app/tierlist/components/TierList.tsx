'use client';

import React from 'react';
import { TierListEntry, TierKey } from '../types';
import { TIER_KEYS } from '../utils/constants';
import { TierRow } from './TierRow';
import { PlayerCard } from './PlayerCard';

interface TierListProps {
  entries: TierListEntry[];
  tierLabels: Record<TierKey, string>;
  /** Welche Kachel gerade gezogen wird (fuer das Abdunkeln). */
  ziehId: string | null;
  /** Welche Stufe gerade das Ziel ist (fuer die Hervorhebung) - oder 'pool'/null. */
  zielStufe: TierKey | 'pool' | null;
  onTierLabelChange: (tier: TierKey, label: string) => void;
  /** Der Pointer-Griff an jede Kachel (hooks/useZeigerZiehen). */
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  isAdmin?: boolean;
  currentUser?: string;
  /** Einen Namen aendern - siehe PlayerCard. */
  onRename?: (rohName: string, neuerName: string, welcher?: 1 | 2 | 3) => void;
  /** Das gepflegte Land zu einem Namen - siehe PlayerCard. */
  landVon?: (name: string) => string | undefined;
  /** Der gepflegte Anzeigename - siehe PlayerCard. */
  anzeigeVon?: (name: string) => string | undefined;
  /** Die Herkunft festhalten - siehe PlayerCard. */
  onLand?: (name: string, land: string) => void;
  disableLabelEdit?: boolean;
}

export function TierList({
  entries,
  tierLabels,
  ziehId,
  zielStufe,
  onTierLabelChange,
  onPointerDown,
  isAdmin = false,
  currentUser,
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
          isDragOver={zielStufe === tier}
          disableLabelEdit={disableLabelEdit}
        >
          {getEntriesInTier(tier).map(entry => (
            <PlayerCard
              key={entry.id}
              entry={entry}
              variant="list"
              isDragging={ziehId === entry.id}
              onPointerDown={onPointerDown}
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
