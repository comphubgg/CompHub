'use client';

import { useEffect } from 'react';

/*
 * Meldet dem Betreiber, wenn bei einem Besucher eine Seite abstuerzt.
 *
 * Der Betreiber (1.10.2026) hat den Vorschlag freigegeben: "Fehlermeldungen
 * echter Besucher im Alarm-Kanal". Die Seitenpruefung testet nur von aussen;
 * was ein Besucher in seinem Browser erlebt, sah bisher niemand, bis jemand
 * schrieb. Sichtbar ist hier nichts, der Baustein gibt nichts aus.
 *
 * Gemeldet wird nur, was nach einem echten Fehler aussieht: kein Rauschen von
 * Browser-Erweiterungen, keine Netzfehler (wer kein Netz hat, hat keinen
 * Fehler der Seite), kein "Script error." ohne Angaben. Je Seitenaufruf
 * hoechstens drei Meldungen; der Server fasst gleiche Fehler zusaetzlich
 * zusammen (hoechstens einer je Stunde).
 */

const RAUSCHEN = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Failed to fetch|NetworkError|Load failed|network request failed|Failed to load resource/i,
  /AbortError|The operation was aborted|signal is aborted/i,
  /ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module/i,
  /chrome-extension:|moz-extension:|safari-extension:/i,
  /Non-Error promise rejection captured/i,
];

export default function Fehlerfaenger() {
  useEffect(() => {
    let gesendet = 0;
    const gesehen = new Set<string>();

    const melde = (text: string, quelle: string, spur: string) => {
      const nachricht = String(text || '').slice(0, 300);
      if (!nachricht || gesendet >= 3) return;
      if (RAUSCHEN.some((r) => r.test(nachricht) || r.test(quelle))) return;
      const schluessel = `${nachricht}|${quelle}`;
      if (gesehen.has(schluessel)) return;
      gesehen.add(schluessel);
      gesendet += 1;
      try {
        void fetch('/api/fehlermeldung', {
          method: 'POST', keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nachricht, quelle: String(quelle || '').slice(0, 200), spur: String(spur || '').slice(0, 600),
            seite: window.location.pathname + window.location.search.slice(0, 80),
            fenster: `${window.innerWidth}x${window.innerHeight}`,
            browser: navigator.userAgent.slice(0, 160),
          }),
        }).catch(() => { /* eine Fehlermeldung darf nie selbst einen Fehler machen */ });
      } catch { /* dito */ }
    };

    const beiFehler = (e: ErrorEvent) => {
      melde(e.message, e.filename ? `${e.filename}:${e.lineno}` : '', e.error?.stack ?? '');
    };
    const beiAblehnung = (e: PromiseRejectionEvent) => {
      const grund = e.reason;
      melde(grund?.message ?? String(grund ?? ''), '', grund?.stack ?? '');
    };
    window.addEventListener('error', beiFehler);
    window.addEventListener('unhandledrejection', beiAblehnung);
    return () => {
      window.removeEventListener('error', beiFehler);
      window.removeEventListener('unhandledrejection', beiAblehnung);
    };
  }, []);

  return null;
}
