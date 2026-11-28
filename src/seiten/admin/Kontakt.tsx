import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Flaeche, Leer, Segment } from '../../ds/Bausteine';
import { Laedt, NurAdmins, WerkzeugKopf, feld, her, knopfHaupt, knopfLeise, wann } from './teile';

/*
 * Kontakt-Posteingang (app/admin/contact auf main, /api/kontakt). Design-System 3.0 (28.11.2026): wie ein Mailprogramm - links die Liste
 * (Offen / Erledigt / Alle, Themen als Chips), rechts die gewaehlte Meldung zum Lesen und Antworten. Vorher: offene Meldungen zuerst, erledigte eingeklappt. Je Meldung Thema, Text,
 * Bilder (gross ansehen), Absender mit Adresse, eine Notiz fuer dich, Antwort per Mail (PATCH { id, antwort } - danach erledigt), erledigt / wieder
 * oeffnen (PATCH { id, erledigt }) und loeschen (DELETE { id }). ?gespraech=<id> springt zur Meldung (Links aus Discord und Mail).
 */
interface Meldung { id: string; zeit: number; thema: string; eigenesThema: string; text: string; bilder: string[]; vonId: string; vonName: string; vonEmail: string; erledigt: boolean; notiz: string }
const FARBE: Record<string, string> = {
  support: 'border-akz/40 bg-akz/10 text-akz', report: 'border-rose-400/40 bg-rose-400/10 text-rose-300',
  feedback: 'border-violet-400/40 bg-violet-400/10 text-violet-300', hilfe: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
  idee: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300', anderes: 'border-white/15 bg-white/5 text-white/60',
};
const THEMA: Record<string, string> = { hilfe: 'help', idee: 'idea', anderes: 'other' };
const bildUrl = (b: string) => `/api/kontakt-bild?datei=${encodeURIComponent(b)}`;

