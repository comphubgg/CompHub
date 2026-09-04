'use client';

import { useState } from 'react';
import { TierKey } from '../types';

export function useDragDrop() {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverTier, setDragOverTier] = useState<TierKey | null>(null);

  const reset = () => {
    setDraggedId(null);
    setDragOverId(null);
    setDragOverTier(null);
  };

  return {
    draggedId,
    dragOverId,
    dragOverTier,
    setDraggedId,
    setDragOverId,
    setDragOverTier,
    reset,
  };
}
