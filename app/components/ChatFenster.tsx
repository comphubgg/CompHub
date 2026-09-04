'use client';

/*
 * Das Gespraech mit dem Betreiber - links am Rand.
 *
 * Aus dem Kontaktformular wurde eine Einbahnstrasse: jemand schrieb, und wer
 * eine Antwort wollte, wartete auf eine Mail. Der Betreiber wollte das im
 * Werkzeug haben - "dass ich ja auch im Tool selber zurueckantworten kann und
 * es dann eine Art Live-Chat gibt", mit einem Chatsymbol am Rand und einer
 * Zahl, wenn jemand geschrieben hat.
 *
 * Beide Seiten sehen dasselbe Fenster: der Betreiber alle Gespraeche, jeder
 * andere seine eigenen. Wer nichts laufen hat, sieht auch keinen Knopf - ein
 * leeres Chatfenster waere nur ein Kaestchen, das niemand braucht.
 *
 * Die Gegenstelle liegt bei den Sprachschaltern unten rechts; dieses Fenster
 * kommt bewusst von links, damit sich die beiden nie ins Gehege kommen.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import T from './T';
import { useT } from './SprachProvider';

interface Nachricht {
  id: string; zeit: number; von: 'nutzer' | 'betreiber';
  name: string; text: string; bilder: string[];
}

interface Gespraech {
  id: string; zeit: number; thema: string; eigenesThema: string;
  erledigt: boolean; vonName: string; vonEmail: string;
  verlauf: Nachricht[]; zuletzt: number; ungelesen: number;
}

/** Wie oft nachgefragt wird - offen haeufiger als geschlossen. */
const TAKT_ZU_MS = 30_000;
const TAKT_OFFEN_MS = 5_000;

const THEMENNAME: Record<string, string> = {
  support: 'Support', report: 'Report', hilfe: 'Hilfe',
  idee: 'Idee', anderes: 'Anderes',
};

