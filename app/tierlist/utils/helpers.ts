'use client';

import { Duo, Player } from '../types';
import { FLAG_CODES, REGION_LABELS } from './constants';

export function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return `tier-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizePlayerName(name: string | undefined): string {
  return String(name || '').trim().toLowerCase();
}

export function cleanPlayerName(name: string): string {
  return String(name || '').trim();
}

export function getPrimaryRegion(player: Player): string {
  if (!player) return 'EU';
  return String(player.region || 'EU');
}

export function isDuo(data: any): data is Duo {
  return Boolean(data && data.player1 && data.player2 && typeof data.player1.name === 'string' && typeof data.player2.name === 'string');
}

export function getDisplayName(data: any): string {
  if (!data || typeof data !== 'object') {
    return '';
  }

  if (isDuo(data)) {
    return `${cleanPlayerName(data.player1.name)} / ${cleanPlayerName(data.player2.name)}`;
  }

  if (typeof data.name === 'string' && data.name.trim()) {
    return cleanPlayerName(data.name);
  }

  return '';
}

export function matchesSearch(data: any, query: string): boolean {
  if (!query) return true;
  if (!data || typeof data !== 'object') return false;
  const raw = String(query || '').trim();
  const q = raw.toLowerCase();
  const isAllUpper = raw.length > 0 && raw === raw.toUpperCase();
  const name = getDisplayName(data).toLowerCase();
  const region = String(data.region || '').toLowerCase();
  const duoNames = isDuo(data) ? `${cleanPlayerName(data.player1.name)} ${cleanPlayerName(data.player2.name)}`.toLowerCase() : '';
  // also match country codes (solo `countryCode` or duo player country codes)
  const soloCountry = String((data && (data.countryCode || data.country)) || '').toLowerCase();
  let duoCountries = '';
  if (isDuo(data)) {
    duoCountries = `${String(data.player1?.countryCode || '')} ${String(data.player2?.countryCode || '')}`.toLowerCase();
  }

  // If the query is exactly a known 2-letter flag code and is typed in ALL CAPS,
  // treat it as a country-only filter (e.g. "DE" matches only countryCode 'de').
  const isTwoLetter = /^[a-z]{2}$/.test(q);
  const isKnownFlag = isTwoLetter && FLAG_CODES.includes(q);
  if (isAllUpper && isKnownFlag) {
    return soloCountry === q || duoCountries.split(' ').includes(q);
  }

  // Only exact ALL-CAPS region codes act as region filters.
  // Mixed/lowercase input like "nac" remains normal text search.
  const regionKeys = Object.keys(REGION_LABELS || {});
  if (isAllUpper && regionKeys.includes(raw)) {
    const regionUpper = raw;
    const entryRegion = String((data && (data.region || data.regionCode)) || '').toUpperCase();
    if (entryRegion === regionUpper) return true;
    // For duos, also check each player's region if present
    if (isDuo(data)) {
      const p1 = String(data.player1?.region || '').toUpperCase();
      const p2 = String(data.player2?.region || '').toUpperCase();
      return p1 === regionUpper || p2 === regionUpper;
    }
    return false;
  }

  return (
    name.includes(q) ||
    region.includes(q) ||
    duoNames.includes(q)
  );
}

export function getSoloKey(player: Partial<Player> | { name?: unknown } | null | undefined): string {
  if (!player || typeof player !== 'object') {
    return '';
  }
  return normalizePlayerName((player as { name?: unknown }).name as string | undefined);
}

export function getDuoKey(duo: Duo): string {
  const first = normalizePlayerName(duo.player1?.name || '');
  const second = normalizePlayerName(duo.player2?.name || '');
  if (!first || !second) return '';
  return [first, second].sort().join('|');
}
