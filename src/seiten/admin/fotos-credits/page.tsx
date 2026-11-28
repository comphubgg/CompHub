import { useCallback, useEffect, useMemo, useState } from 'react';
import T from '../port/app/components/T';
import { NurAdmins } from '../teile';
import SeitenKopf from '../port/app/components/SeitenKopf';
import { useZugang } from '../port/app/lib/zugang';

/*
 * Spielerfotos & Fotografen (Betreiber, 16./17.11.2026): die alten, uebernommenen Fotos sind entfernt, neue laedt der Betreiber hier hoch - je Spieler, und
 * gleich mit den Angaben, von wem das Foto ist (Quelle, Fotograf, Link, Lizenz). Oeffentlich am Foto steht davon nur "Foto: Quelle / Fotograf", und nur,
 * wenn "bestaetigt" angehakt ist (lib/fotoCredits.ts, app/components/FotoCredit.tsx). "Wahrscheinlich", Lizenz und Notiz bleiben intern.
 * Seit 17.11.2026 (Nachtrag): oeffentlich steht jede benannte Quelle in der Liste "Photos from" (lib/fotoQuellen.ts); am Foto nur kleine Quellen
 * oder "am Foto" (einzeln). Oben ergaenzt ExtraQuellen die Liste von Hand (foto-quellen-extra.json).
 *
 * Mehrfachauswahl: Haken an den Karten, dann oben Quelle/Fotograf/... fuer alle gewaehlten setzen.
 * Nur fuer den Admin: /api/admin/foto-credits und /api/spielerbild/hochladen pruefen das bei jeder Anfrage.
 */

interface Credit { quelle?: string; fotograf?: string; handle?: string; link?: string; lizenz?: string; bestaetigt: boolean; einzeln?: boolean; wahrscheinlich?: string; notiz?: string; geaendert?: number }
interface Quelle { name: string; handle?: string; link?: string; fotos: number }
interface ExtraEintrag { name: string; handle?: string; link?: string }
type Art = 'organisationen' | 'fotografen';
interface Zeile { epicId: string; name: string; datei: string; foto: boolean; bild: string | null; events: number; credit: Credit | null }
type Filter = 'alle' | 'ohneFoto' | 'unbekannt' | 'wahrscheinlich' | 'offen' | 'bestaetigt';
type Entwurf = { quelle: string; fotograf: string; handle: string; link: string; lizenz: string; wahrscheinlich: string; notiz: string; bestaetigt: boolean; einzeln: boolean };
const LEER: Entwurf = { quelle: '', fotograf: '', handle: '', link: '', lizenz: '', wahrscheinlich: '', notiz: '', bestaetigt: false, einzeln: false };
const JE_SEITE = 60;

const ausCredit = (c: Credit | null): Entwurf => ({
  quelle: c?.quelle ?? '', fotograf: c?.fotograf ?? '', handle: c?.handle ?? '', link: c?.link ?? '', lizenz: c?.lizenz ?? '',
  wahrscheinlich: c?.wahrscheinlich ?? '', notiz: c?.notiz ?? '', bestaetigt: Boolean(c?.bestaetigt), einzeln: Boolean(c?.einzeln),
});
const schluessel = (z: Zeile) => z.epicId || z.datei;

function zustandVon(z: Zeile): Exclude<Filter, 'alle'> {
  if (!z.foto) return 'ohneFoto';
  const c = z.credit;
  if (c?.bestaetigt) return 'bestaetigt';
  if (c?.quelle || c?.fotograf) return 'offen';
  if (c?.wahrscheinlich) return 'wahrscheinlich';
  return 'unbekannt';
}

