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

/** Ein Trio: drei Spieler (player1 bis player3). */
export function isTrio(data: any): boolean {
  return Boolean(isDuo(data) && (data as any).player3 && typeof (data as any).player3.name === 'string');
}

/** Die Spieler eines Eintrags - einer, zwei oder drei. */
export function mitglieder(data: any): Array<{ name: string; countryCode?: string; region?: string }> {
  if (!data || typeof data !== 'object') return [];
  if (isDuo(data)) return [data.player1, data.player2, (data as any).player3].filter(Boolean);
  return [data];
}

/** Welche Art ein Eintrag ist. */
export function artVon(entry: any): 'solo' | 'duo' | 'trio' {
  if (entry?.isTrio || isTrio(entry?.data)) return 'trio';
  return entry?.isDuo ? 'duo' : 'solo';
}

export function getDisplayName(data: any): string {
  if (!data || typeof data !== 'object') {
    return '';
  }

  if (isDuo(data)) {
    return mitglieder(data).map((p) => cleanPlayerName(p.name)).join(' / ');
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
  const duoNames = isDuo(data) ? mitglieder(data).map((p) => cleanPlayerName(p.name)).join(' ').toLowerCase() : '';
  // also match country codes (solo `countryCode` or duo player country codes)
  const soloCountry = String((data && (data.countryCode || data.country)) || '').toLowerCase();
  let duoCountries = '';
  if (isDuo(data)) {
    duoCountries = mitglieder(data).map((p) => String(p?.countryCode || '')).join(' ').toLowerCase();
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

/**
 * Der Schluessel eines Trios - derselbe wie in /api/tierlist-trios und in der
 * Entfernt-Liste ("trio:" davor, damit er nie auf ein Duo passt).
 */
export function getTrioKey(trio: any): string {
  const teile = [trio?.player1?.name, trio?.player2?.name, trio?.player3?.name]
    .map((n) => String(n ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''));
  if (teile.some((t) => !t)) return '';
  return `trio:${teile.sort().join('|')}`;
}

export function getDuoKey(duo: Duo): string {
  const first = normalizePlayerName(duo.player1?.name || '');
  const second = normalizePlayerName(duo.player2?.name || '');
  if (!first || !second) return '';
  return [first, second].sort().join('|');
}
