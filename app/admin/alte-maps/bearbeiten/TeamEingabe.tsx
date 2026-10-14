'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import TeamFlagge from '@/components/TeamFlagge';

/*
 * Ein Team anlegen: Spieler suchen, auswaehlen, Plus fuer den naechsten.
 *
 * Der Betreiber (14.10.2026): "Wenn ich Sky eingebe, wird er mir unten aufgelistet, ich waehle ihn - dann soll von alleine ein Plus
 * kommen, dass ich einen zweiten Spieler hinzufuegen kann ... und dann kann ich einen dritten, bei Squads einen vierten, maximal vier.
 * Du musst herausfinden, ob der Cup Solo, Duo oder Trio ist." Wie viele Plaetze es gibt, sagt der Cup (max); ein Solo-Team ist mit der
 * Auswahl fertig, jedes andere, sobald alle Plaetze besetzt sind - oder mit Enter beziehungsweise "Anlegen", wenn weniger bekannt sind.
 * Jeder gewaehlte Spieler bringt Flagge und Konto mit.
 */

export interface TeamSpieler { name: string; epicId?: string; land?: string | null }
interface Vorschlag { name: string; land: string; epicId: string }

export default function TeamEingabe({ max, unbekannt = false, onTeam, loese }: {
  /** Wie viele Spieler ein Team in diesem Cup hat (1 bis 4). */
  max: number;
  /** Die Teamgroesse liess sich nicht herausfinden - dann gelten vier Plaetze. */
  unbekannt?: boolean;
  onTeam: (spieler: TeamSpieler[]) => void;
  /** Ein getippter Name, der in keinem Vorschlag steht: Konto und Land nachschlagen, soweit eindeutig. */
  loese: (name: string) => Promise<TeamSpieler>;
}) {
  const t = useT();
  const [gewaehlt, setGewaehlt] = useState<TeamSpieler[]>([]);
  const [text, setText] = useState('');
  const [offen, setOffen] = useState(true);
  const [vorschlaege, setVorschlaege] = useState<Vorschlag[]>([]);
  const [aktiv, setAktiv] = useState(-1);
  const eingabe = useRef<HTMLInputElement | null>(null);
  const plus = useRef<HTMLButtonElement | null>(null);
  const merker = useRef<{ q: string; liste: Vorschlag[] }>({ q: '', liste: [] });

  const anfrage = text.trim();
  useEffect(() => {
    if (!offen || anfrage.length < 2) { setVorschlaege([]); setAktiv(-1); return undefined; }
    let lebt = true;
    const uhr = setTimeout(() => {
      fetch(`/api/szene-stats?ansicht=suche&q=${encodeURIComponent(anfrage)}`).then((r) => r.json()).then((j) => {
        if (!lebt) return;
        const liste: Vorschlag[] = (j.spieler ?? []).slice(0, 8).map((s: { anzeige?: string; name?: string; land?: string; epicId?: string }) => ({
          name: s.anzeige || s.name || '', land: s.land ?? '', epicId: s.epicId ?? '',
        })).filter((x: Vorschlag) => x.name);
        merker.current = { q: anfrage, liste };
        setVorschlaege(liste); setAktiv(liste.length ? 0 : -1);
      }).catch(() => { /* ohne Vorschlaege */ });
    }, 220);
    return () => { lebt = false; clearTimeout(uhr); };
  }, [anfrage, offen]);

  // Ein neuer Platz wurde geoeffnet: der Cursor steht gleich im Feld.
  useEffect(() => { if (offen) eingabe.current?.focus(); }, [offen, gewaehlt.length]);

  const waehle = useCallback((s: TeamSpieler) => {
    if (gewaehlt.some((x) => x.name.toLowerCase() === s.name.toLowerCase())) { setText(''); return; }
    const neu = [...gewaehlt, s];
    setText(''); setVorschlaege([]); setAktiv(-1);
    if (neu.length >= max) { onTeam(neu); setGewaehlt([]); setOffen(true); return; }
    setGewaehlt(neu); setOffen(false);
    // Das Plus ist gleich bedienbar: Enter oeffnet den naechsten Platz.
    setTimeout(() => plus.current?.focus(), 0);
  }, [gewaehlt, max, onTeam]);

  const nehmeVorschlag = (v: Vorschlag) => waehle({ name: v.name, ...(v.epicId ? { epicId: v.epicId } : {}), ...(v.land ? { land: v.land } : {}) });

  /** Der getippte Text als Name - mit Konto und Land, wenn das Archiv genau einen gleichlautenden Spieler kennt. */
  const nehmeText = async () => {
    const n = text.trim();
    if (!n) return;
    const treffer = merker.current.liste.find((v) => v.name.toLowerCase() === n.toLowerCase());
    waehle(treffer ? { name: treffer.name, ...(treffer.epicId ? { epicId: treffer.epicId } : {}), ...(treffer.land ? { land: treffer.land } : {}) } : await loese(n));
  };

  /** Das Team mit den bisher gewaehlten Spielern anlegen (auch weniger als max). */
  const anlegen = async () => {
    const n = text.trim();
    if (n) { await nehmeText(); return; }
    if (!gewaehlt.length) return;
    onTeam(gewaehlt); setGewaehlt([]); setOffen(true); setText('');
  };

  const taste = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && vorschlaege.length) { e.preventDefault(); setAktiv((a) => (a + 1) % vorschlaege.length); return; }
    if (e.key === 'ArrowUp' && vorschlaege.length) { e.preventDefault(); setAktiv((a) => (a <= 0 ? vorschlaege.length - 1 : a - 1)); return; }
    if (e.key === 'Escape') { setText(''); setVorschlaege([]); return; }
    // Die alten Trenner (Sky & Scroll) gehen weiter: sie schliessen den Namen ab und oeffnen den naechsten Platz.
    if ((e.key === '&' || e.key === ',' || e.key === '/' || e.key === '+') && text.trim()) { e.preventDefault(); void nehmeText(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (vorschlaege[aktiv]) { nehmeVorschlag(vorschlaege[aktiv]); return; }
      void anlegen();
    }
  };

  return (
    <div>
      <div className="relative">
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 focus-within:border-sky-500">
          {gewaehlt.map((s, i) => (
            <span key={`${s.name}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-xs font-bold text-slate-500">+</span>}
              <span className="flex items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/10 py-0.5 pl-1.5 pr-1 text-[11px] font-bold uppercase text-sky-100">
                <TeamFlagge groesse={14} laender={[s.land ?? undefined]} />{s.name}
                <button type="button" aria-label={t('Spieler entfernen')} title={t('Spieler entfernen')}
                  onClick={() => { setGewaehlt((alt) => alt.filter((_, j) => j !== i)); setOffen(true); }}
                  className="rounded px-1 text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-300">×</button>
              </span>
            </span>
          ))}
          {offen ? (
            <span className="flex min-w-[8rem] flex-1 items-center gap-1.5">
              {gewaehlt.length > 0 && <span className="text-xs font-bold text-slate-500">+</span>}
              <input ref={eingabe} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={taste}
                placeholder={gewaehlt.length ? t('Nächster Spieler …') : t('Spieler suchen …')}
                className="min-w-0 flex-1 bg-transparent px-1 py-1 text-sm text-slate-100 outline-none placeholder:text-slate-600" />
            </span>
          ) : (
            <button ref={plus} type="button" onClick={() => setOffen(true)} aria-label={t('Weiteren Spieler hinzufügen')} title={t('Weiteren Spieler hinzufügen')}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-sky-500/50 bg-sky-500/10 text-base font-bold text-sky-200 transition hover:bg-sky-500/25 focus:outline-none focus:ring-2 focus:ring-sky-500">+</button>
          )}
          <button type="button" onClick={() => void anlegen()} disabled={!gewaehlt.length && !text.trim()}
            className="ml-auto rounded-md bg-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-zinc-900 transition hover:bg-sky-100 disabled:opacity-30">
            <T>Anlegen</T>
          </button>
        </div>
        {offen && vorschlaege.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-xl">
            {vorschlaege.map((v, i) => (
              <li key={v.epicId || v.name}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => nehmeVorschlag(v)} onMouseEnter={() => setAktiv(i)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-200 ${i === aktiv ? 'bg-zinc-800' : 'hover:bg-zinc-900'}`}>
                  <TeamFlagge groesse={16} laender={[v.land || undefined]} /><span className="truncate">{v.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">
        {unbekannt ? <T>Teamgröße unbekannt: bis zu vier Spieler je Team - mit + kommt der nächste, Enter legt das Team an.</T>
          : max === 1 ? <T>Solo-Cup: ein Spieler je Team, mit der Auswahl ist es angelegt.</T>
          : max === 2 ? <T>Duo-Cup: zwei Spieler je Team - mit + kommt der zweite, Enter legt das Team an.</T>
          : max === 3 ? <T>Trio-Cup: drei Spieler je Team - mit + kommt der nächste, Enter legt das Team an.</T>
          : <T>Squad-Cup: vier Spieler je Team - mit + kommt der nächste, Enter legt das Team an.</T>}
      </p>
    </div>
  );
}
