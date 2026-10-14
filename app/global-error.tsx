'use client';

import { MARKE } from '@/lib/marke';

/*
 * Der letzte Fangnetz-Schirm: bricht schon der Rahmen der Seite (app/layout) ab, gibt es weder Kopfzeile noch Sprachwahl noch Stylesheets.
 * Deshalb steht hier alles fest im Schirm - englisch, mit dem Logo, einer Entschuldigung, "Try again" und dem Discord.
 */
export default function GlobalerFehler({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const knopf = { borderRadius: 999, padding: '10px 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' } as const;
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0b1220', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: 24 }}>
        <div style={{ maxWidth: 560 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARKE.logo} alt="CompHub" width={64} height={64} style={{ borderRadius: 16 }} />
          <p style={{ fontSize: 120, fontWeight: 800, lineHeight: 1, margin: '24px 0 0', color: '#0ea5e9' }}>500</p>
          <h1 style={{ fontSize: 30, margin: '8px 0 0' }}>Something went wrong on our side</h1>
          <p style={{ color: '#94a3b8', marginTop: 12 }}>That is our fault, not yours. We get the report automatically and are on it. Please try again in a moment.</p>
          <p style={{ color: '#cbd5e1', fontWeight: 600, marginTop: 12 }}>Sorry — that should not have happened.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 28 }}>
            <button type="button" onClick={reset} style={{ ...knopf, background: '#0ea5e9', color: '#fff', border: 'none' }}>Try again</button>
            <a href="/" style={{ ...knopf, border: '1px solid #334155', color: '#e2e8f0' }}>Back to home</a>
            <a href={MARKE.discord} style={{ ...knopf, border: '1px solid #6366f1', color: '#a5b4fc' }}>Join our Discord</a>
          </div>
        </div>
      </body>
    </html>
  );
}
