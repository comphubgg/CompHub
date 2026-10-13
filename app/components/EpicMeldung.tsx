'use client';

import { useEffect, useState } from 'react';
import T from '@/app/components/T';

/*
 * Was Epic bei der Rueckkehr von "Mit Epic Games verifizieren" gemeldet hat (?epic=verbunden, ?epic=token&grund=...).
 *
 * Eine fehlgeschlagene Verifizierung zeigt zusaetzlich Epics eigene Begruendung (z. B. invalid_client) - der Betreiber (14.10.2026) stand
 * vor "hat nicht geklappt" ohne jeden Hinweis, woran es lag.
 */
export default function EpicMeldung() {
  const [meldung, setMeldung] = useState<{ art: string; grund: string } | null>(null);
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const art = p.get('epic');
      if (art) setMeldung({ art, grund: (p.get('grund') ?? '').slice(0, 200) });
    } catch { /* ohne Adresse keine Meldung */ }
  }, []);
  if (!meldung) return null;
  if (meldung.art === 'verbunden') {
    return <p className="mb-3 rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300"><T>Dein Epic-Konto ist verifiziert.</T></p>;
  }
  return (
    <p className="mb-3 rounded-lg border border-amber-800 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
      <T>Die Verifizierung mit Epic hat nicht geklappt. Bitte versuche es noch einmal.</T>
      {meldung.grund && <span className="mt-1 block break-words font-mono text-[11px] text-amber-400/80">Epic: {meldung.grund}</span>}
    </p>
  );
}
