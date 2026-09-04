'use client';

import React from 'react';
import { Region, TierListEntry } from '../types';
import { SearchBar } from './SearchBar';
import { PlayerPool } from './PlayerPool';
import { CreatePanel } from './CreatePanel';

interface SidebarProps {
  // Search state
  searchQuery: string;
  onSearchChange: (query: string) => void;

  // Pool state
  poolEntries: TierListEntry[];
  draggedId: string | null;
  dragOverId: string | null;
  existingEntries: TierListEntry[];

  // Pool interactions
  onPoolDragStart: (entryId: string) => void;
  onPoolDragEnd: () => void;
  onPoolDragOver: (entryId: string) => void;
  onPoolDragLeave: () => void;
  onPoolDrop: (draggedId: string, targetId: string | null) => void;

  // Mode switching
  currentMode: 'solo' | 'duo';
  onSwitchMode: (mode: 'solo' | 'duo') => void;

  // List operations
  onReset: () => void;

  // Create operations
  onCreatePlayer: (name: string, region: Region, countryCode: string) => Promise<void>;
  onCreateDuo: (player1: string, player2: string, countryCode1: string, countryCode2: string) => Promise<void>;

  // Admin controls
  isAdmin?: boolean;
  currentUser?: string;
  onDeleteEntry?: (entryId: string) => void;
  /** Einen Namen aendern - siehe PlayerCard. */
  onRenameEntry?: (rohName: string, neuerName: string, welcher?: 1 | 2) => void;
  /** Das gepflegte Land zu einem Namen - siehe PlayerCard. */
  landVon?: (name: string) => string | undefined;
  /** Der gepflegte Anzeigename - siehe PlayerCard. */
  anzeigeVon?: (name: string) => string | undefined;
  /** Die Herkunft festhalten - siehe PlayerCard. */
  onLand?: (name: string, land: string) => void;

  // UI state
  createDisabled?: boolean;
}

/**
 * Sidebar: Right sidebar with search, pool, create panel, toolbar
 */
export const Sidebar: React.FC<SidebarProps> = ({
  searchQuery,
  onSearchChange,
  poolEntries,
  draggedId,
  dragOverId,
  onPoolDragStart,
  onPoolDragEnd,
  onPoolDragOver,
  onPoolDragLeave,
  onPoolDrop,
  currentMode,
  onSwitchMode,
  onReset,
  onCreatePlayer,
  onCreateDuo,
  existingEntries,
  isAdmin = false,
  currentUser,
  onDeleteEntry,
  onRenameEntry,
  landVon,
  anzeigeVon,
  onLand,
  createDisabled = false,
}) => {
  return (
    <aside className="sidebar">
      <div className="sidebar-card sidebar-search">
        <div className="sidebar-section-title"></div>
        <SearchBar
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Search player..."
        />
      </div>

      <div className="sidebar-card sidebar-pool">
        <div className="sidebar-section-title"></div>
        <div className="duo-pool">
          <PlayerPool
            entries={poolEntries}
            searchQuery={searchQuery}
            draggedId={draggedId}
            dragOverId={dragOverId}
            onDragStart={onPoolDragStart}
            onDragEnd={onPoolDragEnd}
            onDragOver={onPoolDragOver}
            onDragLeave={onPoolDragLeave}
            onDrop={onPoolDrop}
            isAdmin={isAdmin}
            currentUser={currentUser}
            onDelete={onDeleteEntry}
            onRename={onRenameEntry}
            landVon={landVon}
            anzeigeVon={anzeigeVon}
            onLand={onLand}
            disabled={createDisabled}
          />
        </div>
      </div>

      <div className="sidebar-card sidebar-create">
        <CreatePanel
          mode={currentMode}
          onCreatePlayer={onCreatePlayer}
          onCreateDuo={onCreateDuo}
          existingEntries={existingEntries}
          disabled={createDisabled}
          // Bei einem schon vorhandenen Namen die Suche darauf setzen -
          // dann steht der Eintrag oben in der Liste darueber.
          onShowExisting={onSearchChange}
        />
      </div>
    </aside>
  );
};
