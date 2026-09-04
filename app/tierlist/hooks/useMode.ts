'use client';

import { useState } from 'react';

export function useMode(initialMode: 'solo' | 'duo') {
  const [mode, setMode] = useState<'solo' | 'duo'>(initialMode);

  const switchMode = (nextMode: 'solo' | 'duo') => {
    setMode(nextMode);
  };

  return {
    mode,
    switchMode,
  };
}
