'use client';

import React, { useState, useEffect } from 'react';
import { TierKey } from '../types';
import { TIER_COLORS } from '../utils/constants';

interface TierRowProps {
  tier: TierKey;
  tierLabel: string;
  entryCount?: number;
  onLabelChange: (newLabel: string) => void;
  isDragOver: boolean;
  children: React.ReactNode;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  disableLabelEdit?: boolean;
  disabled?: boolean;
}

/**
 * Wie gross die Beschriftung einer Stufe sein darf.
 *
 * Der Block ist immer gleich breit, die Woerter sind es nicht: "Win" ist
 * kurz, "Top 25" ist lang. Vorher brach der Text um - aus "Top 3" wurden
 * zwei Zeilen, und "Top 15" haette gar keinen Platz gehabt. Jetzt bleibt
 * alles auf einer Zeile, und die Schrift richtet sich nach der Laenge.
 *
 * Die Stufen sind hoechstens ein paar Zeichen lang; eine Messung im
 * Browser waere fuer diesen Fall zu viel Aufwand und zu wenig verlaesslich
 * (die Schrift steht beim ersten Zeichnen noch nicht fest).
 */
function stufenSchrift(text: string): React.CSSProperties {
  const n = (text ?? '').trim().length;
  const groesse = n <= 3 ? 22 : n <= 5 ? 19 : n <= 7 ? 16 : n <= 9 ? 13 : 11;
  return { '--stufen-schrift': `${groesse}px` } as React.CSSProperties;
}

/**
 * TierRow: Renders a single tier row (S, A, B, C, D, E, F)
 */
export const TierRow: React.FC<TierRowProps> = ({
  tier,
  tierLabel,
  entryCount = 0,
  onLabelChange,
  isDragOver,
  children,
  onDragOver,
  onDragLeave,
  onDrop,
  disableLabelEdit = false,
  disabled = false,
}) => {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [editValue, setEditValue] = useState(tierLabel);

  useEffect(() => {
    setEditValue(tierLabel);
  }, [tierLabel]);

  const handleSaveLabel = () => {
    if (editValue.trim()) {
      onLabelChange(editValue.trim());
      setIsEditingLabel(false);
    } else {
      setEditValue(tierLabel);
      setIsEditingLabel(false);
    }
  };

  return (
    <div className={`tier-row ${TIER_COLORS[tier]}`}>
      {/* Tier Label */}
      <div className="tier-label" style={stufenSchrift(tierLabel)}>
        {isEditingLabel ? (
          <input
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={handleSaveLabel}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSaveLabel();
              if (e.key === 'Escape') {
                setEditValue(tierLabel);
                setIsEditingLabel(false);
              }
            }}
            disabled={disableLabelEdit}
            className="tier-label-eingabe"
          />
        ) : (
          <span
            // Doppelklick statt einfachem Klick: ein Klick geht beim
            // Ablegen einer Kachel schnell daneben, und dann stuende
            // ploetzlich das Eingabefeld offen.
            onDoubleClick={() => {
              if (!disableLabelEdit) setIsEditingLabel(true);
            }}
            title={disableLabelEdit ? undefined : 'Doppelklick zum Umbenennen'}
            className={`transition ${disableLabelEdit ? 'cursor-default opacity-80' : 'cursor-text hover:opacity-80'}`}
          >
            {tierLabel}
          </span>
        )}
      </div>

      {/* Tier Content */}
      <div
        onDragOver={e => {
          if (disabled) return;
          e.preventDefault();
          onDragOver();
        }}
        onDragLeave={() => {
          if (!disabled) onDragLeave();
        }}
        onDrop={e => {
          if (disabled) return;
          e.preventDefault();
          onDrop();
        }}
        className={`tier-content ${isDragOver ? 'drag-over' : ''}`}
      >
        {children}
      </div>
      <div className="tier-count">{entryCount > 0 ? `(${entryCount})` : ''}</div>
    </div>
  );
};