export default function FotosCreditsSeite() {
  const zugang = useZugang();
  const [zeilen, setZeilen] = useState<Zeile[] | null>(null);
  const [fehler, setFehler] = useState('');
  const [filter, setFilter] = useState<Filter>('alle');
  const [suche, setSuche] = useState('');
  const [seite, setSeite] = useState(0);
  const [entwurf, setEntwurf] = useState<Record<string, Entwurf>>({});
  const [status, setStatus] = useState<Record<string, string>>({});
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [sammel, setSammel] = useState({ quelle: '', fotograf: '', handle: '', link: '', lizenz: '', wahrscheinlich: '', bestaetigt: '' as '' | 'ja' | 'nein' });
  const [sammelStatus, setSammelStatus] = useState('');
  const [neu, setNeu] = useState({ epicId: '', name: '' });

  const laden = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/foto-credits', { cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) { setFehler(j.error ?? 'Loading failed'); return; }
      setZeilen(j.zeilen);
      setFehler('');
    } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => {
    if (!zugang.admin) return;
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [zugang.admin, laden]);

  const zahlen = useMemo(() => {
    const z: Record<Filter, number> = { alle: 0, ohneFoto: 0, unbekannt: 0, wahrscheinlich: 0, offen: 0, bestaetigt: 0 };
    for (const x of zeilen ?? []) { z.alle += 1; z[zustandVon(x)] += 1; }
    return z;
  }, [zeilen]);

  const liste = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return (zeilen ?? [])
      .filter((z) => filter === 'alle' || zustandVon(z) === filter)
      .filter((z) => !q || [z.name, z.epicId, z.datei, z.credit?.fotograf ?? '', z.credit?.quelle ?? ''].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => Number(b.foto) - Number(a.foto) || b.events - a.events || a.name.localeCompare(b.name));
  }, [zeilen, filter, suche]);
  const seiten = Math.max(1, Math.ceil(liste.length / JE_SEITE));
  const aufSeite = liste.slice(seite * JE_SEITE, (seite + 1) * JE_SEITE);

  const ent = (z: Zeile) => entwurf[schluessel(z)] ?? ausCredit(z.credit);
  const setzeEnt = (z: Zeile, teil: Partial<Entwurf>) => setEntwurf((s) => ({ ...s, [schluessel(z)]: { ...ent(z), ...teil } }));
  const zeigeStatus = (k: string, t: string) => setStatus((s) => ({ ...s, [k]: t }));

  /** Neue Credits in die Zeilen uebernehmen (nach Speichern). */
  const uebernehmen = (credits: Record<string, Credit | null>) => {
    setZeilen((alt) => alt?.map((z) => (z.datei in credits ? { ...z, credit: credits[z.datei] } : z)) ?? alt);
    setEntwurf((s) => {
      const n = { ...s };
      for (const z of zeilen ?? []) if (z.datei in credits) delete n[schluessel(z)];
      return n;
    });
  };

  const speichern = async (z: Zeile) => {
    const k = schluessel(z);
    const e = ent(z);
    zeigeStatus(k, 'saving …');
    const r = await fetch('/api/admin/foto-credits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dateien: [z.datei], felder: e }) })
      .then((x) => x.json()).catch((x) => ({ ok: false, error: (x as Error).message }));
    if (!r.ok) { zeigeStatus(k, `Error: ${r.error}`); return; }
    uebernehmen(r.credits);
    zeigeStatus(k, 'gespeichert');
  };

  const hochladen = async (z: Zeile | null, datei: File) => {
    const epicId = z?.epicId ?? neu.epicId.trim().toLowerCase().replace(/-/g, '');
    const name = z?.name ?? neu.name.trim();
    const k = z ? schluessel(z) : '__neu';
    if (!/^[0-9a-f]{32}$/.test(epicId)) { zeigeStatus(k, 'Error: Epic account ID (32 characters) missing'); return; }
    const e = z ? ent(z) : LEER;
    const form = new FormData();
    form.set('datei', datei); form.set('epicId', epicId); form.set('name', name);
    for (const f of ['quelle', 'fotograf', 'handle', 'link', 'lizenz', 'wahrscheinlich', 'notiz'] as const) if (e[f]) form.set(f, e[f]);
    form.set('bestaetigt', e.bestaetigt ? '1' : '0');
    if (e.einzeln) form.set('einzeln', '1');
    zeigeStatus(k, 'uploading …');
    const r = await fetch('/api/spielerbild/hochladen', { method: 'POST', body: form }).then((x) => x.json()).catch((x) => ({ fehler: (x as Error).message }));
    if (!r.ok) { zeigeStatus(k, `Error: ${r.fehler ?? 'Upload failed'}`); return; }
    zeigeStatus(k, r.creditFehler ? r.creditFehler : 'uploaded');
    if (!z) setNeu({ epicId: '', name: '' });
    if (z) setEntwurf((s) => { const n = { ...s }; delete n[k]; return n; });
    await laden();
  };

  const sammelAnwenden = async () => {
    const dateien = (zeilen ?? []).filter((z) => gewaehlt.has(schluessel(z)) && z.foto).map((z) => z.datei);
    if (!dateien.length) { setSammelStatus('No photos selected (players without a photo do not count).'); return; }
    const felder: Record<string, unknown> = {};
    for (const f of ['quelle', 'fotograf', 'handle', 'link', 'lizenz', 'wahrscheinlich'] as const) if (sammel[f].trim()) felder[f] = sammel[f].trim();
    if (sammel.bestaetigt) felder.bestaetigt = sammel.bestaetigt === 'ja';
    if (!Object.keys(felder).length) { setSammelStatus('Nothing entered.'); return; }
    setSammelStatus('saving …');
    const r = await fetch('/api/admin/foto-credits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dateien, felder }) })
      .then((x) => x.json()).catch((x) => ({ ok: false, error: (x as Error).message }));
    if (!r.ok) { setSammelStatus(`Error: ${r.error}`); return; }
    uebernehmen(r.credits);
    setSammelStatus(`${dateien.length} photos saved.`);
  };

  if (!zugang.laedt && !zugang.admin) {
    return <NurAdmins />;
  }

  const chip = (an: boolean) => `rounded-full px-3 py-1 text-xs font-bold transition ${an ? 'bg-akz text-[#04050a]' : 'border border-white/10 bg-white/[0.035] backdrop-blur-xl text-white/55 hover:text-white'}`;
  const feld = 'w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-white outline-none focus:border-akz';
  const FILTER: Array<[Filter, string]> = [
    ['alle', 'All'], ['ohneFoto', 'No photo'], ['unbekannt', 'Photographer unknown'], ['wahrscheinlich', 'Probably'],
    ['offen', 'Entered, not confirmed'], ['bestaetigt', 'Confirmed'],
  ];

  return (
    <main className="text-white/85">
      <div className="">
        <SeitenKopf className="mb-5" marke={<T>Spieler & Teams</T>} titel={<T>Player photos & photographers</T>}
          text={<T>Upload new photos per player, right away with source, photographer, X account, link and licence. Publicly, all named sources of public photos are listed under “Photos from” (stats top right, footer). The photo itself only carries a small tag for sources with just one public photo – or when “on photo” is ticked. “Probably”, licence and note stay internal.</T>} />

        <ExtraQuellen />

        {fehler && <p className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{fehler}</p>}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {FILTER.map(([f, titel]) => (
            <button key={f} type="button" className={chip(filter === f)} onClick={() => { setFilter(f); setSeite(0); }}><T>{titel}</T> <span className="opacity-70">{zahlen[f]}</span></button>
          ))}
          <input value={suche} onChange={(e) => { setSuche(e.target.value); setSeite(0); }} placeholder="Player, photographer …" className="ml-auto w-56 fl !rounded-lg px-3 py-1.5 text-sm outline-none focus:border-akz" />
        </div>

        {/* Mehrfachauswahl */}
        <section className="mb-4 fl !rounded-2xl p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-white/55">
            <b className="text-white/85">{gewaehlt.size}</b> <T>selected</T>
            <button type="button" className="rounded-md border border-white/15 px-2 py-0.5 hover:text-white" onClick={() => setGewaehlt(new Set(aufSeite.filter((z) => z.foto).map(schluessel)))}><T>Select this page</T></button>
            <button type="button" className="rounded-md border border-white/15 px-2 py-0.5 hover:text-white" onClick={() => setGewaehlt(new Set(liste.filter((z) => z.foto).map(schluessel)))}><T>Select all filtered</T></button>
            <button type="button" className="rounded-md border border-white/15 px-2 py-0.5 hover:text-white" onClick={() => setGewaehlt(new Set())}><T>Clear selection</T></button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-8">
            <input className={feld} placeholder="Source (e.g. Epic Games)" value={sammel.quelle} onChange={(e) => setSammel({ ...sammel, quelle: e.target.value })} />
            <input className={feld} placeholder="Photographer" value={sammel.fotograf} onChange={(e) => setSammel({ ...sammel, fotograf: e.target.value })} />
            <input className={feld} placeholder="X account (@…)" value={sammel.handle} onChange={(e) => setSammel({ ...sammel, handle: e.target.value })} />
            <input className={feld} placeholder="Link" value={sammel.link} onChange={(e) => setSammel({ ...sammel, link: e.target.value })} />
            <input className={feld} placeholder="Licence (internal)" value={sammel.lizenz} onChange={(e) => setSammel({ ...sammel, lizenz: e.target.value })} />
            <input className={feld} placeholder="Probably (internal)" value={sammel.wahrscheinlich} onChange={(e) => setSammel({ ...sammel, wahrscheinlich: e.target.value })} />
            <select className={feld} value={sammel.bestaetigt} onChange={(e) => setSammel({ ...sammel, bestaetigt: e.target.value as '' | 'ja' | 'nein' })}>
              <option value="">Confirmed: unchanged</option><option value="ja">Confirmed: yes</option><option value="nein">Confirmed: no</option>
            </select>
            <button type="button" onClick={sammelAnwenden} className="rounded-md bg-akz px-3 py-1 text-xs font-bold text-[#04050a] hover:brightness-110"><T>Apply to selection</T></button>
          </div>
          <p className="mt-1 text-[11px] text-white/40">Empty fields stay unchanged. {sammelStatus}</p>
        </section>

        {/* Ein Spieler, der noch nicht in der Liste steht */}
        <section className="mb-4 flex flex-wrap items-center gap-2 fl !rounded-2xl p-3 text-xs">
          <span className="font-semibold text-white/70"><T>Photo for another player</T>:</span>
          <input className={`${feld} w-72`} placeholder="Epic account ID" value={neu.epicId} onChange={(e) => setNeu({ ...neu, epicId: e.target.value })} />
          <input className={`${feld} w-48`} placeholder="Name" value={neu.name} onChange={(e) => setNeu({ ...neu, name: e.target.value })} />
          <label className="cursor-pointer rounded-md border border-akz/50 px-3 py-1 font-semibold text-akz hover:bg-akz/10">
            <T>Choose photo …</T>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) hochladen(null, f); }} />
          </label>
          <span className="text-white/40">{status.__neu} <T>Enter the details in the card afterwards.</T></span>
        </section>

        {!zeilen && !fehler && <p className="text-sm text-white/40"><T>Loading …</T></p>}

        <div className="mb-3 flex items-center justify-between text-xs text-white/55">
          <span>{liste.length} <T>Spieler</T></span>
          <span className="flex items-center gap-2">
            <button type="button" className="rounded-md border border-white/10 px-2 py-1 disabled:opacity-40" disabled={seite === 0} onClick={() => setSeite(seite - 1)}>←</button>
            <span className="tabular-nums">{seite + 1} / {seiten}</span>
            <button type="button" className="rounded-md border border-white/10 px-2 py-1 disabled:opacity-40" disabled={seite + 1 >= seiten} onClick={() => setSeite(seite + 1)}>→</button>
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-ohne-foto-credit>
          {aufSeite.map((z) => {
            const k = schluessel(z);
            const e = ent(z);
            const geaendert = Boolean(entwurf[k]);
            const zst = zustandVon(z);
            const oeffentlich = z.credit && (z.credit.quelle || z.credit.fotograf || z.credit.handle) && !/^unbekannt$/i.test(z.credit.quelle ?? '')
              ? [z.credit.quelle, z.credit.fotograf].filter(Boolean).join(' / ') || `@${z.credit.handle}` : '';
            return (
              <div key={k} className={`flex gap-3 rounded-2xl border bg-white/[0.035] backdrop-blur-xl p-3 ${gewaehlt.has(k) ? 'border-akz' : 'border-white/10'}`}>
                <div className="flex w-24 shrink-0 flex-col gap-1.5">
                  <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-white/[0.07]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {z.bild ? <img src={z.bild} alt="" loading="lazy" className="h-full w-full object-cover" />
                      : <span className="grid h-full place-items-center text-[10px] text-white/40"><T>kein Foto</T></span>}
                    {z.foto && (
                      <input type="checkbox" aria-label="select" checked={gewaehlt.has(k)} className="absolute left-1 top-1 h-4 w-4 accent-akz"
                        onChange={(ev) => setGewaehlt((s) => { const n = new Set(s); if (ev.target.checked) n.add(k); else n.delete(k); return n; })} />
                    )}
                  </div>
                  <label className="cursor-pointer rounded-md border border-akz/50 px-1 py-0.5 text-center text-[11px] font-semibold text-akz hover:bg-akz/10">
                    {z.foto ? <T>Replace …</T> : <T>Upload …</T>}
                    <input type="file" accept="image/*" className="hidden" onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ''; if (f) hochladen(z, f); }} />
                  </label>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <b className="truncate text-sm text-white" title={z.epicId}>{z.name}</b>
                    <span className={`shrink-0 rounded-full px-2 text-[10px] font-bold ${zst === 'bestaetigt' ? 'bg-emerald-500/15 text-emerald-300' : zst === 'offen' ? 'bg-amber-500/15 text-amber-300' : zst === 'wahrscheinlich' ? 'bg-violet-500/15 text-violet-300' : 'bg-white/[0.07] text-white/55'}`}>
                      {{ bestaetigt: 'confirmed', offen: 'not confirmed', wahrscheinlich: 'probably', unbekannt: 'unknown', ohneFoto: 'no photo' }[zst]}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-white/40">{oeffentlich ? <>In “Photos from”: <span className="text-white/70">{oeffentlich}</span></> : 'Public: nothing'}</p>
                  <div className="grid grid-cols-2 gap-1">
                    <input className={feld} placeholder="Source" value={e.quelle} onChange={(x) => setzeEnt(z, { quelle: x.target.value })} />
                    <input className={feld} placeholder="Photographer" value={e.fotograf} onChange={(x) => setzeEnt(z, { fotograf: x.target.value })} />
                    <input className={feld} placeholder="X account (@…)" value={e.handle} onChange={(x) => setzeEnt(z, { handle: x.target.value })} />
                    <input className={feld} placeholder="Link" value={e.link} onChange={(x) => setzeEnt(z, { link: x.target.value })} />
                    <input className={feld} placeholder="Licence (internal)" value={e.lizenz} onChange={(x) => setzeEnt(z, { lizenz: x.target.value })} />
                    <input className={feld} placeholder="Probably (internal, never public)" value={e.wahrscheinlich} onChange={(x) => setzeEnt(z, { wahrscheinlich: x.target.value })} />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <label className="flex items-center gap-1.5 text-white/70">
                      <input type="checkbox" className="accent-emerald-500" checked={e.bestaetigt} disabled={!e.quelle.trim() && !e.fotograf.trim() && !e.handle.trim()} onChange={(x) => setzeEnt(z, { bestaetigt: x.target.checked })} />
                      <T>bestätigt</T>
                    </label>
                    <label className="flex items-center gap-1.5 text-white/55" title="Also show the small tag on the photo when the source has many photos">
                      <input type="checkbox" className="accent-akz" checked={e.einzeln} onChange={(x) => setzeEnt(z, { einzeln: x.target.checked })} />
                      <T>on photo</T>
                    </label>
                    {z.foto && (
                      <button type="button" disabled={!geaendert} onClick={() => speichern(z)} className="rounded-md bg-akz px-2 py-0.5 font-bold text-[#04050a] disabled:opacity-30"><T>Speichern</T></button>
                    )}
                  </div>
                  {status[k] && <p className={`text-[11px] ${status[k].startsWith('Fehler') ? 'text-rose-300' : 'text-white/40'}`}>{status[k]}</p>}
                  {!z.foto && <p className="text-[10px] text-white/40"><T>The details are sent with the upload.</T></p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

/** Die von Hand ergaenzten Eintraege der Liste "Photos from" (foto-quellen-extra.json, /api/admin/foto-quellen). */
function ExtraQuellen() {
  const [extra, setExtra] = useState<Record<Art, ExtraEintrag[]> | null>(null);
  const [liste, setListe] = useState<Record<Art, Quelle[]> | null>(null);
  const [status, setStatus] = useState('');
  const [offen, setOffen] = useState(false);
  const laden = useCallback(async () => {
    const j = await fetch('/api/admin/foto-quellen', { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
    if (!j?.ok) { setStatus(`Error: ${j?.error ?? 'Loading failed'}`); return; }
    setExtra(j.extra); setListe(j.liste); setStatus('');
  }, []);
  useEffect(() => { if (!offen) return; const t = setTimeout(laden, 0); return () => clearTimeout(t); }, [offen, laden]);
  const aendern = (art: Art, i: number, teil: Partial<ExtraEintrag>) => setExtra((x) => x && { ...x, [art]: x[art].map((e, j) => (j === i ? { ...e, ...teil } : e)) });
  const speichern = async () => {
    setStatus('saving …');
    const j = await fetch('/api/admin/foto-quellen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(extra) })
      .then((r) => r.json()).catch((e) => ({ ok: false, error: (e as Error).message }));
    if (!j.ok) { setStatus(`Error: ${j.error}`); return; }
    await laden(); setStatus('gespeichert');
  };
  const feld = 'w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-white outline-none focus:border-akz';
  return (
    <section className="mb-4 fl !rounded-2xl p-3 text-xs">
      <button type="button" onClick={() => setOffen(!offen)} className="font-semibold text-white/85">{offen ? '▾' : '▸'}  List “Photos from” – add by hand</button>
      {offen && (
        <div className="mt-2 space-y-3">
          <p className="text-[11px] text-white/40">The list builds itself from the credits of public photos. Add sources here (without a count) or set the display name, X account and link of a computed source (same name or same X account).</p>
          {extra && (['organisationen', 'fotografen'] as Art[]).map((art) => (
            <div key={art}>
              <p className="mb-1 font-semibold text-white/70">{art === 'organisationen' ? 'Organizations' : 'Photographers'}</p>
              {extra[art].map((e, i) => (
                <div key={i} className="mb-1 grid grid-cols-[1fr_1fr_1.5fr_auto] gap-1">
                  <input className={feld} placeholder="Name" value={e.name} onChange={(x) => aendern(art, i, { name: x.target.value })} />
                  <input className={feld} placeholder="X account (@…)" value={e.handle ?? ''} onChange={(x) => aendern(art, i, { handle: x.target.value })} />
                  <input className={feld} placeholder="Link" value={e.link ?? ''} onChange={(x) => aendern(art, i, { link: x.target.value })} />
                  <button type="button" className="rounded-md border border-white/15 px-2 text-white/55 hover:text-rose-300" onClick={() => setExtra({ ...extra, [art]: extra[art].filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
              <button type="button" className="rounded-md border border-white/15 px-2 py-0.5 text-white/55 hover:text-white" onClick={() => setExtra({ ...extra, [art]: [...extra[art], { name: '' }] })}>+ Entry</button>
              {liste && <p className="mt-1 text-[11px] text-white/40">Public: {liste[art].map((q) => `${q.name}${q.fotos ? ` (${q.fotos})` : ''}`).join(' · ') || '–'}</p>}
            </div>
          ))}
          <div className="flex items-center gap-2">
            <button type="button" onClick={speichern} disabled={!extra} className="rounded-md bg-akz px-3 py-1 font-bold text-[#04050a] disabled:opacity-30">Save</button>
            <span className="text-white/40">{status}</span>
          </div>
        </div>
      )}
    </section>
  );
}
