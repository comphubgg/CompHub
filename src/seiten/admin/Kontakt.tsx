import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Glas } from '../../teile/Glas';
import { Laedt, NurAdmins, WerkzeugKopf, feld, knopfHaupt, knopfLeise, wann } from './teile';

/*
 * Kontakt-Posteingang (app/admin/contact auf main, /api/kontakt): offene Meldungen zuerst, erledigte eingeklappt darunter. Je Meldung Thema, Text,
 * Bilder (gross ansehen), Absender mit Adresse, eine Notiz fuer dich, Antwort per Mail (PATCH { id, antwort } - danach erledigt), erledigt / wieder
 * oeffnen (PATCH { id, erledigt }) und loeschen (DELETE { id }). ?gespraech=<id> springt zur Meldung (Links aus Discord und Mail).
 */
interface Meldung { id: string; zeit: number; thema: string; eigenesThema: string; text: string; bilder: string[]; vonId: string; vonName: string; vonEmail: string; erledigt: boolean; notiz: string }
const FARBE: Record<string, string> = {
  support: 'border-sky-400/40 bg-sky-400/10 text-sky-300', report: 'border-rose-400/40 bg-rose-400/10 text-rose-300',
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
  const [zeigeErledigte, setZeigeErledigte] = useState(false);
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
  useEffect(() => { if (ziel && meldungen.some((m) => m.id === ziel)) document.getElementById(`meldung-${ziel}`)?.scrollIntoView({ block: 'center' }); }, [ziel, meldungen]);

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
  const kopf = <WerkzeugKopf ueber="Inbox" titel="Contact" text={erlaubt ? (offene.length ? `${offene.length} open` : 'Nothing open.') : 'Messages from the contact form.'} klassisch={klassisch} />;
  if (erlaubt === false) return <>{kopf}<NurAdmins /></>;
  if (erlaubt === null) return <>{kopf}<Laedt /></>;

  const karte = (m: Meldung, i: number) => (
    <motion.article key={m.id} id={`meldung-${m.id}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: m.erledigt ? 0.6 : 1, y: 0 }} transition={{ delay: Math.min(i, 20) * 0.03 }}
      className={`rounded-2xl border bg-white/[0.03] p-5 backdrop-blur-xl ${m.id === ziel ? 'border-sky-400 ring-1 ring-sky-400/40' : 'border-white/10'}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${FARBE[m.thema] ?? FARBE.anderes}`}>{THEMA[m.thema] ?? m.thema}</span>
        {m.eigenesThema && <span className="text-sm font-semibold text-white">{m.eigenesThema}</span>}
        <span className="ml-auto text-[11px] text-white/40">{wann(m.zeit)}</span>
      </div>
      <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-white/80">{m.text}</p>
      {m.bilder.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {m.bilder.map((b) => <button key={b} type="button" onClick={() => setGross(b)} className="overflow-hidden rounded-xl border border-white/10 transition hover:border-sky-400"><img src={bildUrl(b)} alt="" className="aspect-video w-full object-cover" /></button>)}
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/45">
        <span>from <span className="text-white/80">{m.vonName || '—'}</span></span>
        {m.vonEmail && <a href={`mailto:${m.vonEmail}`} className="text-sky-300 hover:text-sky-200">{m.vonEmail}</a>}
      </div>
      <input defaultValue={m.notiz} onBlur={(e) => { if (e.target.value !== m.notiz) void patch({ id: m.id, notiz: e.target.value }); }} placeholder="Note for yourself" className={`${feld} mb-3 w-full py-1.5 text-xs`} />
      {m.vonEmail && !m.erledigt && (
        <div className="mb-3">
          <textarea value={antworten[m.id] ?? ''} rows={3} onChange={(e) => setAntworten((a) => ({ ...a, [m.id]: e.target.value }))} placeholder="Reply to the sender (sent by email, in English)" className={`${feld} w-full`} />
          <div className="mt-1.5 flex items-center gap-3">
            <button type="button" onClick={() => void antwortSenden(m.id)} disabled={sendet === m.id || (antworten[m.id] ?? '').trim().length < 2} className={knopfHaupt}>{sendet === m.id ? 'sending …' : 'Send reply'}</button>
            {antwortStand[m.id] && <span className="text-xs text-white/55">{antwortStand[m.id]}</span>}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void setzeErledigt(m.id, !m.erledigt)} className={m.erledigt ? knopfLeise : `${knopfLeise} !border-emerald-400/40 !text-emerald-300`}>{m.erledigt ? 'reopen' : 'done'}</button>
        <button type="button" onClick={() => void entfernen(m.id)} className={`${knopfLeise} hover:!border-rose-400 hover:!text-rose-300`}>delete</button>
      </div>
    </motion.article>
  );

  return (
    <>
      {kopf}
      {meldungen.length === 0 ? <Glas className="p-8 text-center text-sm text-white/50">No messages yet.</Glas> : (
        <>
          {offene.length > 0 && <div className="grid gap-3 2xl:grid-cols-2">{offene.map(karte)}</div>}
          {erledigte.length > 0 && (
            <div className="mt-8">
              <button type="button" onClick={() => setZeigeErledigte((v) => !v)} className="mb-3 text-xs text-white/50 transition hover:text-sky-300">{zeigeErledigte ? '▾ ' : '▸ '}{erledigte.length} done</button>
              {zeigeErledigte && <div className="grid gap-3 2xl:grid-cols-2">{erledigte.map(karte)}</div>}
            </div>
          )}
        </>
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
