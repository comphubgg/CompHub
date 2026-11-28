import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Flaeche, Leer } from '../../ds/Bausteine';
import { Laedt, NurAdmins, WerkzeugKopf, feld, knopfGefahr, knopfHaupt, knopfLeise } from './teile';

/*
 * VIPs auf der Startseite (app/admin/vips auf main, /api/vips). Design-System 3.0 (28.11.2026): links die Reihe der Startseite als gleich grosse
 * Hochkant-Karten in ihrer Reihenfolge (verschieben, sichtbar/ausgeblendet), rechts die gewaehlte Karte zum Bearbeiten, Hinzufuegen und Partner ohne
 * Zugang. Keine Buchstaben statt Bild. Vorher: oben die Ausgewaehlten in ihrer Reihenfolge (Bild, Name, Twitch/X/TikTok, hoch/runter,
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
  const [wahl, setWahl] = useState<string | null>(null);

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

  const sel = vips.find((v) => v.id === wahl) ?? vips[0] ?? null;
  const pfeil = (d: string) => <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;

  return (
    <>
      {kopf}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Flaeche fest className="overflow-hidden">
          <div className="flex flex-wrap items-baseline gap-x-3 border-b border-white/[0.06] px-5 py-3.5">
            <h2 className="titel text-3xl">On the homepage</h2>
            <span className="text-xs text-white/40">in this order · click a card to edit it · the image is the card photo</span>
          </div>
          {!vips.length ? (
            <div className="p-5"><Leer text="Nobody selected yet — the section then does not appear on the homepage at all." /></div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {vips.map((v, i) => {
                const an = sel?.id === v.id;
                return (
                  <motion.li key={v.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 20) * 0.03 }}
                    className={`group relative overflow-hidden rounded-2xl border bg-black/30 transition ${an ? 'border-akz/70 shadow-[0_0_0_1px_rgb(var(--akz)/0.5)]' : 'border-white/[0.07] hover:border-white/20'} ${v.aktiv ? '' : 'opacity-50'}`}>
                    <button type="button" onClick={() => setWahl(v.id)} className="block w-full text-left">
                      <div className="relative aspect-[3/4] overflow-hidden">
                        {v.bild ? <img src={v.bild} alt="" style={{ objectPosition: 'center 25%' }} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                          : <div className="grid h-full place-items-center border-b border-dashed border-white/10 text-[11px] font-semibold uppercase tracking-wider text-white/30">No image</div>}
                        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 to-transparent" />
                        <span className="zahl absolute left-2 top-2 rounded-md bg-black/70 px-1.5 text-[11px] font-bold text-white/80">{i + 1}</span>
                        {!v.aktiv && <span className="absolute right-2 top-2 rounded-md bg-black/70 px-1.5 text-[10px] font-bold uppercase text-white/70">hidden</span>}
                        <div className="absolute inset-x-3 bottom-2.5">
                          <p className="truncate font-bold text-white">{v.name}</p>
                          <p className="truncate text-[11px] text-white/55">{NETZE.filter((n) => v[n.schluessel]).map((n) => `${n.platzhalter.split(' ')[0]} ${v[n.schluessel]}`).join(' · ') || 'no account linked'}</p>
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 border-t border-white/[0.06] px-2 py-1.5">
                      <button type="button" disabled={i === 0} title="Move forward" onClick={() => senden({ id: v.id, richtung: 'hoch' }, 'moved')} className="grid h-7 w-7 place-items-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-akz disabled:opacity-20">{pfeil('M12 5l-5 5 5 5')}</button>
                      <button type="button" disabled={i === vips.length - 1} title="Move back" onClick={() => senden({ id: v.id, richtung: 'runter' }, 'moved')} className="grid h-7 w-7 place-items-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-akz disabled:opacity-20">{pfeil('M8 5l5 5-5 5')}</button>
                      <button type="button" onClick={() => senden({ id: v.id, aktiv: !v.aktiv }, v.aktiv ? 'hidden' : 'on the homepage')}
                        className={`ml-auto rounded-lg px-2 py-1 text-[11px] font-bold transition ${v.aktiv ? 'text-emerald-300 hover:bg-emerald-400/10' : 'text-white/50 hover:bg-white/10 hover:text-akz'}`}>{v.aktiv ? 'Visible' : 'Hidden'}</button>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          )}
          <input ref={dateiFeld} type="file" accept="image/*" className="hidden" onChange={(e) => { const d = e.target.files?.[0]; e.target.value = ''; if (d) void bildHochladen(d); }} />
        </Flaeche>

        <div className="space-y-5 xl:sticky xl:top-32">
          {sel && (
            <Flaeche fest key={sel.id} className="p-5">
              <p className="ueber">Edit card</p>
              <div className="mt-3 flex gap-4">
                <button type="button" onClick={() => { setBildFuer(sel.id); dateiFeld.current?.click(); }} title="Choose or replace image"
                  className="group relative h-28 w-20 shrink-0 overflow-hidden rounded-xl border border-dashed border-white/15 bg-black/30">
                  {sel.bild && <img src={sel.bild} alt="" style={{ objectPosition: 'center 25%' }} className="h-full w-full object-cover" />}
                  <span className={`absolute inset-0 place-items-center bg-black/60 text-[10px] font-bold uppercase tracking-wider text-akz ${sel.bild ? 'hidden group-hover:grid' : 'grid'}`}>{sel.bild ? 'Replace' : 'Upload image'}</span>
                </button>
                <div className="min-w-0 flex-1 space-y-2">
                  <input defaultValue={sel.name} placeholder="Display name" className={`${feld} w-full font-semibold`}
                    onBlur={(e) => { if (e.target.value.trim() !== sel.name) void senden({ id: sel.id, name: e.target.value }); }} />
                  {NETZE.map((n) => (
                    <div key={n.schluessel} className="flex items-center gap-2">
                      <input defaultValue={sel[n.schluessel] ?? ''} placeholder={n.platzhalter} title="Leave empty if it should not be on the card" className={`${feld} min-w-0 flex-1 !py-1.5 text-[13px]`}
                        onBlur={(e) => { if (e.target.value.trim() !== (sel[n.schluessel] ?? '')) void senden({ id: sel.id, [n.schluessel]: e.target.value }); }} />
                      {sel[n.schluessel] && <a href={`${n.adresse}${sel[n.schluessel]}`} target="_blank" rel="noreferrer" title="Open channel" className="text-sm text-white/40 transition hover:text-akz">↗</a>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => senden({ id: sel.id, aktiv: !sel.aktiv }, sel.aktiv ? 'hidden' : 'on the homepage')} className={knopfLeise}>{sel.aktiv ? 'Hide from the homepage' : 'Show on the homepage'}</button>
                <button type="button" onClick={() => entfernen(sel)} className={knopfGefahr}>Remove</button>
              </div>
            </Flaeche>
          )}

          <Flaeche fest verz={0.05} className="p-5">
            <p className="ueber">Add a VIP access</p>
            <p className="mt-1 text-xs text-white/45">One click puts someone on the homepage. Add image and accounts afterwards.</p>
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search names …" className={`${feld} my-3 w-full`} />
            <div className="flex max-h-[260px] flex-wrap gap-2 overflow-y-auto pr-1">
              {gefiltert.map((k) => (
                <button key={`${k.art}-${k.konto}`} type="button" onClick={() => senden({ name: k.name, konto: k.konto }, 'put on the homepage')} className="chip hover:!border-akz/60 hover:!text-akz">
                  + {k.name}<span className="text-[9px] uppercase tracking-wider text-white/35">{k.art === 'schluessel' ? 'Key' : 'Account'}</span>
                </button>
              ))}
              {!gefiltert.length && <p className="text-xs text-white/40">Nobody left — every VIP access is already on the homepage list.</p>}
            </div>
          </Flaeche>

          <Flaeche fest verz={0.1} className="p-5">
            <p className="ueber">Someone without access</p>
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
              <button type="submit" className={knopfHaupt}>Add</button>
            </form>
          </Flaeche>
        </div>
      </div>
    </>
  );
}
