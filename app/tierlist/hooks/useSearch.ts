'use client';

import { useState } from 'react';

export function useSearch() {
  const [searchQuery, setSearchQuery] = useState('');

  return {
    searchQuery,
    setSearchQuery,
    clearSearch: () => setSearchQuery(''),
  };
}
