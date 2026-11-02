'use client';

import React from 'react';

import { useT } from '@/app/components/SprachProvider';
import T from '@/app/components/T';
interface ToolbarProps {
  onReset: () => void;
  onSwitchMode: (mode: 'solo' | 'duo' | 'trio') => void;
  currentMode: 'solo' | 'duo' | 'trio';
  disabled?: boolean;
}

/**
 * Toolbar: Controls for reset, mode switching
 */
export const Toolbar: React.FC<ToolbarProps> = ({
  onReset,
  onSwitchMode,
  currentMode,
  disabled = false,
}) => {
  const t = useT();
  return (
    <div className="toolbar" role="toolbar" aria-label={t('Tierlist-Steuerung')}>
      <button onClick={onReset} disabled={disabled} className="reset-btn">
        <T>Zurücksetzen</T>
      </button>

      <button
        onClick={() => onSwitchMode('solo')}
        disabled={disabled}
        className={`mode-btn ${currentMode === 'solo' ? 'active' : ''}`}
      >
        Solo
      </button>

      <button
        onClick={() => onSwitchMode('duo')}
        disabled={disabled}
        className={`mode-btn ${currentMode === 'duo' ? 'active' : ''}`}
      >
        Duos
      </button>

      <button
        onClick={() => onSwitchMode('trio')}
        disabled={disabled}
        className={`mode-btn ${currentMode === 'trio' ? 'active' : ''}`}
      >
        Trios
      </button>
    </div>
  );
};
