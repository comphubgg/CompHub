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
import { liesChatHud, setzeChatHud, CHAT_HUD_EREIGNIS } from '@/app/lib/chatHud';

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

/**
 * Das Chatfenster.
 *
 * Zwei Erscheinungsformen aus einem Bauteil: schwebend am Rand, und als ganze
 * Seite unter /nachrichten. Der Betreiber wollte beides - "einen Chatbalken,
 * wo ich alle meine Chats noch mal angucken kann, so wie ein Archiv", ohne
 * jedesmal ueber das Symbol gehen zu muessen. Zwei getrennte Fassungen waeren
 * zwei Stellen, an denen jede kuenftige Aenderung passieren muesste - und
 * irgendwann waere eine davon vergessen worden.
 */
export default function ChatFenster({ alsSeite = false }: { alsSeite?: boolean }) {
  const t = useT();
  const [offen, setOffen] = useState(alsSeite);
  const [gespraeche, setGespraeche] = useState<Gespraech[]>([]);
  const [ungelesen, setUngelesen] = useState(0);
  const [darf, setDarf] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [entwurf, setEntwurf] = useState('');
  const [sendet, setSendet] = useState(false);
  /** Bilder, die mit der naechsten Nachricht hinausgehen. */
  const [anhaenge, setAnhaenge] = useState<string[]>([]);
  /** Welches Bild gerade gross angesehen wird. */
  const [gross, setGross] = useState<string | null>(null);
  /** Antwort auf einen Befehl - nur fuer den Betreiber, nicht im Verlauf. */
  const [hinweis, setHinweis] = useState<string | null>(null);
  const endeRef = useRef<HTMLDivElement | null>(null);

  /*
   * Steht der Knopf am Rand?
   *
   * null heisst "noch nicht gelesen". Erst nach dem Zusammenfuegen im Browser
   * steht fest, was jemand eingestellt hat - haette man hier "ja" angenommen,
   * blitzte der Knopf bei jedem Seitenaufruf kurz auf, obwohl er weg sein
   * soll.
   */
  const [amRand, setAmRand] = useState<boolean | null>(null);
  useEffect(() => {
    setAmRand(liesChatHud());
    const beiAenderung = (e: Event) => setAmRand((e as CustomEvent).detail !== false);
    window.addEventListener(CHAT_HUD_EREIGNIS, beiAenderung);
    // Wurde es in einem anderen Tab umgestellt, gilt es auch hier.
    const beiSpeicher = () => setAmRand(liesChatHud());
    window.addEventListener('storage', beiSpeicher);
    return () => {
      window.removeEventListener(CHAT_HUD_EREIGNIS, beiAenderung);
      window.removeEventListener('storage', beiSpeicher);
    };
  }, []);

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

  /*
   * Die offene Leitung.
   *
   * Der Takt oben ist damit nur noch das Netz fuer den Fall, dass die
   * Verbindung abreisst. Solange sie steht, meldet sich der Server von selbst,
   * sobald jemand etwas geschrieben hat - zwischen "abgeschickt" und "steht
   * beim anderen auf dem Schirm" liegt dann weniger als eine Sekunde statt
   * bis zu fuenf.
   */
  useEffect(() => {
    if (!darf) return;
    let lebt = true;
    let quelle: EventSource | null = null;
    try {
      quelle = new EventSource('/api/kontakt/chat/live');
      quelle.onmessage = () => { if (lebt) void holen(false); };
      // Bei einem Fehler verbindet die Ereignisquelle von selbst neu.
      quelle.onerror = () => {};
    } catch { /* kein EventSource: dann bleibt es beim Takt */ }
    return () => { lebt = false; quelle?.close(); };
  }, [darf, holen]);

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

  /*
   * Ein Bild aufnehmen - aus der Dateiwahl oder aus der Zwischenablage.
   *
   * Strg+V ist der Weg, den die meisten nehmen: Bildschirmausschnitt machen,
   * ins Fenster einfuegen, fertig. Wer die Datei erst speichern muss, schickt
   * am Ende keins mit - und gerade bei einem Fehlerbericht sagt ein Bild mehr
   * als drei Saetze.
   */
  const nimmDatei = useCallback((datei: File) => {
    if (!datei.type.startsWith('image/')) return;
    // Fuenf Megabyte je Bild - dieselbe Grenze wie im Kontaktformular.
    if (datei.size > 5 * 1024 * 1024) return;
    const leser = new FileReader();
    leser.onload = () => setAnhaenge((a) => (a.length >= 4 ? a : [...a, String(leser.result)]));
    leser.readAsDataURL(datei);
  }, []);

  useEffect(() => {
    if (!offen) return;
    const rein = (e: ClipboardEvent) => {
      const datei = [...(e.clipboardData?.items ?? [])]
        .find((i) => i.type.startsWith('image/'))?.getAsFile();
      if (datei) { e.preventDefault(); nimmDatei(datei); }
    };
    window.addEventListener('paste', rein);
    return () => window.removeEventListener('paste', rein);
  }, [offen, nimmDatei]);

  async function senden() {
    const text = entwurf.trim();
    // Ein Bild allein ist auch eine Nachricht - dann steht eben kein Satz
    // dabei. Der Server verlangt allerdings Text, also geht ein Punkt mit.
    if ((!text && anhaenge.length === 0) || !gewaehlt || sendet) return;
    setSendet(true);
    try {
      const r = await fetch('/api/kontakt/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: gewaehlt,
          text: text || '📷',
          bilder: anhaenge,
        }),
      });
      if (r.ok) {
        const j = await r.json();
        setEntwurf('');
        setAnhaenge([]);
        // Die Antwort auf einen Befehl steht ueber dem Schreibfeld, nicht im
        // Verlauf: der Gegenueber muss nicht sehen, dass jemand eine Liste
        // abgerufen hat.
        setHinweis(j.hinweis ?? null);
        if (j.gespraech) {
          setGespraeche((alt) => alt.map((g) => (g.id === j.gespraech.id ? j.gespraech : g)));
        }
        // Ein Befehl kann mehr veraendert haben als dieses eine Gespraech -
        // /neu legt eines an, /add nimmt jemanden auf.
        if (j.neuLaden) void holen(false);
      }
    } catch { /* stehen lassen, damit nichts verlorengeht */ }
    finally { setSendet(false); }
  }

  /* ------------------------------------------------------------- Anzeige */

  // Kein Zugang, oder nichts zu besprechen: dann auch kein Knopf.
  if (!darf) return null;
  if (!admin && gespraeche.length === 0) return null;
  // Ausgeblendet, oder noch nicht gelesen: dann nichts am Rand. Ein offenes
  // Fenster bleibt offen - wer gerade schreibt, soll nicht unterbrochen werden.
  // Als ganze Seite gilt das nicht: wer /nachrichten aufruft, will sie sehen,
  // auch wenn er das Symbol am Rand weggeklickt hat.
  if (!alsSeite && (amRand === null || (amRand === false && !offen))) return null;

  const betreff = (g: Gespraech) => (g.eigenesThema
    || t(THEMENNAME[g.thema] ?? 'Anderes'));

  const uhrzeit = (ms: number) => new Date(ms).toLocaleString(undefined, {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  return (
    <>
      {/* ------------------------------------------------- Der Knopf am Rand */}
      {!alsSeite && (
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
      )}

      {/* ------------------------------------------------------ Das Fenster */}
      {offen && (
        <div
          className={alsSeite
            ? 'mx-auto w-full max-w-3xl px-4 py-6'
            : 'fixed inset-0 z-50 flex'}
          onClick={alsSeite ? undefined : () => setOffen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className={alsSeite
              ? 'flex h-[calc(100vh-9rem)] w-full flex-col rounded-2xl border border-zinc-800 bg-zinc-950'
              : `flex h-full w-full max-w-md flex-col border-r
                 border-zinc-800 bg-zinc-950 shadow-2xl sm:h-[80vh]
                 sm:my-auto sm:rounded-r-2xl sm:border`}
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
                {/*
                  * Weg mit dem Knopf.
                  *
                  * Hier und nicht nur in den Einstellungen: wer das Ding
                  * loswerden will, sitzt gerade davor. Zurueckholen laesst es
                  * sich unter "Mein Konto".
                  */}
                {!alsSeite && (
                <button
                  onClick={() => { setzeChatHud(false); setOffen(false); }}
                  title={t('Symbol am Rand ausblenden — zurück unter „Mein Konto"')}
                  className="rounded-lg px-2 py-1 text-[11px] text-slate-500
                             transition hover:text-sky-400">
                  <T>ausblenden</T>
                </button>
                )}
                {!alsSeite && (
                <button onClick={() => setOffen(false)} aria-label={t('schließen')}
                  className="rounded-lg p-1.5 text-slate-500 transition
                             hover:text-slate-200">
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none"
                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M5 5l10 10M15 5L5 15" />
                  </svg>
                </button>
                )}
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
                                <button key={b} type="button"
                                  onClick={() => setGross(b)}
                                  className="overflow-hidden rounded-lg transition
                                             hover:opacity-80">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img alt=""
                                    src={`/api/kontakt-bild?datei=${encodeURIComponent(b)}`}
                                    className="h-20 w-full object-cover" />
                                </button>
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
                  {/* Die Antwort auf einen Befehl. Verschwindet beim naechsten
                      Absenden von selbst. */}
                  {hinweis && (
                    <div className="mb-2 rounded-lg border border-zinc-800
                                    bg-zinc-900/60 p-3">
                      <pre className="overflow-x-auto whitespace-pre-wrap font-mono
                                      text-[11px] leading-relaxed text-slate-300">{hinweis}</pre>
                      <button type="button" onClick={() => setHinweis(null)}
                        className="mt-1 text-[10px] text-slate-500 transition
                                   hover:text-sky-400">
                        <T>schließen</T>
                      </button>
                    </div>
                  )}

                  {/* Was mitgeht, bevor es mitgeht. */}
                  {anhaenge.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {anhaenge.map((b, i) => (
                        <div key={i} className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={b} alt=""
                            className="h-14 w-14 rounded-lg border border-zinc-800
                                       object-cover" />
                          <button type="button"
                            onClick={() => setAnhaenge((a) => a.filter((_, k) => k !== i))}
                            aria-label={t('entfernen')}
                            className="absolute -right-1.5 -top-1.5 grid h-5 w-5
                                       place-items-center rounded-full bg-zinc-800
                                       text-xs text-slate-300 transition
                                       hover:bg-red-500 hover:text-white">
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-end gap-2">
                    {anhaenge.length < 4 && (
                      <label title={t('Bild anhängen (Strg+V geht auch)')}
                        className="cursor-pointer rounded-xl border border-zinc-800
                                   px-3 py-2.5 text-slate-400 transition
                                   hover:border-sky-500 hover:text-sky-400">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none"
                          stroke="currentColor" strokeWidth="1.7"
                          strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21.4 11.05 12.25 20.2a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.65 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                        </svg>
                        <input type="file" accept="image/*" multiple className="hidden"
                          onChange={(e) => {
                            for (const d of Array.from(e.target.files ?? [])) nimmDatei(d);
                            e.target.value = '';
                          }} />
                      </label>
                    )}
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
                      placeholder={admin
                        ? t('Antwort schreiben — /hilfe zeigt die Befehle')
                        : t('Antwort schreiben …')}
                      className="flex-1 resize-none rounded-xl border
                                 border-zinc-800 bg-zinc-950 px-3 py-2 text-sm
                                 text-slate-100 outline-none
                                 placeholder:text-slate-600
                                 focus:border-sky-500" />
                    <button onClick={() => void senden()}
                      disabled={sendet || (!entwurf.trim() && anhaenge.length === 0)}
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

      {/*
        * Ein Bild gross ansehen.
        *
        * Ein Bildschirmausschnitt in Briefmarkengroesse nuetzt bei einem
        * Fehlerbericht nichts - man will lesen koennen, was daraufsteht.
        * Klick irgendwohin schliesst wieder.
        */}
      {gross && (
        <div onClick={() => setGross(null)}
          className="fixed inset-0 z-[60] grid place-items-center bg-zinc-950/95 p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt=""
            src={`/api/kontakt-bild?datei=${encodeURIComponent(gross)}`}
            className="max-h-full max-w-full rounded-lg" />
          <button type="button" aria-label={t('schließen')}
            className="absolute right-6 top-6 rounded-lg bg-zinc-900/80 p-2
                       text-slate-300 transition hover:text-white">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
