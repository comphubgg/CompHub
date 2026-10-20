'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

/*
 * Die POVs des Teams (Betreiber, 20.10.2026): die Org stellt die POVs ihrer Spieler ein - auch derer, die nicht streamen. Gesendet wird vom Spieler selbst (Browser, Windows-Programm
 * oder automatisch aus dem Discord-Sprachkanal); hier legt die Org fest, welche VIPs es sehen duerfen, wie gut das Bild ist und ob das Namensbanner erscheint.
 */

interface Hud { an: boolean; ort: 'oben' | 'unten' | 'links' | 'rechts'; mitBild: boolean; text: string }
interface Kanal {
  ident: string; spieler: string; konto: string; bild: string | null; live: boolean; liveSeit: number | null; zuschauer: number;
  qualitaet: 'max' | 'mittel' | 'niedrig'; hud: Hud; erlaubt: string[];
}
interface Vip { ident: string; name: string; auch: string[] }

const QUALITAETEN: Array<['max' | 'mittel' | 'niedrig', string]> = [['max', 'Maximal'], ['mittel', 'Mittel'], ['niedrig', 'Niedrig']];
const ORTE: Array<[Hud['ort'], string]> = [['unten', 'Unten'], ['oben', 'Oben'], ['links', 'Links'], ['rechts', 'Rechts']];
const feld = 'w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500';

