'use client';

import { useState } from 'react';

export function useMode(initialMode: 'solo' | 'duo' | 'trio') {
  const [mode, setMode] = useState<'solo' | 'duo' | 'trio'>(initialMode);

  const switchMode = (nextMode: 'solo' | 'duo' | 'trio') => {
    setMode(nextMode);
  };

  return {
    mode,
    switchMode,
  };
}
