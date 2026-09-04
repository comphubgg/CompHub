'use client';

import React from 'react';

import T from '@/app/components/T';
interface ToolbarProps {
  onReset: () => void;
  onSwitchMode: (mode: 'solo' | 'duo') => void;
  currentMode: 'solo' | 'duo';
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
  return (
    <div className="toolbar" role="toolbar" aria-label="Tierlist controls">
      <button onClick={onReset} disabled={disabled} className="reset-btn">
        <T>Reset</T>
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
    </div>
  );
};