export default function ChatFenster() {
  const t = useT();
  const [offen, setOffen] = useState(false);
  const [gespraeche, setGespraeche] = useState<Gespraech[]>([]);
  const [ungelesen, setUngelesen] = useState(0);
  const [darf, setDarf] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [entwurf, setEntwurf] = useState('');
  const [sendet, setSendet] = useState(false);
  const endeRef = useRef<HTMLDivElement | null>(null);

  /* --------------------------------------------------------------- Holen */

  const holen = useCallback(async (nurZahl: boolean) => {
    try {
      const r = await fetch(`/api/kontakt/chat${nurZahl ? '?zahl=1' : ''}`,
        { cache: 'no-store' });
      if (!r.ok) { setDarf(false); return; }
      const j = await r.json();
      setDarf(true);
      setAdmin(Boolean(j.admin));
      setUngelesen(Number(j.ungelesen ?? 0));
      if (!nurZahl && Array.isArray(j.gespraeche)) setGespraeche(j.gespraeche);
    } catch { /* Netz weg: beim naechsten Takt wieder */ }
  }, []);

  // Beim ersten Zeichnen einmal alles, danach nur noch die Zahl. Wer nichts
  // laufen hat, soll auch keinen Knopf sehen - dafuer braucht es die Liste.
  useEffect(() => { void holen(false); }, [holen]);

  useEffect(() => {
    const uhr = setInterval(() => { void holen(!offen); },
      offen ? TAKT_OFFEN_MS : TAKT_ZU_MS);
    return () => clearInterval(uhr);
  }, [offen, holen]);

  // Beim Zurueckkommen sofort nachsehen: Browser drosseln Zeitgeber in
  // verborgenen Tabs bis auf einen Lauf je Minute.
  useEffect(() => {
    const beimAnschauen = () => {
      if (document.visibilityState === 'visible') void holen(!offen);
    };
    document.addEventListener('visibilitychange', beimAnschauen);
    return () => document.removeEventListener('visibilitychange', beimAnschauen);
  }, [offen, holen]);

  const aktuell = gespraeche.find((g) => g.id === gewaehlt) ?? null;

  // Ans Ende springen, sobald ein Gespraech offen ist oder etwas dazukommt.
  useEffect(() => {
    if (offen && aktuell) endeRef.current?.scrollIntoView({ block: 'end' });
  }, [offen, aktuell?.verlauf.length, gewaehlt]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Ein Gespraech oeffnen und als gelesen vermerken. */
  const oeffne = useCallback(async (id: string) => {
    setGewaehlt(id);
    // Sofort auf null setzen, damit die Zahl nicht bis zum naechsten Takt
    // stehenbleibt, obwohl man gerade hinsieht.
    setGespraeche((alt) => alt.map((g) => (g.id === id ? { ...g, ungelesen: 0 } : g)));
    setUngelesen((n) => Math.max(0, n - (gespraeche.find((g) => g.id === id)?.ungelesen ?? 0)));
    try {
      await fetch('/api/kontakt/chat', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch { /* dann beim naechsten Oeffnen */ }
  }, [gespraeche]);

  async function senden() {
    const text = entwurf.trim();
    if (!text || !gewaehlt || sendet) return;
    setSendet(true);
    try {
      const r = await fetch('/api/kontakt/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: gewaehlt, text }),
      });
      if (r.ok) {
        const j = await r.json();
        setEntwurf('');
        if (j.gespraech) {
          setGespraeche((alt) => alt.map((g) => (g.id === j.gespraech.id ? j.gespraech : g)));
        }
      }
    } catch { /* stehen lassen, damit nichts verlorengeht */ }
    finally { setSendet(false); }
  }

  /* ------------------------------------------------------------- Anzeige */

  // Kein Zugang, oder nichts zu besprechen: dann auch kein Knopf.
  if (!darf) return null;
  if (!admin && gespraeche.length === 0) return null;

  const betreff = (g: Gespraech) => (g.eigenesThema
    || t(THEMENNAME[g.thema] ?? 'Anderes'));

  const uhrzeit = (ms: number) => new Date(ms).toLocaleString(undefined, {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  return (
    <>
      {/* ------------------------------------------------- Der Knopf am Rand */}
      <button
        type="button"
        onClick={() => setOffen((v) => !v)}
        aria-label={t('Nachrichten')}
        className="fixed left-0 top-1/2 z-40 flex -translate-y-1/2 items-center
                   gap-2 rounded-r-xl border border-l-0 border-zinc-800
                   bg-zinc-900/95 py-3 pl-2 pr-3 text-slate-300 shadow-lg
                   backdrop-blur transition hover:border-sky-500
                   hover:text-sky-400"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
          strokeLinejoin="round">
          <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-4.2-.9L3 21l1.9-4.4A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" />
        </svg>
        {ungelesen > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full
                           bg-sky-500 px-1.5 text-[11px] font-bold text-white">
            {ungelesen > 99 ? '99+' : ungelesen}
          </span>
        )}
      </button>

      {/* ------------------------------------------------------ Das Fenster */}
      {offen && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setOffen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-md flex-col border-r
                       border-zinc-800 bg-zinc-950 shadow-2xl sm:h-[80vh]
                       sm:my-auto sm:rounded-r-2xl sm:border"
          >
            <div className="flex items-center justify-between border-b
                            border-zinc-800 px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-100">
                  {aktuell ? betreff(aktuell) : <T>Nachrichten</T>}
                </h2>
                {aktuell && (
                  <p className="truncate text-[11px] text-slate-500">
                    {admin ? aktuell.vonName : t('CompHub')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                {aktuell && (
                  <button onClick={() => setGewaehlt(null)}
                    className="rounded-lg px-2 py-1 text-xs text-slate-400
                               transition hover:text-sky-400">
                    ← <T>zurück</T>
                  </button>
                )}
                <button onClick={() => setOffen(false)} aria-label={t('schließen')}
                  className="rounded-lg p-1.5 text-slate-500 transition
                             hover:text-slate-200">
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none"
                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M5 5l10 10M15 5L5 15" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Die Liste der Gespraeche */}
            {!aktuell && (
              <div className="flex-1 overflow-y-auto">
                {gespraeche.length === 0 ? (
                  <p className="p-8 text-center text-sm text-slate-500">
                    <T>Noch keine Nachrichten.</T>
                  </p>
                ) : gespraeche.map((g) => (
                  <button key={g.id} onClick={() => void oeffne(g.id)}
                    className="flex w-full items-start gap-3 border-b
                               border-zinc-900 px-4 py-3 text-left transition
                               hover:bg-zinc-900/60">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-200">
                          {betreff(g)}
                        </span>
                        {admin && (
                          <span className="truncate text-[11px] text-slate-500">
                            · {g.vonName}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {g.verlauf[g.verlauf.length - 1]?.text}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[10px] text-slate-600">
                        {uhrzeit(g.zuletzt)}
                      </span>
                      {g.ungelesen > 0 && (
                        <span className="grid h-4 min-w-4 place-items-center
                                         rounded-full bg-sky-500 px-1
                                         text-[10px] font-bold text-white">
                          {g.ungelesen}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Der Verlauf */}
            {aktuell && (
              <>
                <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                  {aktuell.verlauf.map((n) => {
                    const eigen = admin ? n.von === 'betreiber' : n.von === 'nutzer';
                    return (
                      <div key={n.id}
                        className={`flex ${eigen ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5
                          ${eigen
                            ? 'bg-sky-500/15 text-slate-100'
                            : 'bg-zinc-900 text-slate-200'}`}>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">
                            {n.text}
                          </p>
                          {n.bilder.length > 0 && (
                            <div className="mt-2 grid grid-cols-2 gap-1.5">
                              {n.bilder.map((b) => (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img key={b} alt=""
                                  src={`/api/kontakt-bild?datei=${encodeURIComponent(b)}`}
                                  className="h-20 w-full rounded-lg object-cover" />
                              ))}
                            </div>
                          )}
                          <p className="mt-1 text-right text-[10px] text-slate-500">
                            {uhrzeit(n.zeit)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={endeRef} />
                </div>

                <div className="border-t border-zinc-800 p-3">
                  <div className="flex items-end gap-2">
                    <textarea
                      value={entwurf}
                      onChange={(e) => setEntwurf(e.target.value)}
                      onKeyDown={(e) => {
                        // Enter schickt, Umschalt+Enter macht einen Absatz -
                        // so wie in jedem anderen Chat auch.
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault(); void senden();
                        }
                      }}
                      rows={2}
                      placeholder={t('Antwort schreiben …')}
                      className="flex-1 resize-none rounded-xl border
                                 border-zinc-800 bg-zinc-950 px-3 py-2 text-sm
                                 text-slate-100 outline-none
                                 placeholder:text-slate-600
                                 focus:border-sky-500" />
                    <button onClick={() => void senden()}
                      disabled={sendet || !entwurf.trim()}
                      className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm
                                 font-medium text-white transition
                                 hover:bg-sky-400 disabled:opacity-40">
                      {sendet ? <T>sendet …</T> : <T>Senden</T>}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