export default function OrgPov({ orgParam, farbe }: { orgParam: string; farbe: string }) {
  const t = useT();
  const [kanaele, setKanaele] = useState<Kanal[] | null>(null);
  const [ohne, setOhne] = useState<Array<{ name: string; hatKonto: boolean }>>([]);
  const [vips, setVips] = useState<Vip[]>([]);
  const [fehler, setFehler] = useState('');
  const [offen, setOffen] = useState<string | null>(null);
  const [suche, setSuche] = useState('');

  const uebernehmen = useCallback((j: { ok?: boolean; error?: string; kanaele?: Kanal[]; ohneKonto?: Array<{ name: string; hatKonto: boolean }>; vips?: Vip[] }) => {
    if (!j.ok) { setFehler(j.error ?? 'Das hat nicht geklappt.'); return false; }
    setFehler(''); setKanaele(j.kanaele ?? []); setOhne(j.ohneKonto ?? []);
    if (j.vips) setVips(j.vips);
    return true;
  }, []);

  useEffect(() => {
    let weg = false;
    void fetch(`/api/org-pov${orgParam ? `?org=${encodeURIComponent(orgParam)}` : ''}`, { cache: 'no-store' })
      .then((r) => r.json()).then((j) => { if (!weg) uebernehmen(j); })
      .catch(() => { if (!weg) setFehler('Die Ablage antwortet gerade nicht.'); });
    return () => { weg = true; };
  }, [orgParam, uebernehmen]);

  const aendere = async (ident: string, teil: Record<string, unknown>) => {
    try {
      const r = await fetch('/api/org-pov', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ org: orgParam || undefined, ident, teil }) });
      uebernehmen(await r.json());
    } catch { setFehler('Die Ablage antwortet gerade nicht.'); }
  };

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return q ? vips.filter((v) => v.name.toLowerCase().includes(q)) : vips;
  }, [vips, suche]);

  if (kanaele === null && !fehler) return null;

  return (
    <section className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-[0_10px_30px_rgba(15,23,42,.18)]">
      <h2 className="text-lg font-bold text-white"><T>POVs deines Teams</T></h2>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">
        <T>Hier stellst du ein, welche VIPs das POV deiner Spieler sehen dürfen - auch wenn sie selbst nicht streamen. Gesendet wird vom Spieler: im Browser unter „POV“, mit dem Windows-Programm CompHub POV oder automatisch, sobald er in einem Discord-Sprachkanal streamt. Das Bild sehen nur die, die du freigibst.</T>
      </p>
      {fehler && <p role="alert" className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">{t(fehler)}</p>}

      <ul className="mt-4 grid gap-4 lg:grid-cols-2">
        {(kanaele ?? []).map((k) => {
          const erlaubt = new Set(k.erlaubt);
          const gewaehlt = (v: Vip) => v.auch.some((i) => erlaubt.has(i));
          const umschalten = (v: Vip) => {
            const neu = new Set(erlaubt);
            if (gewaehlt(v)) v.auch.forEach((i) => neu.delete(i)); else v.auch.forEach((i) => neu.add(i));
            void aendere(k.ident, { erlaubt: [...neu] });
          };
          const zahl = vips.filter(gewaehlt).length;
          const aufgeklappt = offen === k.ident;
          return (
            <li key={k.ident} className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
              <div className="flex items-center gap-3">
                {k.bild
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={k.bild} alt="" className="h-12 w-12 rounded-xl object-cover" />
                  : <span className="grid h-12 w-12 place-items-center rounded-xl bg-zinc-800 text-lg font-bold text-slate-400">{k.spieler.slice(0, 1).toUpperCase()}</span>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold uppercase tracking-wide text-white">{k.spieler}</p>
                  <p className="truncate text-[11px] text-slate-500">{k.konto}</p>
                </div>
                {k.live
                  ? <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /><T>Live</T> · {k.zuschauer}</span>
                  : <span className="rounded-full border border-zinc-700 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500"><T>Offline</T></span>}
              </div>

              <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400"><T>Qualität</T></p>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {QUALITAETEN.map(([w, n]) => (
                  <button key={w} type="button" onClick={() => void aendere(k.ident, { qualitaet: w })}
                    className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${k.qualitaet === w ? 'text-white' : 'border-zinc-800 text-slate-400 hover:border-zinc-600'}`}
                    style={k.qualitaet === w ? { borderColor: farbe, background: `${farbe}22` } : undefined}>{t(n)}</button>
                ))}
              </div>

              <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400"><T>Namensbanner</T></p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <button type="button" aria-pressed={k.hud.an} onClick={() => void aendere(k.ident, { hud: { an: !k.hud.an } })}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${k.hud.an ? 'border-sky-500 bg-sky-500/10 text-sky-300' : 'border-zinc-800 text-slate-400 hover:border-zinc-600'}`}>
                  {k.hud.an ? <T>An</T> : <T>Aus</T>}
                </button>
                <select value={k.hud.ort} disabled={!k.hud.an} onChange={(e) => void aendere(k.ident, { hud: { ort: e.target.value } })}
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-slate-200 disabled:opacity-40">
                  {ORTE.map(([o, n]) => <option key={o} value={o}>{t(n)}</option>)}
                </select>
              </div>

              <button type="button" onClick={() => setOffen(aufgeklappt ? null : k.ident)}
                className="mt-4 flex w-full items-center justify-between rounded-lg border border-zinc-800 px-3 py-2 text-left text-xs font-bold text-slate-200 transition hover:border-sky-500">
                <span><T>Wer es sehen darf</T></span>
                <span className="tabular-nums text-slate-500">{zahl} / {vips.length} {aufgeklappt ? '▴' : '▾'}</span>
              </button>
              {aufgeklappt && (
                <div className="mt-2">
                  <input value={suche} onChange={(e) => setSuche(e.target.value)} spellCheck={false} placeholder={t('VIP suchen …')} className={feld} />
                  <div className="mt-2 flex gap-3 text-[11px]">
                    <button type="button" className="text-slate-400 transition hover:text-sky-400"
                      onClick={() => void aendere(k.ident, { erlaubt: [...new Set([...k.erlaubt, ...gefiltert.flatMap((v) => v.auch)])] })}><T>Alle auswählen</T></button>
                    <button type="button" className="text-slate-400 transition hover:text-sky-400" onClick={() => void aendere(k.ident, { erlaubt: [] })}><T>Keinen</T></button>
                  </div>
                  <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1">
                    {gefiltert.map((v) => (
                      <li key={v.ident}>
                        <label className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-1.5 text-sm transition ${gewaehlt(v) ? 'border-sky-500/50 bg-sky-500/10' : 'border-zinc-800 hover:border-zinc-600'}`}>
                          <input type="checkbox" checked={gewaehlt(v)} onChange={() => umschalten(v)} className="accent-sky-500" />
                          <span className="min-w-0 flex-1 truncate text-slate-200">{v.name}</span>
                        </label>
                      </li>
                    ))}
                    {gefiltert.length === 0 && <li className="py-3 text-center text-xs text-slate-500"><T>Keine VIPs gefunden</T></li>}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {kanaele && kanaele.length === 0 && (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-700 px-4 py-5 text-center text-sm text-slate-400">
          <T>Noch kein Spieler deines Kaders hat ein Pro-Konto mit verknüpftem Epic-Konto. Sobald der Admin eines freischaltet, erscheint sein POV hier.</T>
        </p>
      )}
      {ohne.length > 0 && (
        <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
          <T>Ohne Pro-Konto (können noch nicht senden):</T> {ohne.map((o) => o.name).join(', ')}
        </p>
      )}
    </section>
  );
}
