'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import SeitenKopf from '@/app/components/SeitenKopf';
import { useZugang } from '@/app/lib/zugang';

/*
 * Spielerfotos & Fotografen (Betreiber, 16./17.11.2026): die alten, uebernommenen Fotos sind entfernt, neue laedt der Betreiber hier hoch - je Spieler, und
 * gleich mit den Angaben, von wem das Foto ist (Quelle, Fotograf, Link, Lizenz). Oeffentlich am Foto steht davon nur "Foto: Quelle / Fotograf", und nur,
 * wenn "bestaetigt" angehakt ist (lib/fotoCredits.ts, app/components/FotoCredit.tsx). "Wahrscheinlich", Lizenz und Notiz bleiben intern.
 *
 * Mehrfachauswahl: Haken an den Karten, dann oben Quelle/Fotograf/... fuer alle gewaehlten setzen.
 * Nur fuer den Admin: /api/admin/foto-credits und /api/spielerbild/hochladen pruefen das bei jeder Anfrage.
 */

interface Credit { quelle?: string; fotograf?: string; link?: string; lizenz?: string; bestaetigt: boolean; wahrscheinlich?: string; notiz?: string; geaendert?: number }
interface Zeile { epicId: string; name: string; datei: string; foto: boolean; bild: string | null; events: number; credit: Credit | null }
type Filter = 'alle' | 'ohneFoto' | 'unbekannt' | 'wahrscheinlich' | 'offen' | 'bestaetigt';
type Entwurf = { quelle: string; fotograf: string; link: string; lizenz: string; wahrscheinlich: string; notiz: string; bestaetigt: boolean };
const LEER: Entwurf = { quelle: '', fotograf: '', link: '', lizenz: '', wahrscheinlich: '', notiz: '', bestaetigt: false };
const JE_SEITE = 60;

