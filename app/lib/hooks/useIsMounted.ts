'use client';

import { useState, useEffect } from 'react';

/**
 * useIsMounted: Hook to check if component is mounted (client-side)
 * Prevents hydration mismatch in Next.js
 */
export function useIsMounted(): boolean {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return isMounted;
}