export default function Kontakt({ klassisch }: { klassisch: () => void }) {
  const [p] = useSearchParams();
  const ziel = p.get('gespraech') ?? '';
  const [meldungen, setMeldungen] = useState<Meldung[]>([]);
  const [erlaubt, setErlaubt] = useState<boolean | null>(null);
  const [ansicht, setAnsicht] = useState<'offen' | 'erledigt' | 'alle'>('offen');
  const [themaWahl, setThemaWahl] = useState('');
  const [wahl, setWahl] = useState(ziel);
  const [gross, setGross] = useState<string | null>(null);
  const [antworten, setAntworten] = useState<Record<string, string>>({});
  const [sendet, setSendet] = useState<string | null>(null);
  const [antwortStand, setAntwortStand] = useState<Record<string, string>>({});

  const holen = useCallback(async () => {
    try {
      const r = await fetch('/api/kontakt', { cache: 'no-store' });
      if (!r.ok) { setErlaubt(false); return; }
      const j = await r.json(); setMeldungen(j.meldungen ?? []); setErlaubt(true);
    } catch { setErlaubt(false); }
  }, []);
  useEffect(() => { void holen(); }, [holen]);
  // ?gespraech=<id> (Links aus Discord und Mail): diese Meldung oeffnen, auch wenn sie schon erledigt ist
  useEffect(() => { const m = meldungen.find((x) => x.id === ziel); if (m) { setWahl(ziel); if (m.erledigt) setAnsicht('alle'); } }, [ziel, meldungen]);

  const patch = async (k: Record<string, unknown>) => {
    const r = await fetch('/api/kontakt', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(k) });
    return { r, j: await r.json().catch(() => ({})) };
  };
  async function antwortSenden(id: string) {
    const text = (antworten[id] ?? '').trim(); if (text.length < 2) return;
    setSendet(id); setAntwortStand((a) => ({ ...a, [id]: '' }));
    try {
      const { r, j } = await patch({ id, antwort: text });
      if (r.ok) { setMeldungen(j.meldungen ?? []); setAntworten((a) => ({ ...a, [id]: '' })); setAntwortStand((a) => ({ ...a, [id]: 'Reply sent.' })); }
      else setAntwortStand((a) => ({ ...a, [id]: j.fehler ?? 'That did not work.' }));
    } catch { setAntwortStand((a) => ({ ...a, [id]: 'That did not work.' })); } finally { setSendet(null); }
  }
  async function setzeErledigt(id: string, wert: boolean) { const { r, j } = await patch({ id, erledigt: wert }); if (r.ok) setMeldungen(j.meldungen ?? []); }
  async function entfernen(id: string) {
    if (!window.confirm('Delete this message for good?')) return;
    const r = await fetch('/api/kontakt', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    if (r.ok) setMeldungen((await r.json()).meldungen ?? []);
  }

  const offene = meldungen.filter((m) => !m.erledigt);
  const erledigte = meldungen.filter((m) => m.erledigt);
  const kopf = <WerkzeugKopf ueber="Inbox" titel="Contact" text={erlaubt ? (offene.length ? `${offene.length} open – reply by email, mark as done, keep a note.` : 'Nothing open – the inbox is empty.') : 'Messages from the contact form.'} klassisch={klassisch} />;
  if (erlaubt === false) return <>{kopf}<NurAdmins /></>;
  if (erlaubt === null) return <>{kopf}<Laedt /></>;

  const liste = (ansicht === 'offen' ? offene : ansicht === 'erledigt' ? erledigte : meldungen).filter((m) => !themaWahl || m.thema === themaWahl);
  const gewaehlt = meldungen.find((m) => m.id === wahl) ?? liste[0] ?? null;
  const themen = [...new Set(meldungen.map((m) => m.thema))];
  const oeffnen = (id: string) => { setWahl(id); if (window.innerWidth < 1024) setTimeout(() => document.getElementById('kontakt-lesen')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); };

  const lesen = (m: Meldung) => (
    <motion.article key={m.id} id={`meldung-${m.id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="flex flex-1 flex-col">
      <header className="border-b border-white/[0.06] px-6 pb-4 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${FARBE[m.thema] ?? FARBE.anderes}`}>{THEMA[m.thema] ?? m.thema}</span>
          {m.erledigt && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">done</span>}
          <span className="ml-auto text-xs text-white/40">{wann(m.zeit)} · {her(m.zeit)}</span>
        </div>
        <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-white">{m.eigenesThema || `${(THEMA[m.thema] ?? m.thema).replace(/^./, (c) => c.toUpperCase())} from ${m.vonName || 'a guest'}`}</h2>
        <p className="mt-1 text-sm text-white/50">from <span className="font-semibold text-white/85">{m.vonName || '—'}</span>{m.vonEmail && <> · <a href={`mailto:${m.vonEmail}`} className="text-akz hover:brightness-125">{m.vonEmail}</a></>}</p>
      </header>
      <div className="flex-1 space-y-4 px-6 py-5">
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-white/85">{m.text}</p>
        {m.bilder.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {m.bilder.map((b) => <button key={b} type="button" onClick={() => setGross(b)} className="overflow-hidden rounded-xl border border-white/10 transition hover:border-akz"><img src={bildUrl(b)} alt="" className="aspect-video w-full object-cover transition duration-500 hover:scale-105" /></button>)}
          </div>
        )}
        <label className="block">
          <span className="ueber !text-white/40">Note for yourself</span>
          <input key={m.id} defaultValue={m.notiz} onBlur={(e) => { if (e.target.value !== m.notiz) void patch({ id: m.id, notiz: e.target.value }); }} placeholder="Only you see this" className={`${feld} mt-1.5 w-full`} />
        </label>
      </div>
      <footer className="border-t border-white/[0.06] bg-black/20 px-6 py-4">
        {m.vonEmail && !m.erledigt && (
          <div className="mb-3">
            <textarea value={antworten[m.id] ?? ''} rows={4} onChange={(e) => setAntworten((a) => ({ ...a, [m.id]: e.target.value }))} placeholder={`Reply to ${m.vonName || 'the sender'} – sent by email, in English. Sending marks the message as done.`} className={`${feld} w-full`} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {m.vonEmail && !m.erledigt && <button type="button" onClick={() => void antwortSenden(m.id)} disabled={sendet === m.id || (antworten[m.id] ?? '').trim().length < 2} className={knopfHaupt}>{sendet === m.id ? 'Sending …' : 'Send reply'}</button>}
          <button type="button" onClick={() => void setzeErledigt(m.id, !m.erledigt)} className={m.erledigt ? knopfLeise : `${knopfLeise} !border-emerald-400/40 !text-emerald-300`}>{m.erledigt ? 'Reopen' : 'Mark as done'}</button>
          <button type="button" onClick={() => void entfernen(m.id)} className={`${knopfLeise} hover:!border-red-400 hover:!text-red-300`}>Delete</button>
          {antwortStand[m.id] && <span className="text-xs text-white/55">{antwortStand[m.id]}</span>}
        </div>
      </footer>
    </motion.article>
  );

  return (
    <>
      {kopf}
      {meldungen.length === 0 ? <Leer text="No messages yet." /> : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
          <Flaeche fest className="overflow-hidden lg:sticky lg:top-32">
            <div className="space-y-3 border-b border-white/[0.06] p-4">
              <Segment id="kontakt-ansicht" klein wert={ansicht} onWahl={setAnsicht} wahl={[{ k: 'offen', titel: `Open ${offene.length}` }, { k: 'erledigt', titel: `Done ${erledigte.length}` }, { k: 'alle', titel: `All ${meldungen.length}` }]} />
              {themen.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setThemaWahl('')} className={`chip !py-1 ${!themaWahl ? 'chip-an' : ''}`}>Every topic</button>
                  {themen.map((t) => <button key={t} type="button" onClick={() => setThemaWahl(themaWahl === t ? '' : t)} className={`chip !py-1 ${themaWahl === t ? 'chip-an' : ''}`}>{THEMA[t] ?? t}</button>)}
                </div>
              )}
            </div>
            <ul className="max-h-[calc(100vh-300px)] divide-y divide-white/[0.05] overflow-y-auto">
              {liste.map((m, i) => (
                <motion.li key={m.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 15) * 0.02 }}>
                  <button type="button" onClick={() => oeffnen(m.id)} className={`relative block w-full px-4 py-3 text-left transition ${gewaehlt?.id === m.id ? 'bg-akz/10' : 'hover:bg-white/[0.03]'}`}>
                    {gewaehlt?.id === m.id && <motion.span layoutId="kontakt-wahl" className="absolute inset-y-0 left-0 w-1 bg-akz" />}
                    <span className="flex items-center gap-2 text-xs">
                      {!m.erledigt && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-akz" />}
                      <span className={`truncate font-bold ${m.erledigt ? 'text-white/55' : 'text-white'}`}>{m.vonName || 'Guest'}</span>
                      <span className={`rounded border px-1.5 text-[9px] font-bold uppercase tracking-wider ${FARBE[m.thema] ?? FARBE.anderes}`}>{THEMA[m.thema] ?? m.thema}</span>
                      {m.bilder.length > 0 && <span className="text-[10px] text-white/40">{m.bilder.length} img</span>}
                      <span className="ml-auto shrink-0 text-white/35">{her(m.zeit)}</span>
                    </span>
                    <span className={`mt-1 line-clamp-2 block text-[13px] leading-snug ${m.erledigt ? 'text-white/40' : 'text-white/65'}`}>{m.eigenesThema ? <b className="text-white/85">{m.eigenesThema} · </b> : null}{m.text}</span>
                    {m.notiz && <span className="mt-1 block truncate text-[11px] italic text-white/35">Note: {m.notiz}</span>}
                  </button>
                </motion.li>
              ))}
              {!liste.length && <li className="px-4 py-8 text-center text-sm text-white/45">{ansicht === 'offen' ? 'Nothing open.' : 'No message here.'}</li>}
            </ul>
          </Flaeche>
          <Flaeche fest verz={0.05} className="flex min-h-[60vh] scroll-mt-32 flex-col overflow-hidden">
            <div id="kontakt-lesen" className="flex flex-1 flex-col">{gewaehlt ? lesen(gewaehlt) : <p className="p-8 text-sm text-white/45">Choose a message on the left.</p>}</div>
          </Flaeche>
        </div>
      )}
      <AnimatePresence>
        {gross && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setGross(null)} className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-6 backdrop-blur-sm">
            <img src={bildUrl(gross)} alt="" className="max-h-full max-w-full rounded-2xl" />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