const ausCredit = (c: Credit | null): Entwurf => ({
  quelle: c?.quelle ?? '', fotograf: c?.fotograf ?? '', link: c?.link ?? '', lizenz: c?.lizenz ?? '',
  wahrscheinlich: c?.wahrscheinlich ?? '', notiz: c?.notiz ?? '', bestaetigt: Boolean(c?.bestaetigt),
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
  const [sammel, setSammel] = useState({ quelle: '', fotograf: '', link: '', lizenz: '', wahrscheinlich: '', bestaetigt: '' as '' | 'ja' | 'nein' });
  const [sammelStatus, setSammelStatus] = useState('');
  const [neu, setNeu] = useState({ epicId: '', name: '' });

  const laden = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/foto-credits', { cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) { setFehler(j.error ?? 'Laden gescheitert'); return; }
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
    zeigeStatus(k, 'speichert …');
    const r = await fetch('/api/admin/foto-credits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dateien: [z.datei], felder: e }) })
      .then((x) => x.json()).catch((x) => ({ ok: false, error: (x as Error).message }));
    if (!r.ok) { zeigeStatus(k, `Fehler: ${r.error}`); return; }
    uebernehmen(r.credits);
    zeigeStatus(k, 'gespeichert');
  };

  const hochladen = async (z: Zeile | null, datei: File) => {
    const epicId = z?.epicId ?? neu.epicId.trim().toLowerCase().replace(/-/g, '');
    const name = z?.name ?? neu.name.trim();
    const k = z ? schluessel(z) : '__neu';
    if (!/^[0-9a-f]{32}$/.test(epicId)) { zeigeStatus(k, 'Fehler: Epic-Konto-Id (32 Zeichen) fehlt'); return; }
    const e = z ? ent(z) : LEER;
    const form = new FormData();
    form.set('datei', datei); form.set('epicId', epicId); form.set('name', name);
    for (const f of ['quelle', 'fotograf', 'link', 'lizenz', 'wahrscheinlich', 'notiz'] as const) if (e[f]) form.set(f, e[f]);
    form.set('bestaetigt', e.bestaetigt ? '1' : '0');
    zeigeStatus(k, 'lädt hoch …');
    const r = await fetch('/api/spielerbild/hochladen', { method: 'POST', body: form }).then((x) => x.json()).catch((x) => ({ fehler: (x as Error).message }));
    if (!r.ok) { zeigeStatus(k, `Fehler: ${r.fehler ?? 'Hochladen gescheitert'}`); return; }
    zeigeStatus(k, r.creditFehler ? r.creditFehler : 'hochgeladen');
    if (!z) setNeu({ epicId: '', name: '' });
    if (z) setEntwurf((s) => { const n = { ...s }; delete n[k]; return n; });
    await laden();
  };

  const sammelAnwenden = async () => {
    const dateien = (zeilen ?? []).filter((z) => gewaehlt.has(schluessel(z)) && z.foto).map((z) => z.datei);
    if (!dateien.length) { setSammelStatus('Keine Fotos gewählt (Spieler ohne Foto zählen nicht).'); return; }
    const felder: Record<string, unknown> = {};
    for (const f of ['quelle', 'fotograf', 'link', 'lizenz', 'wahrscheinlich'] as const) if (sammel[f].trim()) felder[f] = sammel[f].trim();
    if (sammel.bestaetigt) felder.bestaetigt = sammel.bestaetigt === 'ja';
    if (!Object.keys(felder).length) { setSammelStatus('Nichts eingetragen.'); return; }
    setSammelStatus('speichert …');
    const r = await fetch('/api/admin/foto-credits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dateien, felder }) })
      .then((x) => x.json()).catch((x) => ({ ok: false, error: (x as Error).message }));
    if (!r.ok) { setSammelStatus(`Fehler: ${r.error}`); return; }
    uebernehmen(r.credits);
    setSammelStatus(`${dateien.length} Fotos gespeichert.`);
  };

  if (!zugang.laedt && !zugang.admin) {
    return <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 text-center text-slate-400"><p className="text-sm"><T>Nur für Admins.</T></p></main>;
  }

  const chip = (an: boolean) => `rounded-full px-3 py-1 text-xs font-bold transition ${an ? 'bg-sky-500 text-white' : 'border border-zinc-800 bg-zinc-900 text-slate-400 hover:text-slate-100'}`;
  const feld = 'w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-slate-100 outline-none focus:border-sky-500';
  const FILTER: Array<[Filter, string]> = [
    ['alle', 'Alle'], ['ohneFoto', 'Ohne Foto'], ['unbekannt', 'Fotograf unbekannt'], ['wahrscheinlich', 'Wahrscheinlich'],
    ['offen', 'Eingetragen, nicht bestätigt'], ['bestaetigt', 'Bestätigt'],
  ];

  return (
    <main className="flex-1 bg-zinc-950 px-4 py-6 text-slate-200">
      <div className="mx-auto max-w-[1400px]">
        <SeitenKopf className="mb-5" marke={<T>Spieler & Teams</T>} titel={<T>Spielerfotos & Fotografen</T>}
          text={<T>Neue Fotos je Spieler hochladen, gleich mit Quelle, Fotograf, Link und Lizenz. Öffentlich steht am Foto nur „Foto: Quelle / Fotograf“ – und nur, wenn „bestätigt“ angehakt ist. „Wahrscheinlich“, Lizenz und Notiz bleiben intern.</T>} />

        {fehler && <p className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{fehler}</p>}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {FILTER.map(([f, titel]) => (
            <button key={f} type="button" className={chip(filter === f)} onClick={() => { setFilter(f); setSeite(0); }}><T>{titel}</T> <span className="opacity-70">{zahlen[f]}</span></button>
          ))}
          <input value={suche} onChange={(e) => { setSuche(e.target.value); setSeite(0); }} placeholder="Spieler, Fotograf …" className="ml-auto w-56 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-sky-500" />
        </div>

        {/* Mehrfachauswahl */}
        <section className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <b className="text-slate-200">{gewaehlt.size}</b> <T>gewählt</T>
            <button type="button" className="rounded-md border border-zinc-700 px-2 py-0.5 hover:text-slate-100" onClick={() => setGewaehlt(new Set(aufSeite.filter((z) => z.foto).map(schluessel)))}><T>Diese Seite wählen</T></button>
            <button type="button" className="rounded-md border border-zinc-700 px-2 py-0.5 hover:text-slate-100" onClick={() => setGewaehlt(new Set(liste.filter((z) => z.foto).map(schluessel)))}><T>Alle gefilterten wählen</T></button>
            <button type="button" className="rounded-md border border-zinc-700 px-2 py-0.5 hover:text-slate-100" onClick={() => setGewaehlt(new Set())}><T>Auswahl leeren</T></button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
            <input className={feld} placeholder="Quelle (z. B. Epic Games)" value={sammel.quelle} onChange={(e) => setSammel({ ...sammel, quelle: e.target.value })} />
            <input className={feld} placeholder="Fotograf" value={sammel.fotograf} onChange={(e) => setSammel({ ...sammel, fotograf: e.target.value })} />
            <input className={feld} placeholder="Link" value={sammel.link} onChange={(e) => setSammel({ ...sammel, link: e.target.value })} />
            <input className={feld} placeholder="Lizenz (intern)" value={sammel.lizenz} onChange={(e) => setSammel({ ...sammel, lizenz: e.target.value })} />
            <input className={feld} placeholder="Wahrscheinlich (intern)" value={sammel.wahrscheinlich} onChange={(e) => setSammel({ ...sammel, wahrscheinlich: e.target.value })} />
            <select className={feld} value={sammel.bestaetigt} onChange={(e) => setSammel({ ...sammel, bestaetigt: e.target.value as '' | 'ja' | 'nein' })}>
              <option value="">Bestätigt: unverändert</option><option value="ja">Bestätigt: ja</option><option value="nein">Bestätigt: nein</option>
            </select>
            <button type="button" onClick={sammelAnwenden} className="rounded-md bg-sky-500 px-3 py-1 text-xs font-bold text-white hover:bg-sky-400"><T>Auf Auswahl anwenden</T></button>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Leere Felder bleiben unverändert. {sammelStatus}</p>
        </section>

        {/* Ein Spieler, der noch nicht in der Liste steht */}
        <section className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-3 text-xs">
          <span className="font-semibold text-slate-300"><T>Foto für einen weiteren Spieler</T>:</span>
          <input className={`${feld} w-72`} placeholder="Epic-Konto-Id" value={neu.epicId} onChange={(e) => setNeu({ ...neu, epicId: e.target.value })} />
          <input className={`${feld} w-48`} placeholder="Name" value={neu.name} onChange={(e) => setNeu({ ...neu, name: e.target.value })} />
          <label className="cursor-pointer rounded-md border border-sky-500/50 px-3 py-1 font-semibold text-sky-300 hover:bg-sky-500/10">
            <T>Foto wählen …</T>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) hochladen(null, f); }} />
          </label>
          <span className="text-slate-500">{status.__neu} <T>Angaben danach in der Karte eintragen.</T></span>
        </section>

        {!zeilen && !fehler && <p className="text-sm text-slate-500"><T>Lädt …</T></p>}

        <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
          <span>{liste.length} <T>Spieler</T></span>
          <span className="flex items-center gap-2">
            <button type="button" className="rounded-md border border-zinc-800 px-2 py-1 disabled:opacity-40" disabled={seite === 0} onClick={() => setSeite(seite - 1)}>←</button>
            <span className="tabular-nums">{seite + 1} / {seiten}</span>
            <button type="button" className="rounded-md border border-zinc-800 px-2 py-1 disabled:opacity-40" disabled={seite + 1 >= seiten} onClick={() => setSeite(seite + 1)}>→</button>
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-ohne-foto-credit>
          {aufSeite.map((z) => {
            const k = schluessel(z);
            const e = ent(z);
            const geaendert = Boolean(entwurf[k]);
            const zst = zustandVon(z);
            const oeffentlich = z.credit?.bestaetigt ? [z.credit.quelle, z.credit.fotograf].filter(Boolean).join(' / ') : '';
            return (
              <div key={k} className={`flex gap-3 rounded-2xl border bg-zinc-900 p-3 ${gewaehlt.has(k) ? 'border-sky-500' : 'border-zinc-800'}`}>
                <div className="flex w-24 shrink-0 flex-col gap-1.5">
                  <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-zinc-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {z.bild ? <img src={z.bild} alt="" loading="lazy" className="h-full w-full object-cover" />
                      : <span className="grid h-full place-items-center text-[10px] text-slate-500"><T>kein Foto</T></span>}
                    {z.foto && (
                      <input type="checkbox" aria-label="wählen" checked={gewaehlt.has(k)} className="absolute left-1 top-1 h-4 w-4 accent-sky-500"
                        onChange={(ev) => setGewaehlt((s) => { const n = new Set(s); if (ev.target.checked) n.add(k); else n.delete(k); return n; })} />
                    )}
                  </div>
                  <label className="cursor-pointer rounded-md border border-sky-500/50 px-1 py-0.5 text-center text-[11px] font-semibold text-sky-300 hover:bg-sky-500/10">
                    {z.foto ? <T>Ersetzen …</T> : <T>Hochladen …</T>}
                    <input type="file" accept="image/*" className="hidden" onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ''; if (f) hochladen(z, f); }} />
                  </label>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <b className="truncate text-sm text-slate-100" title={z.epicId}>{z.name}</b>
                    <span className={`shrink-0 rounded-full px-2 text-[10px] font-bold ${zst === 'bestaetigt' ? 'bg-emerald-500/15 text-emerald-300' : zst === 'offen' ? 'bg-amber-500/15 text-amber-300' : zst === 'wahrscheinlich' ? 'bg-violet-500/15 text-violet-300' : 'bg-zinc-800 text-slate-400'}`}>
                      {{ bestaetigt: 'bestätigt', offen: 'nicht bestätigt', wahrscheinlich: 'wahrscheinlich', unbekannt: 'unbekannt', ohneFoto: 'ohne Foto' }[zst]}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-slate-500">{oeffentlich ? <>Öffentlich: <span className="text-slate-300">Foto: {oeffentlich}</span></> : 'Öffentlich: nichts'}</p>
                  <div className="grid grid-cols-2 gap-1">
                    <input className={feld} placeholder="Quelle" value={e.quelle} onChange={(x) => setzeEnt(z, { quelle: x.target.value })} />
                    <input className={feld} placeholder="Fotograf" value={e.fotograf} onChange={(x) => setzeEnt(z, { fotograf: x.target.value })} />
                    <input className={feld} placeholder="Link" value={e.link} onChange={(x) => setzeEnt(z, { link: x.target.value })} />
                    <input className={feld} placeholder="Lizenz (intern)" value={e.lizenz} onChange={(x) => setzeEnt(z, { lizenz: x.target.value })} />
                    <input className={`${feld} col-span-2`} placeholder="Wahrscheinlich (intern, nie öffentlich)" value={e.wahrscheinlich} onChange={(x) => setzeEnt(z, { wahrscheinlich: x.target.value })} />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <label className="flex items-center gap-1.5 text-slate-300">
                      <input type="checkbox" className="accent-emerald-500" checked={e.bestaetigt} disabled={!e.quelle.trim() && !e.fotograf.trim()} onChange={(x) => setzeEnt(z, { bestaetigt: x.target.checked })} />
                      <T>bestätigt</T>
                    </label>
                    {z.foto && (
                      <button type="button" disabled={!geaendert} onClick={() => speichern(z)} className="rounded-md bg-sky-500 px-2 py-0.5 font-bold text-white disabled:opacity-30"><T>Speichern</T></button>
                    )}
                  </div>
                  {status[k] && <p className={`text-[11px] ${status[k].startsWith('Fehler') ? 'text-rose-300' : 'text-slate-500'}`}>{status[k]}</p>}
                  {!z.foto && <p className="text-[10px] text-slate-500"><T>Angaben gehen beim Hochladen mit.</T></p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
