import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { SEITE } from '../../teile/Glas';

/*
 * Eine echte Seite von thecomphub.com im Hub - als Rahmen (iframe) unter /site/<pfad>. Der Vite-Proxy (vite.config.ts) reicht die Seite samt Skripten,
 * Stilen und der Next-Navigation an die echte Seite weiter; gleicher Ursprung, also gelten die Cookies der Anmeldung und alles funktioniert wie dort.
 * Erster Schritt, damit kein Werkzeug fehlt (Betreiber: "Du darfst nicht einfach Sachen entfernen"); gebaut wird nach und nach im Hub selbst.
 *
 * Die Kopfzeile der Seite wird im Rahmen ausgeblendet - oben steht ja schon die des Hubs.
 */
const STIL = 'header.kopf{display:none!important} body{background:#05070d!important}';

export default function Rahmen({ pfad, titel, nativ }: { pfad: string; titel: string; nativ?: () => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [geladen, setGeladen] = useState(false);
  const [jetzt, setJetzt] = useState(pfad);
  const [schluessel, setSchluessel] = useState(0);

  // Stil einsetzen und mitlesen, wo der Rahmen gerade ist (Next wechselt Seiten ohne neues Laden - deshalb im Takt nachsehen).
  useEffect(() => {
    const uhr = window.setInterval(() => {
      try {
        const d = ref.current?.contentDocument; const w = ref.current?.contentWindow;
        if (!d || !w) return;
        if (d.head && !d.getElementById('hub-rahmen-stil')) {
          const s = d.createElement('style'); s.id = 'hub-rahmen-stil'; s.textContent = STIL; d.head.appendChild(s);
        }
        if (w.location.href === 'about:blank') return;
        // Schon zeigen, sobald das Dokument steht - nicht erst, wenn jedes Bild geladen ist.
        if (d.readyState !== 'loading') setGeladen(true);
        setJetzt(w.location.pathname.replace(/^\/site/, '') + w.location.search);
      } catch { /* anderer Ursprung (z. B. Twitch-Anmeldung) - dann nichts einsetzen */ }
    }, 400);
    return () => window.clearInterval(uhr);
  }, []);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-[calc(100vh-150px)] min-h-[560px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/5 px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm font-bold text-white">
          <span className={`h-2 w-2 rounded-full ${geladen ? 'bg-emerald-400' : 'animate-pulse bg-amber-400'}`} />{titel}
        </span>
        <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 font-mono text-[11px] text-white/50">thecomphub.com{jetzt}</span>
        <span className="rounded-full bg-sky-400/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-300">Live site</span>
        <span className="ml-auto flex items-center gap-1.5">
          {nativ && <button type="button" onClick={nativ} className="rounded-full border border-sky-400/40 bg-sky-400/10 px-3 py-1.5 text-xs font-semibold text-sky-200 transition hover:bg-sky-400/20">Hub view</button>}
          <button type="button" onClick={() => { setGeladen(false); setSchluessel((k) => k + 1); }} title="Reload"
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:border-white/25 hover:text-white">Reload</button>
          <a href={`${SEITE}${jetzt}`} target="_blank" rel="noreferrer" className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:border-white/25 hover:text-white">Open on site ↗</a>
        </span>
      </div>
      <div className="relative flex-1">
        {!geladen && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-3 text-sm text-white/50">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-sky-400" />Loading the live page …
            </div>
          </div>
        )}
        <iframe key={schluessel} ref={ref} src={`/site${pfad}`} title={titel} onLoad={() => setGeladen(true)}
          className={`h-full w-full border-0 transition-opacity duration-300 ${geladen ? 'opacity-100' : 'opacity-0'}`} />
      </div>
    </motion.div>
  );
}
