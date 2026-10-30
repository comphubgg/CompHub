'use client';

import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import TeamFlagge from '@/components/TeamFlagge';
import type { SolosTeam } from '@/lib/globalsSolos';

/*
 * Die Tierlist eines einzelnen Cups.
 *
 * Der Betreiber (12.10.2026): "dann soll man fuer den Cup selber auch eine Tierlist machen ... einfach eine normale
 * Tierlist, du siehst sie einfach nur fuer den Cup selber." Oben die Stufen S bis F, rechts der Pool mit allen Teams
 * des Spieltags. Ein Team ziehen oder antippen (erst das Team, dann die Stufe), ein gesetztes Team antippen nimmt es
 * wieder heraus. Gemerkt wird je Spieltag im Browser - das ist eine private Liste und braucht kein Konto.
 */

const STUFEN = [
  { k: 'S', farbe: 'bg-red-500' }, { k: 'A', farbe: 'bg-orange-500' }, { k: 'B', farbe: 'bg-amber-400' },
  { k: 'C', farbe: 'bg-green-500' }, { k: 'D', farbe: 'bg-blue-500' }, { k: 'E', farbe: 'bg-violet-500' }, { k: 'F', farbe: 'bg-slate-500' },
] as const;
type Stufe = typeof STUFEN[number]['k'];

const schluessel = (windowId: string) => `maps_tierlist_${windowId}`;

function TeamChip({ t, aktiv, wie = 'stufe', onKlick, onZiehen }: { t: SolosTeam; aktiv?: boolean; wie?: 'stufe' | 'liste'; onKlick: () => void; onZiehen: (id: string | null) => void }) {
  return (
    <button type="button" draggable onClick={onKlick}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); onZiehen(t.id); }} onDragEnd={() => onZiehen(null)}
      className={`flex ${wie === 'liste' ? 'w-full' : 'w-fit max-w-full'} items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition ${aktiv
        ? 'border-sky-400 bg-sky-500/15' : 'border-white/[0.08] bg-zinc-900/70 hover:border-sky-500/50'}`}>
      {/* Ein Kreis fuer das ganze Team: zwei oder drei Flaggen in einer, wie auf den Kacheln der Tierlist. */}
      <TeamFlagge groesse={t.spieler.length > 1 ? 30 : 24} laender={t.spieler.map((s) => s.land ?? undefined)} />
      {/* Die Namen untereinander, nicht in einer langen Zeile. */}
      <span className="flex min-w-0 flex-col text-[11px] font-bold uppercase leading-[1.25] text-slate-100">
        {t.spieler.map((s) => <span key={s.id} className="truncate">{s.anzeige}</span>)}
      </span>
    </button>
  );
}

export default function CupTierlist({ windowId, teams }: { windowId: string; teams: SolosTeam[] }) {
  const t = useT();
  const [zu, setZu] = useState<Record<string, Stufe>>({});
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [zieht, setZieht] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  /*
   * Eigene Namen fuer die Stufen (Betreiber, 30.10.2026: "S, A, B, C, D, E, F umbenennen - speichert nicht, nur solange es auf der Seite ist"):
   * bewusst nur im Zustand der Seite, nicht im Browser gemerkt.
   */
  const [namen, setNamen] = useState<Partial<Record<Stufe, string>>>({});

  useEffect(() => {
    try { setZu(JSON.parse(localStorage.getItem(schluessel(windowId)) ?? '{}')); } catch { setZu({}); }
  }, [windowId]);
  const speichern = (neu: Record<string, Stufe>) => {
    setZu(neu);
    try { localStorage.setItem(schluessel(windowId), JSON.stringify(neu)); } catch { /* ohne Speicher */ }
  };

  const setze = (id: string, st: Stufe | null) => {
    const neu = { ...zu };
    if (st) neu[id] = st; else delete neu[id];
    speichern(neu); setGewaehlt(null);
  };

  const nachId = useMemo(() => new Map(teams.map((x) => [x.id, x])), [teams]);
  const pool = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return teams.filter((x) => !zu[x.id] && (!q || x.spieler.some((s) => s.anzeige.toLowerCase().includes(q))));
  }, [teams, zu, suche]);

  if (!teams.length) return <p className="text-sm text-slate-500"><T>Zu diesem Spieltag gibt es noch keine Teams.</T></p>;

  return (
    <div>
      <div className="mb-3 flex items-center gap-3 text-xs text-slate-500">
        <button type="button" onClick={() => speichern({})} className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1 font-semibold text-slate-300 transition hover:border-sky-500/60"><T>Zurücksetzen</T></button>
        <span><T>Team ziehen oder antippen, dann die Stufe antippen — ein gesetztes Team antippen nimmt es wieder heraus.</T> <T>Die Buchstaben lassen sich umbenennen.</T></span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-stretch">
        <div className="space-y-1.5">
          {STUFEN.map((st) => {
            const drin = teams.filter((x) => zu[x.id] === st.k);
            return (
              <div key={st.k} className="flex min-h-[76px] overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-900/40"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || zieht; if (id && nachId.has(id)) setze(id, st.k); setZieht(null); }}
                onClick={() => { if (gewaehlt) setze(gewaehlt, st.k); }}>
                <span className={`flex w-20 shrink-0 items-center justify-center px-1 ${st.farbe}`} onClick={(e) => e.stopPropagation()}>
                  {(() => {
                    const wert = namen[st.k] ?? st.k;
                    // Je laenger der Name, desto kleiner die Schrift - er bleibt im Feld (Schrift schrumpft mit).
                    const groesse = wert.length <= 2 ? 'text-xl' : wert.length <= 5 ? 'text-sm' : 'text-[10px]';
                    return (
                      <input value={wert} maxLength={16} aria-label={t('Stufe umbenennen')} title={t('Antippen und umbenennen')}
                        onChange={(e) => setNamen((alt) => ({ ...alt, [st.k]: e.target.value }))}
                        onBlur={(e) => { if (!e.target.value.trim()) setNamen((alt) => { const neu = { ...alt }; delete neu[st.k]; return neu; }); }}
                        className={`w-full bg-transparent text-center font-black uppercase leading-tight text-zinc-950 outline-none placeholder:text-zinc-950/50 focus:rounded focus:bg-white/30 ${groesse}`} />
                    );
                  })()}
                </span>
                <div className="flex flex-1 flex-wrap content-start gap-1.5 p-2">
                  {drin.map((x) => <TeamChip key={x.id} t={x} onKlick={() => setze(x.id, null)} onZiehen={setZieht} />)}
                </div>
              </div>
            );
          })}
        </div>
        {/* Der Pool ist genau so hoch wie die sieben Stufen daneben (Betreiber, 13.10.2026): am Rechner fuellt er die Zeile, die Stufen bestimmen die Hoehe. */}
        <aside className="relative rounded-xl border border-white/[0.08] bg-zinc-900/40">
          <div className="flex max-h-[520px] flex-col p-3 lg:absolute lg:inset-0 lg:max-h-none">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pool <span className="text-slate-600">{pool.length}</span></p>
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Spieler suchen …')}
              className="mb-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
              {pool.map((x) => <TeamChip key={x.id} t={x} wie="liste" aktiv={gewaehlt === x.id} onKlick={() => setGewaehlt(gewaehlt === x.id ? null : x.id)} onZiehen={setZieht} />)}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
