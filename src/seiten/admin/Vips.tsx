import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Glas } from '../../teile/Glas';
import { Laedt, NurAdmins, WerkzeugKopf, feld, knopfHaupt } from './teile';

/*
 * VIPs auf der Startseite (app/admin/vips auf main, /api/vips): oben die Ausgewaehlten in ihrer Reihenfolge (Bild, Name, Twitch/X/TikTok, hoch/runter,
 * sichtbar/ausgeblendet, entfernen), darunter alle VIP-Zugaenge als Vorschlag und ein Formular fuer Partner ohne Zugang. Wer hier fehlt, bleibt VIP.
 */
interface Vip { id: string; konto?: string; name: string; twitch?: string; x?: string; tiktok?: string; bild?: string; aktiv: boolean; reihenfolge: number }
interface Kandidat { konto: string; name: string; art: 'schluessel' | 'konto' }
const NETZE = [
  { schluessel: 'twitch' as const, platzhalter: 'Twitch account', adresse: 'https://twitch.tv/' },
  { schluessel: 'x' as const, platzhalter: 'X account', adresse: 'https://x.com/' },
  { schluessel: 'tiktok' as const, platzhalter: 'TikTok account', adresse: 'https://tiktok.com/@' },
];

export default function Vips({ klassisch }: { klassisch: () => void }) {
  const [vips, setVips] = useState<Vip[]>([]);
  const [kandidaten, setKandidaten] = useState<Kandidat[]>([]);
  const [erlaubt, setErlaubt] = useState(true);
  const [laedt, setLaedt] = useState(true);
  const [stand, setStand] = useState('');
  const [suche, setSuche] = useState('');
  const dateiFeld = useRef<HTMLInputElement | null>(null);
  const [bildFuer, setBildFuer] = useState<string | null>(null);

  const holen = useCallback(async () => {
    try {
      const r = await fetch('/api/vips?alle=1', { cache: 'no-store' });
      if (r.status === 401 || r.status === 403) { setErlaubt(false); return; }
      const j = await r.json();
      setVips(Array.isArray(j?.vips) ? j.vips : []); setKandidaten(Array.isArray(j?.kandidaten) ? j.kandidaten : []);
    } catch { setErlaubt(false); } finally { setLaedt(false); }
  }, []);
  useEffect(() => { void holen(); }, [holen]);
  const melden = (t: string, d = 2500) => { setStand(t); if (d) window.setTimeout(() => setStand(''), d); };

  async function senden(k: Record<string, unknown>, sagen = 'saved') {
    setStand('saving …');
    try {
      const r = await fetch('/api/vips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(k) });
      const j = await r.json().catch(() => null);
      if (!r.ok) { melden(j?.fehler ?? 'not saved', 5000); return false; }
      await holen(); melden(sagen); return true;
    } catch (e) { melden((e as Error).message, 5000); return false; }
  }
  async function entfernen(v: Vip) {
    if (!window.confirm(`Take ${v.name} off the homepage? The VIP access itself stays untouched.`)) return;
    setStand('saving …');
    try {
      const r = await fetch(`/api/vips?id=${encodeURIComponent(v.id)}`, { method: 'DELETE' });
      const j = await r.json().catch(() => null);
      if (!r.ok) { melden(j?.fehler ?? 'not saved', 5000); return; }
      await holen(); melden('taken off the homepage');
    } catch (e) { melden((e as Error).message, 5000); }
  }
  async function bildHochladen(datei: File) {
    if (!bildFuer) return;
    setStand('uploading …');
    try {
      const d = new FormData(); d.append('id', bildFuer); d.append('bild', datei);
      const r = await fetch('/api/vips', { method: 'POST', body: d });
      const j = await r.json().catch(() => null);
      if (!r.ok) { melden(j?.fehler ?? 'not saved', 5000); return; }
      await holen(); melden('image set');
    } catch (e) { melden((e as Error).message, 5000); } finally { setBildFuer(null); }
  }

  const sichtbar = vips.filter((v) => v.aktiv).length;
  const kopf = <WerkzeugKopf ueber="Players & Teams" titel="VIPs" text="Who appears at the bottom of the homepage — with image, name and Twitch, X or TikTok. Separate from the VIP right itself." klassisch={klassisch}
    rechts={<>
      {stand && <span className={`text-xs ${/not|error|fehl/i.test(stand) ? 'text-rose-300' : 'text-emerald-300'}`}>{stand}</span>}
      <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white/70">{sichtbar} on the homepage</span>
    </>} />;
  if (laedt) return <>{kopf}<Laedt /></>;
  if (!erlaubt) return <>{kopf}<NurAdmins /></>;
  const gefiltert = kandidaten.filter((k) => !suche.trim() || k.name.toLowerCase().includes(suche.trim().toLowerCase()));

  return (
    <>
      {kopf}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">On the homepage</h2>
          {!vips.length ? (
            <Glas className="border-dashed px-4 py-10 text-center text-sm text-white/45">Nobody selected yet — the section then does not appear on the homepage at all.</Glas>
          ) : (
            <ul className="space-y-2.5">
              {vips.map((v, i) => {
                const erstes = NETZE.find((n) => v[n.schluessel]);
                return (
                  <motion.li key={v.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: v.aktiv ? 1 : 0.5, y: 0 }} transition={{ delay: Math.min(i, 20) * 0.03 }}
                    className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur-xl">
                    <button type="button" onClick={() => { setBildFuer(v.id); dateiFeld.current?.click(); }} title="Choose or replace image"
                      className="group relative h-16 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/30">
                      {v.bild ? <img src={v.bild} alt="" style={{ objectPosition: 'center 25%' }} className="h-full w-full object-cover" />
                        : <span className="grid h-full place-items-center text-xl font-bold text-white/25">{v.name.trim().charAt(0).toUpperCase()}</span>}
                      <span className="absolute inset-0 hidden place-items-center bg-black/60 text-[9px] font-bold uppercase tracking-wider text-sky-300 group-hover:grid">Image</span>
                    </button>
                    <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
                      <input defaultValue={v.name} placeholder="Display name" className={`${feld} py-1.5 font-semibold`}
                        onBlur={(e) => { if (e.target.value.trim() !== v.name) void senden({ id: v.id, name: e.target.value }); }} />
                      <div className="flex flex-wrap gap-1.5">
                        {NETZE.map((n) => (
                          <input key={n.schluessel} defaultValue={v[n.schluessel] ?? ''} placeholder={n.platzhalter} title="Leave empty if it should not be on the card"
                            className={`${feld} min-w-[110px] flex-1 py-1 text-[13px]`}
                            onBlur={(e) => { if (e.target.value.trim() !== (v[n.schluessel] ?? '')) void senden({ id: v.id, [n.schluessel]: e.target.value }); }} />
                        ))}
                      </div>
                    </div>
                    <span className="flex shrink-0 flex-col">
                      <button type="button" disabled={i === 0} title="Move forward" onClick={() => senden({ id: v.id, richtung: 'hoch' }, 'moved')} className="px-2 text-white/45 transition hover:text-sky-300 disabled:opacity-20">▲</button>
                      <button type="button" disabled={i === vips.length - 1} title="Move back" onClick={() => senden({ id: v.id, richtung: 'runter' }, 'moved')} className="px-2 text-white/45 transition hover:text-sky-300 disabled:opacity-20">▼</button>
                    </span>
                    <button type="button" onClick={() => senden({ id: v.id, aktiv: !v.aktiv }, v.aktiv ? 'hidden' : 'on the homepage')}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${v.aktiv ? 'border-emerald-400/40 text-emerald-300 hover:border-emerald-300' : 'border-white/15 text-white/50 hover:border-sky-400 hover:text-sky-300'}`}>
                      {v.aktiv ? 'visible' : 'hidden'}
                    </button>
                    {erstes && <a href={`${erstes.adresse}${v[erstes.schluessel]}`} target="_blank" rel="noreferrer" title="Open channel" className="shrink-0 text-sm text-white/40 transition hover:text-sky-300">↗</a>}
                    <button type="button" onClick={() => entfernen(v)} className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/45 transition hover:border-rose-400 hover:text-rose-300">remove</button>
                  </motion.li>
                );
              })}
            </ul>
          )}
          <input ref={dateiFeld} type="file" accept="image/*" className="hidden" onChange={(e) => { const d = e.target.files?.[0]; e.target.value = ''; if (d) void bildHochladen(d); }} />
        </section>

        <div className="space-y-6">
          <Glas className="p-5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">All VIP accesses</h2>
            <p className="mt-1 text-xs text-white/45">One click puts someone on the homepage. Add image and accounts on the left afterwards.</p>
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search names …" className={`${feld} my-3 w-full`} />
            <div className="flex max-h-[420px] flex-wrap gap-2 overflow-y-auto pr-1">
              {gefiltert.map((k) => (
                <button key={`${k.art}-${k.konto}`} type="button" onClick={() => senden({ name: k.name, konto: k.konto }, 'put on the homepage')}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/80 transition hover:-translate-y-0.5 hover:border-sky-400/60 hover:text-sky-200">
                  {k.name}<span className="ml-2 text-[9px] uppercase tracking-wider text-white/35">{k.art === 'schluessel' ? 'Key' : 'Account'}</span>
                </button>
              ))}
              {!gefiltert.length && <p className="text-xs text-white/40">Nobody left — every VIP access is already on the left.</p>}
            </div>
          </Glas>
          <Glas className="p-5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Someone without access</h2>
            <p className="mt-1 text-xs text-white/45">A partner needs no account in the tool to be on the homepage.</p>
            <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget); const name = String(f.get('name') ?? '').trim();
              if (!name) return;
              const form = e.currentTarget;
              if (await senden({ name, twitch: String(f.get('twitch') ?? ''), x: String(f.get('x') ?? ''), tiktok: String(f.get('tiktok') ?? '') }, 'put on the homepage')) form.reset();
            }}>
              <input name="name" placeholder="Name" className={`${feld} sm:col-span-2`} />
              {NETZE.map((n) => <input key={n.schluessel} name={n.schluessel} placeholder={n.platzhalter} className={feld} />)}
              <button type="submit" className={`${knopfHaupt} py-2`}>Add</button>
            </form>
          </Glas>
        </div>
      </div>
    </>
  );
}
