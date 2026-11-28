/*
 * Die laufende Match-ID des gezeigten Streamers - neben dem Kanalnamen der Einzelansicht, zum Kopieren und Zuschauen im Spiel.
 * Erscheint nur, wenn /api/streams/match-id eine liefert (Admin oder VIP mit Match-ID-Finder, Streamer mit Epic-Profil, befreundet mit dem
 * CompHub-Konto und gerade in einem Game).
 *
 * Sofort (Betreiber, 15.11.2026: "When the server has it, I want to see it on the page within 1 second"): Epic meldet den Wechsel per XMPP im
 * Augenblick an den Server, und der schickt ihn ueber einen Datenstrom (EventSource, /api/streams/match-id/stream) gleich weiter. Kommt der
 * Strom nicht zustande, wird wie bisher alle 0,5 s gefragt und alle 15 s ein neuer Strom versucht. Im Hintergrund-Tab ruht beides; beim
 * Zurueckkommen wird sofort neu verbunden (der Strom schickt beim Verbinden den aktuellen Stand).
 */

import { useEffect, useState } from 'react';
import { useT } from '../ov/sprache';

/** Damit wird es nie etwas - dann weder Strom noch Abfrage. */
const AUSSICHTSLOS = new Set(['kein-zugang', 'kein-kanal', 'kein-epic-konto']);

/** Nur fuer den Admin (die Schnittstelle schickt es nur ihm): woher die Status kommen und seit wann die Verbindung zu Epic steht. */
interface XmppStatus { quelle: 'dienst' | 'rueckfall' | 'seite'; verbunden: boolean; seit: string | null; freunde: number; imGame: number }

function StatusZeile({ s, grund }: { s: XmppStatus; grund: string | null }) {
  const quelle = s.quelle === 'dienst' ? 'XMPP service' : s.quelle === 'rueckfall' ? 'web fallback (service unreachable)' : 'web process';
  const seit = s.seit ? new Date(s.seit).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;
  return (
    <span data-xmpp-status={s.verbunden ? 'verbunden' : 'getrennt'} className={`shrink-0 text-[10px] ${s.verbunden ? 'text-slate-500' : 'text-rose-400'}`}>
      {s.verbunden ? `XMPP connected since ${seit ?? '?'}` : 'XMPP DISCONNECTED'} · {s.freunde} friends ({s.imGame} in game) · {quelle}{grund ? ` · ${grund}` : ''}
    </span>
  );
}

export default function MatchIdAnzeige({ kanal }: { kanal: string }) {
  const t = useT();
  // Die ID gilt nur fuer den Kanal, zu dem sie kam - beim Kanalwechsel steht so nie die alte da.
  const [stand, setStand] = useState<{ kanal: string; id: string | null }>({ kanal: '', id: null });
  const id = stand.kanal === kanal ? stand.id : null;
  const [xmpp, setXmpp] = useState<{ kanal: string; s: XmppStatus; grund: string | null } | null>(null);
  const [kopiert, setKopiert] = useState(false);
  useEffect(() => {
    if (!kanal) return undefined;
    let weg = false;
    let aufgegeben = false;
    let es: EventSource | null = null;
    let abfrage: ReturnType<typeof setInterval> | null = null;
    let neuVersuch: ReturnType<typeof setTimeout> | null = null;
    const k = encodeURIComponent(kanal);
    const nimm = (j: { matchId?: string | null; grund?: string | null; xmpp?: XmppStatus } | null) => {
      if (weg || !j) return;
      setStand({ kanal, id: j.matchId ?? null });
      if (j.xmpp) setXmpp({ kanal, s: j.xmpp, grund: j.grund ?? null });
      if (j.grund && AUSSICHTSLOS.has(j.grund)) { aufgegeben = true; stoppe(); }
    };
    const frag = () => fetch(`/api/streams/match-id?kanal=${k}`, { cache: 'no-store' })
      .then((r) => r.json()).then(nimm).catch(() => {});
    const abfrageAn = () => {
      if (abfrage || aufgegeben) return;
      abfrage = setInterval(() => { if (document.visibilityState === 'visible') void frag(); }, 500);
    };
    const abfrageAus = () => { if (abfrage) clearInterval(abfrage); abfrage = null; };
    const stoppe = () => {
      es?.close(); es = null;
      abfrageAus();
      if (neuVersuch) clearTimeout(neuVersuch); neuVersuch = null;
    };
    const verbinde = () => {
      if (weg || aufgegeben || es || typeof EventSource === 'undefined') { if (typeof EventSource === 'undefined') abfrageAn(); return; }
      const q = new EventSource(`/api/streams/match-id/stream?kanal=${k}`);
      es = q;
      q.addEventListener('matchid', (ev) => {
        abfrageAus();
        try { nimm(JSON.parse((ev as MessageEvent).data)); } catch { /* kaputte Zeile */ }
      });
      q.onerror = () => {
        // Bei CONNECTING verbindet der Browser selbst neu; solange gilt die Abfrage. CLOSED (403, 204, kein Strom): einmal fragen, warum.
        abfrageAn();
        if (q.readyState === EventSource.CLOSED) {
          if (es === q) es = null;
          void frag().then(() => {
            if (weg || aufgegeben || neuVersuch) return;
            neuVersuch = setTimeout(() => { neuVersuch = null; if (document.visibilityState === 'visible') verbinde(); }, 15_000);
          });
        }
      };
    };
    const sichtbar = () => {
      if (document.visibilityState === 'visible') verbinde();
      else { es?.close(); es = null; abfrageAus(); }
    };
    void frag();
    verbinde();
    document.addEventListener('visibilitychange', sichtbar);
    return () => { weg = true; stoppe(); document.removeEventListener('visibilitychange', sichtbar); };
  }, [kanal]);
  const zeile = xmpp && xmpp.kanal === kanal ? <StatusZeile s={xmpp.s} grund={id ? null : xmpp.grund} /> : null;
  if (!id) return zeile;
  return (
    <>
    <span data-match-id={id} className="flex shrink-0 items-center gap-1.5 rounded-md border border-akz/40 bg-akz/10 px-2 py-1 text-[11px]">
      <span className="font-semibold text-akz">{t('Match-ID')}</span>
      <code className="font-mono text-slate-200">{id}</code>
      <button type="button" onClick={() => { void navigator.clipboard.writeText(id).then(() => { setKopiert(true); setTimeout(() => setKopiert(false), 2000); }); }}
        className="rounded border border-akz/40 px-1.5 font-semibold text-akz transition hover:bg-akz/20">
        {kopiert ? t('Kopiert') : t('Kopieren')}
      </button>
    </span>
    {zeile}
    </>
  );
}
