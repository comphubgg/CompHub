import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import Link from '../port/next/link';
import T from '../port/app/components/T';
import { Laedt, NurAdmins } from '../teile';
import SeitenKopf from '../port/app/components/SeitenKopf';
import TeamFlagge from '../port/components/TeamFlagge';
import { useZugang } from '../port/app/lib/zugang';
import { REGIONEN_REIHE } from '../port/lib/regionFarbe';
import { landAusEingabe, landNach } from '../port/lib/laender';
import { xNormal, twitchNormal } from '../port/lib/profilEingabe';

/*
 * Flaggen & X-Konten (Betreiber, 16.11.2026: "jeder wichtige Spieler muss eine Flagge und ein X-Handle haben ... wie eine Tabelle").
 *
 * Die Liste: jeder wichtige Spieler (Regel in lib/flaggenWichtig.mjs), dem unter seiner Konto-Id die Flagge oder das X-Konto fehlt, nach Wichtigkeit.
 * Bedienung wie in einer Tabelle: Tab geht zur naechsten Zelle, Enter eine Zeile tiefer (Umschalt+Enter hoch), Esc nimmt die Eingabe zurueck. Verlaesst der
 * Fokus eine Zeile, wird sie gespeichert - nur die Felder, die sich geaendert haben; alles andere im Profil bleibt (lib/spielerProfil.ts).
 * Eine fertige Zeile bleibt bis zum Neuladen stehen (gefiltert wird nach dem Stand beim Laden), damit beim Tippen nichts unter dem Cursor wegspringt.
 *
 * Nur fuer den Admin: /api/admin/flaggen prueft das bei jeder Anfrage, und von oeffentlichen Seiten fuehrt kein Link hierher.
 */

interface Zeile {
  rang: number; id: string; name: string; namen: string[]; region: string;
  punkte: number; final: number; semi: number; heat: number; runde: number; cup: number; besteFinal: number | null; letzte: number | null; pr: number | null;
  land: string; x: string; twitch: string; anzeige: string; auto: { land: string; quelle: string } | null; alterEintrag: string | null;
  quelle: Record<'land' | 'x' | 'twitch' | 'anzeige', string>; konten: string[]; nurZweit: boolean;
  fehlt: { land: boolean; x: boolean }; speicherName: string;
  /** Socials-Finder (scripts/socials-finden.mjs): Vorschlaege fuer leere Felder und automatisch Eingetragenes, das noch niemand geprueft hat. */
  vorschlag: Partial<Record<Feld, SocialVorschlag>>;
  autoGespeichert: Partial<Record<Feld, { wert: string; belege: Beleg[]; zeit: number }>>;
}
interface Beleg { art: string; text: string; url?: string; stark?: boolean }
interface SocialVorschlag { wert: string; belege: Beleg[]; andere?: Array<{ wert: string; belege: Beleg[] }> }
interface Antwort { ok: boolean; error?: string; stand: number; wichtig: number; zeilen: Zeile[]; ausgeschlossen: { geloescht: number; turnierkonto: number; vollstaendig: number; ohneName: number } }
type Feld = 'land' | 'x' | 'twitch' | 'anzeige';
type Werte = Record<Feld, string>;
type Zustand = { art: 'sendet' | 'wartet' | 'ok' | 'fehler'; text?: string };
/** Eine abgeschickte Aenderung, bis der Server sie als gespeichert meldet - so laesst sie sich bei einem Fehler von selbst noch einmal schicken. */
type Auftrag = { koerper: Record<string, unknown>; gesendet: Werte; version: number | null; versuche: number; naechster: number };
/*
 * Wichtig im engeren Sinn (Betreiber, 16.11.2026: 23.217 Zeilen waren "viel zu viele"): mindestens zwei FNCS-Finals/Heats/Halbfinals oder mindestens
 * drei spaete FNCS-Qualifikationsrunden. Cups zaehlen hier nicht - Top 100 in einem Cash Cup schafften zu viele (mit Cups waeren es 22.500 geblieben).
 * Alle uebrigen wichtigen Spieler nur mit "Alle wichtigen zeigen".
 */
const kern = (z: Zeile) => z.final + z.heat + z.semi >= 2 || z.runde >= 3;

/* Woher ein Land automatisch kommt (lib/spielerFlagge.mjs) - als englisches Wort fuer die Anzeige. */
const QUELLE: Record<string, string> = { profil: 'profile', spiel: 'in-game flag', noble: 'Noble' };
const FELDER: Feld[] = ['land', 'x', 'twitch', 'anzeige'];
const JE_SEITE = 100;
type Filter = 'offen' | 'land' | 'x' | 'beide' | 'vorschlaege' | 'auto';

/** Was aus einer Eingabe gespeichert wuerde - oder ein Fehlertext. */
function pruefe(feld: Feld, roh: string): { wert: string; fehler: string } {
  const s = roh.trim();
  if (!s) return { wert: '', fehler: '' };
  if (feld === 'land') {
    const l = landAusEingabe(s);
    return l ? { wert: l.code, fehler: '' } : { wert: '', fehler: 'Unknown country' };
  }
  if (feld === 'anzeige') return { wert: s, fehler: '' }; // ein Anzeigename wird nur getrimmt, nicht geprueft
  try { return { wert: feld === 'x' ? xNormal(s) : twitchNormal(s), fehler: '' }; } catch (e) { return { wert: '', fehler: (e as Error).message }; }
}

const jahr = (ms: number | null) => (ms ? new Date(ms).getFullYear() : '–');

export default function FlaggenPflege() {
  const zugang = useZugang();
  const [d, setD] = useState<Antwort | null>(null);
  const [ladeFehler, setLadeFehler] = useState('');
  const [entwurf, setEntwurf] = useState<Record<string, Werte>>({});
  const [gespeichert, setGespeichert] = useState<Record<string, Werte>>({});
  const [zustand, setZustand] = useState<Record<string, Zustand>>({});
  /** Zeilen, die in dieser Sitzung unter ihrer Konto-Id gespeichert wurden (ein Alteintrag unter dem Namen ist danach umgezogen). */
  const [unterId, setUnterId] = useState<Set<string>>(() => new Set());
  const [alleZeigen, setAlleZeigen] = useState(false);
  const auftraege = useRef<Record<string, Auftrag>>({});
  const [filter, setFilter] = useState<Filter>('offen');
  const [region, setRegion] = useState('');
  const [suche, setSuche] = useState('');
  const [seite, setSeite] = useState(0);
  const [twitchZeigen, setTwitchZeigen] = useState(true);
  /** Vorschlaege/Auto-Eintraege, ueber die in dieser Sitzung entschieden wurde ("<id>|<feld>"). */
  const [entschieden, setEntschieden] = useState<Record<string, string>>({});
  const fokusNach = useRef<{ zeile: number; feld: Feld } | null>(null);
  const entwurfRef = useRef(entwurf);
  entwurfRef.current = entwurf;
  const gespeichertRef = useRef(gespeichert);
  gespeichertRef.current = gespeichert;

  useEffect(() => {
    let weg = false;
    fetch('/api/admin/flaggen', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => null) as Antwort | null;
        if (weg) return;
        if (!r.ok || !j?.ok) { setLadeFehler(j?.error ?? `HTTP ${r.status}`); return; }
        const werte: Record<string, Werte> = {};
        for (const z of j.zeilen) werte[z.id] = { land: z.land, x: z.x, twitch: z.twitch, anzeige: z.anzeige };
        setGespeichert(werte);
        setEntwurf(werte);
        setD(j);
      })
      .catch(() => { if (!weg) setLadeFehler('List not reachable'); });
    return () => { weg = true; };
  }, []);

  const liste = useMemo(() => {
    if (!d) return [];
    const q = suche.trim().toLowerCase();
    return d.zeilen.filter((z) => {
      if (!alleZeigen && !kern(z)) return false;
      if (filter === 'offen' && !(z.fehlt.land || z.fehlt.x || z.nurZweit)) return false;
      if (filter === 'land' && !z.fehlt.land) return false;
      if (filter === 'x' && !z.fehlt.x) return false;
      if (filter === 'beide' && !(z.fehlt.land && z.fehlt.x)) return false;
      if (filter === 'vorschlaege' && !FELDER.some((f) => z.vorschlag?.[f] && !entschieden[`${z.id}|${f}`])) return false;
      if (filter === 'auto' && !FELDER.some((f) => z.autoGespeichert?.[f] && !entschieden[`${z.id}|${f}`])) return false;
      if (region && z.region !== region) return false;
      if (q && ![z.name, ...z.namen, z.id].some((n) => n.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [d, filter, region, suche, alleZeigen, entschieden]);
  const finderZahl = useMemo(() => {
    const z = { vorschlaege: 0, auto: 0 };
    for (const r of d?.zeilen ?? []) {
      if (!alleZeigen && !kern(r)) continue;
      if (FELDER.some((f) => r.vorschlag?.[f] && !entschieden[`${r.id}|${f}`])) z.vorschlaege += 1;
      if (FELDER.some((f) => r.autoGespeichert?.[f] && !entschieden[`${r.id}|${f}`])) z.auto += 1;
    }
    return z;
  }, [d, alleZeigen, entschieden]);
  const kernZahl = useMemo(() => (d?.zeilen ?? []).filter(kern).length, [d]);
  const seiten = Math.max(1, Math.ceil(liste.length / JE_SEITE));
  const aufSeite = liste.slice(seite * JE_SEITE, (seite + 1) * JE_SEITE);
  useEffect(() => { setSeite(0); }, [filter, region, suche, alleZeigen]);

  // Was jetzt (nach dem Gespeicherten) noch fehlt.
  const offen = useMemo(() => {
    const z = { land: 0, x: 0, beide: 0, start: { land: 0, x: 0, beide: 0 } };
    for (const r of d?.zeilen ?? []) {
      if (!alleZeigen && !kern(r)) continue;
      const g = gespeichert[r.id];
      const fl = !g?.land;
      const fx = !g?.x;
      if (fl) z.land += 1; if (fx) z.x += 1; if (fl && fx) z.beide += 1;
      if (r.fehlt.land) z.start.land += 1; if (r.fehlt.x) z.start.x += 1; if (r.fehlt.land && r.fehlt.x) z.start.beide += 1;
    }
    return z;
  }, [d, gespeichert, alleZeigen]);

  /*
   * Abschicken. Der Server antwortet sofort ("wartet") und schreibt gesammelt (lib/profilWarteschlange.ts); gespeichert ist eine Zeile erst, wenn die
   * Abfrage unten "gespeichert" meldet. Scheitert das Abschicken (Netz, 5xx), geht es von selbst noch einmal - nach 3, 6, 12 ... Sekunden.
   */
  const abschicken = useCallback(async (id: string) => {
    const a = auftraege.current[id];
    if (!a) return;
    setZustand((s) => ({ ...s, [id]: { art: 'sendet' } }));
    try {
      const r = await fetch('/api/admin/flaggen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a.koerper) });
      const j = await r.json().catch(() => null) as { ok?: boolean; error?: string; version?: number } | null;
      if (r.status === 400) { delete auftraege.current[id]; setZustand((s) => ({ ...s, [id]: { art: 'fehler', text: j?.error ?? 'Invalid' } })); return; }
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      if (auftraege.current[id] === a) { a.version = j.version ?? 0; a.versuche = 0; }
      setZustand((s) => ({ ...s, [id]: { art: 'wartet' } }));
    } catch (f) {
      a.versuche += 1;
      a.naechster = Date.now() + Math.min(60_000, 3000 * 2 ** (a.versuche - 1));
      setZustand((s) => ({ ...s, [id]: { art: 'fehler', text: `${(f as Error).message} - retrying shortly` } }));
    }
  }, []);

  const speichern = useCallback(async (z: Zeile, erzwingen = false) => {
    const e = entwurfRef.current[z.id];
    const g = gespeichertRef.current[z.id];
    if (!e || !g) return;
    const geprueft = Object.fromEntries(FELDER.map((f) => [f, pruefe(f, e[f])])) as Record<Feld, { wert: string; fehler: string }>;
    const fehler = FELDER.map((f) => geprueft[f].fehler).filter(Boolean);
    if (fehler.length) { setZustand((s) => ({ ...s, [z.id]: { art: 'fehler', text: fehler.join(' · ') } })); return; }
    // Nur, was sich geaendert hat - die anderen Felder schickt die Zeile gar nicht, damit sie im Profil bleiben, wie sie sind. Steht ein Wert nur auf
    // einem Zweitkonto, geht er mit (erzwingen), damit er auch unter dem Hauptkonto steht.
    const aenderung: Partial<Werte> = {};
    for (const f of FELDER) if (geprueft[f].wert !== g[f] || ((erzwingen || z.quelle[f]) && geprueft[f].wert && !unterId.has(z.id))) aenderung[f] = geprueft[f].wert;
    if (!Object.keys(aenderung).length) {
      setEntwurf((s) => ({ ...s, [z.id]: { ...g } }));
      setZustand((s) => (s[z.id]?.art === 'fehler' && !auftraege.current[z.id] ? Object.fromEntries(Object.entries(s).filter(([k]) => k !== z.id)) : s));
      return;
    }
    const gesendet: Werte = { ...g };
    for (const f of FELDER) if (f in aenderung) gesendet[f] = aenderung[f]!;
    auftraege.current[z.id] = { koerper: { id: z.id, name: z.speicherName, konten: z.konten, ...aenderung }, gesendet, version: null, versuche: 0, naechster: 0 };
    await abschicken(z.id);
  }, [abschicken, unterId]);

  /*
   * Socials-Finder: Vorschlag uebernehmen / ablehnen, automatisch Eingetragenes bestaetigen / zuruecknehmen. Der Wert geht den gewohnten Weg (speichern,
   * mit Status unter der Zeile); die Entscheidung merkt sich der Finder (POST aktion "markieren"), damit er Abgelehntes nicht wieder bringt.
   */
  const markieren = useCallback((id: string, feld: Feld, wert: string, entscheidung: 'angenommen' | 'abgelehnt' | 'geprueft' | 'rueckgaengig') => {
    setEntschieden((s) => ({ ...s, [`${id}|${feld}`]: entscheidung }));
    void fetch('/api/admin/flaggen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'markieren', id, feld, wert, entscheidung }) }).catch(() => undefined);
  }, []);
  const setzeUndSpeichere = useCallback((z: Zeile, feld: Feld, wert: string) => {
    const neu = { ...(entwurfRef.current[z.id] ?? { land: '', x: '', twitch: '', anzeige: '' }), [feld]: wert };
    entwurfRef.current = { ...entwurfRef.current, [z.id]: neu };
    setEntwurf((s) => ({ ...s, [z.id]: neu }));
    void speichern(z);
  }, [speichern]);

  // Alle 1,5 s: was wartet, beim Server nachfragen; was gescheitert ist, zur Zeit noch einmal schicken.
  useEffect(() => {
    const uhr = setInterval(() => {
      const offen = Object.entries(auftraege.current);
      if (!offen.length) return;
      for (const [id, a] of offen) if (a.version == null && a.naechster && Date.now() >= a.naechster) { a.naechster = 0; void abschicken(id); }
      const fragen = offen.filter(([, a]) => a.version != null).map(([id]) => id);
      if (!fragen.length) return;
      void fetch(`/api/admin/flaggen?status=${fragen.join(',')}`, { cache: 'no-store' }).then(async (r) => {
        const j = await r.json().catch(() => null) as { status?: Record<string, { art: string; version: number; profil?: Partial<Werte> | null; fehler?: string }> } | null;
        if (!r.ok || !j?.status) return;
        for (const id of fragen) {
          const a = auftraege.current[id];
          if (!a || a.version == null) continue;
          const st = j.status[id];
          if (!st) { a.version = null; a.naechster = Date.now(); continue; } // Server kennt sie nicht (Neustart): neu schicken
          if (st.art === 'gespeichert' && st.version >= a.version) {
            delete auftraege.current[id];
            const neu: Werte = { land: st.profil?.land ?? '', x: st.profil?.x ?? '', twitch: st.profil?.twitch ?? '', anzeige: st.profil?.anzeige ?? '' };
            setGespeichert((s) => ({ ...s, [id]: neu }));
            setUnterId((s) => new Set(s).add(id));
            // Steht im Feld noch dasselbe wie beim Absenden, zeigt es jetzt die gespeicherte Form ("@abc" -> "abc", "Polen" -> "PL").
            setEntwurf((s) => {
              const jetzt = s[id];
              if (!jetzt) return s;
              const zeigen = { ...jetzt };
              for (const f of FELDER) if (pruefe(f, jetzt[f]).wert === a.gesendet[f]) zeigen[f] = neu[f];
              return { ...s, [id]: zeigen };
            });
            setZustand((s) => ({ ...s, [id]: { art: 'ok' } }));
          } else if (st.art === 'fehler') {
            setZustand((s) => ({ ...s, [id]: { art: 'fehler', text: st.fehler } }));
          }
        }
      }).catch(() => undefined);
    }, 1500);
    return () => clearInterval(uhr);
  }, [abschicken]);

  // Den Fokus nach einem Seitenwechsel setzen (Enter in der letzten Zeile).
  useEffect(() => {
    const ziel = fokusNach.current;
    if (!ziel) return;
    fokusNach.current = null;
    document.querySelector<HTMLInputElement>(`[data-zeile="${ziel.zeile}"][data-feld="${ziel.feld}"]`)?.focus();
  }, [seite, aufSeite]);

  const taste = (e: KeyboardEvent<HTMLInputElement>, z: Zeile, i: number, feld: Feld) => {
    if (e.key === 'Escape') {
      setEntwurf((s) => ({ ...s, [z.id]: { ...s[z.id], [feld]: gespeichertRef.current[z.id]?.[feld] ?? '' } }));
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    // Enter in einem leeren Flaggenfeld mit Vorschlag: den Vorschlag uebernehmen und stehen bleiben.
    if (feld === 'land' && !entwurfRef.current[z.id]?.land.trim() && z.auto) {
      setEntwurf((s) => ({ ...s, [z.id]: { ...s[z.id], land: z.auto!.land } }));
      return;
    }
    const ziel = i + (e.shiftKey ? -1 : 1);
    if (ziel >= 0 && ziel < aufSeite.length) {
      document.querySelector<HTMLInputElement>(`[data-zeile="${ziel}"][data-feld="${feld}"]`)?.focus();
    } else if (ziel >= aufSeite.length && seite + 1 < seiten) {
      (e.target as HTMLInputElement).blur();
      fokusNach.current = { zeile: 0, feld };
      setSeite(seite + 1);
    } else if (ziel < 0 && seite > 0) {
      (e.target as HTMLInputElement).blur();
      fokusNach.current = { zeile: JE_SEITE - 1, feld };
      setSeite(seite - 1);
    }
  };

  // Verlaesst der Fokus die Zeile, wird sie gespeichert.
  const zeileVerlassen = (e: FocusEvent<HTMLTableRowElement>, z: Zeile) => {
    const nach = e.relatedTarget as Node | null;
    if (nach && e.currentTarget.contains(nach)) return;
    void speichern(z);
  };

  // Nicht mit ungespeicherten Zeilen davon.
  useEffect(() => {
    const warnen = (e: BeforeUnloadEvent) => {
      const ungespeichert = Object.entries(entwurfRef.current).some(([id, w]) => FELDER.some((f) => w[f] !== (gespeichertRef.current[id]?.[f] ?? '')));
      if (ungespeichert || Object.values(zustand).some((s) => s.art === 'sendet' || s.art === 'wartet') || Object.keys(auftraege.current).length > 0) e.preventDefault();
    };
    window.addEventListener('beforeunload', warnen);
    return () => window.removeEventListener('beforeunload', warnen);
  }, [zustand]);

  if (!zugang.laedt && !zugang.admin) {
    return <NurAdmins />;
  }

  const chip = (an: boolean) => `rounded-full px-3 py-1 text-xs font-bold transition ${an ? 'bg-sky-500 text-white' : 'border border-white/10 bg-white/[0.035] backdrop-blur-xl text-white/55 hover:text-white'}`;
  const zelle = 'w-full rounded-md border bg-black/40 px-2 py-1 text-sm text-white outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40';
  const blaettern = (
    <div className="flex items-center gap-2 text-xs text-white/55">
      <button type="button" className="rounded-md border border-white/10 px-2 py-1 disabled:opacity-40" disabled={seite === 0} onClick={() => setSeite(seite - 1)}>←</button>
      <span className="tabular-nums">{seite + 1} / {seiten}</span>
      <button type="button" className="rounded-md border border-white/10 px-2 py-1 disabled:opacity-40" disabled={seite + 1 >= seiten} onClick={() => setSeite(seite + 1)}>→</button>
    </div>
  );

  return (
    <main className="text-white/85">
      <div className="">
        <SeitenKopf className="mb-5" marke={<T>Spieler & Teams</T>} titel={<T>Flags & X accounts</T>}
          text={<T>Important players without a flag or X account, by importance. Tab: next cell · Enter: next row · Esc: undo · saved when you leave the row.</T>}
          rechts={<Link href="/admin/players" className="rounded-lg border border-sky-500/50 px-3 py-2 text-sm font-semibold text-sky-300 hover:bg-sky-500/10">Player Center</Link>} />

        {ladeFehler && <p className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{ladeFehler}</p>}

        {d && (
          <section className="mb-4 grid gap-3 sm:grid-cols-4">
            {([['No flag', offen.land, offen.start.land], ['No X account', offen.x, offen.start.x], ['Neither', offen.beide, offen.start.beide]] as const).map(([titel, jetzt, start]) => (
              <div key={titel} className="rounded-2xl border border-white/10 bg-white/[0.035] backdrop-blur-xl px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40"><T>{titel}</T></p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums text-white">{jetzt}<span className="ml-2 text-xs font-semibold text-white/40">/ {start} <T>while loading</T></span></p>
              </div>
            ))}
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] backdrop-blur-xl px-4 py-3 text-[11px] leading-relaxed text-white/40">
              {d.wichtig} <T>important players</T> · <T>Stand</T> {new Date(d.stand).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}<br />
              <T>already complete</T>: {d.ausgeschlossen.vollstaendig} · excluded: {d.ausgeschlossen.geloescht + d.ausgeschlossen.turnierkonto} (deleted {d.ausgeschlossen.geloescht}, tournament accounts {d.ausgeschlossen.turnierkonto}) · <T>without a known name</T>: {d.ausgeschlossen.ohneName}
            </div>
          </section>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {([['offen', 'All open'], ['land', 'No flag'], ['x', 'No X'], ['beide', 'Neither']] as const).map(([k, titel]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={chip(filter === k)}><T>{titel}</T></button>
          ))}
          <span className="mx-1 h-5 w-px bg-white/[0.07]" />
          <button type="button" onClick={() => setFilter('vorschlaege')} className={chip(filter === 'vorschlaege')} data-filter="vorschlaege" title="Found by the socials finder, but not backed strongly enough - one click accepts or rejects"><T>Suggestions</T> {finderZahl.vorschlaege}</button>
          <button type="button" onClick={() => setFilter('auto')} className={chip(filter === 'auto')} data-filter="auto" title="Entered by the socials finder itself with strong evidence (socials-auto.json) - please check"><T>Auto-saved, please check</T> {finderZahl.auto}</button>
          <span className="mx-1 h-5 w-px bg-white/[0.07]" />
          <button type="button" onClick={() => setRegion('')} className={chip(!region)}><T>All regions</T></button>
          {REGIONEN_REIHE.map((r) => <button key={r} type="button" onClick={() => setRegion(r)} className={chip(region === r)}>{r}</button>)}
          <label className="ml-2 flex items-center gap-1.5 text-xs text-white/55" title="Unticked: only players with at least two FNCS finals/heats or three late FNCS rounds"><input type="checkbox" checked={alleZeigen} onChange={(e) => setAlleZeigen(e.target.checked)} data-alle /> <T>Show all important ones</T></label>
          <label className="ml-2 flex items-center gap-1.5 text-xs text-white/55"><input type="checkbox" checked={twitchZeigen} onChange={(e) => setTwitchZeigen(e.target.checked)} /> Twitch</label>
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Name or Epic ID …" aria-label="Search"
            className="ml-auto w-full max-w-[240px] rounded-lg border border-white/10 bg-white/[0.035] backdrop-blur-xl px-3 py-1.5 text-xs text-white outline-none focus:border-sky-500" />
        </div>

        <div className="mb-2 flex items-center justify-between text-xs text-white/40">
          <span data-zeilenzahl>{liste.length} <T>Zeilen</T> · {alleZeigen ? <T>all important players</T> : <>{kernZahl} <T>Core players (2+ FNCS finals/heats or 3+ late FNCS rounds)</T></>}</span>
          {blaettern}
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.035] backdrop-blur-xl">
          <table className="w-full min-w-[1100px] text-sm" data-flaggen-tabelle>
            <thead className="sticky top-0 z-10 bg-white/[0.035] backdrop-blur-xl">
              <tr className="border-b border-white/10 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
                <th className="px-3 py-2" title="Rank by importance (points)">#</th>
                <th className="px-3 py-2"><T>Spieler</T></th>
                <th className="px-2 py-2">Region</th>
                <th className="px-2 py-2 text-right" title="Finals · heats/semi-finals · late FNCS rounds · cups (final or top)">F · H · R · C</th>
                <th className="px-2 py-2 text-right"><T>Best final</T></th>
                <th className="px-2 py-2 text-right">PR</th>
                <th className="w-[260px] px-2 py-2"><T>Flagge</T></th>
                <th className="w-[220px] px-2 py-2">X</th>
                {twitchZeigen && <th className="w-[170px] px-2 py-2">Twitch</th>}
                <th className="w-[130px] px-2 py-2"><T>Status</T></th>
              </tr>
            </thead>
            <tbody>
              {!d && !ladeFehler && <tr><td colSpan={10} className="px-3 py-8 text-center text-white/40"><T>Wird geladen …</T></td></tr>}
              {d && !aufSeite.length && <tr><td colSpan={10} className="px-3 py-8 text-center text-white/40"><T>Nothing open.</T></td></tr>}
              {aufSeite.map((z, i) => {
                const e = entwurf[z.id] ?? { land: '', x: '', twitch: '', anzeige: '' };
                const g = gespeichert[z.id] ?? { land: '', x: '', twitch: '', anzeige: '' };
                const pl = pruefe('land', e.land);
                const px = pruefe('x', e.x);
                const pt = pruefe('twitch', e.twitch);
                const land = landNach(pl.wert);
                const s = zustand[z.id];
                const geaendert = FELDER.some((f) => e[f] !== g[f]);
                const fertig = !!g.land && !!g.x && (!z.nurZweit || unterId.has(z.id));
                // Unter jeder Zelle: woher der Wert kommt - gespeichert (unter diesem Konto oder einem anderen des Spielers) oder nur getippt.
                const herkunft = (f: Feld) => {
                  if (pruefe(f, e[f]).wert !== g[f] && e[f].trim() !== g[f]) return <p className="mt-0.5 text-[10px] font-semibold text-rose-300" data-herkunft="ungespeichert">● not saved</p>;
                  if (!g[f]) return null;
                  if (z.quelle[f] && !unterId.has(z.id)) return <p className="mt-0.5 truncate text-[10px] text-violet-300" data-herkunft="zweit" title="Saved, but not under this account - saving moves it here">saved at {z.quelle[f]}</p>;
                  return <p className="mt-0.5 text-[10px] text-sky-400/80" data-herkunft="gespeichert">✓ saved</p>;
                };
                const belegListe = (b: Beleg[]) => (
                  <ul className="mt-1 space-y-0.5 text-[10px] leading-snug text-white/55">
                    {b.map((x, k) => <li key={k} className={x.stark ? 'text-emerald-300/90' : ''}>{x.stark ? '● ' : '○ '}{x.url ? <a href={x.url} target="_blank" rel="noreferrer" tabIndex={-1} className="hover:text-sky-300 hover:underline">{x.text}</a> : x.text}</li>)}
                  </ul>
                );
                const zeigeWert = (f: Feld, w: string) => (f === 'x' ? `@${w}` : f === 'land' ? `${w}${landNach(w) ? ` · ${landNach(w)!.en}` : ''}` : w);
                // Unter der Zelle: Vorschlag (nur fuer ein leeres Feld) oder automatisch Eingetragenes zum Pruefen.
                const finder = (f: Feld) => {
                  const schluessel = `${z.id}|${f}`;
                  const a = z.autoGespeichert?.[f];
                  if (a && !entschieden[schluessel] && g[f].toLowerCase() === a.wert.toLowerCase()) {
                    return (
                      <details className="mt-1 rounded border border-amber-500/40 bg-amber-500/[0.06] px-1.5 py-1" data-auto={f}>
                        <summary className="flex cursor-pointer items-center gap-1.5 text-[10px] font-semibold text-amber-300">
                          <span>auto · {zeigeWert(f, a.wert)}  · please check</span>
                          <button type="button" tabIndex={-1} onClick={(ev) => { ev.preventDefault(); markieren(z.id, f, a.wert, 'geprueft'); }} title="Correct - mark as checked" className="ml-auto rounded border border-emerald-500/50 px-1 text-emerald-300 hover:bg-emerald-500/10">✓</button>
                          <button type="button" tabIndex={-1} onClick={(ev) => { ev.preventDefault(); markieren(z.id, f, a.wert, 'rueckgaengig'); setzeUndSpeichere(z, f, ''); }} title="Wrong - clear the field; the finder will not enter this value again" className="rounded border border-rose-500/50 px-1 text-rose-300 hover:bg-rose-500/10">↶</button>
                        </summary>
                        {belegListe(a.belege)}
                      </details>
                    );
                  }
                  const v = z.vorschlag?.[f];
                  if (!v || entschieden[schluessel] || e[f].trim() || g[f]) return null;
                  return (
                    <details className="mt-1 rounded border border-dashed border-white/25 px-1.5 py-1" data-vorschlag={f}>
                      <summary className="flex cursor-pointer items-center gap-1.5 text-[10px] text-white/70">
                        <span className="truncate">Suggestion {zeigeWert(f, v.wert)}</span>
                        <button type="button" tabIndex={-1} onClick={(ev) => { ev.preventDefault(); markieren(z.id, f, v.wert, 'angenommen'); setzeUndSpeichere(z, f, v.wert); }} title="Accept and save" className="ml-auto rounded border border-sky-500/50 px-1 text-sky-300 hover:bg-sky-500/10">✓</button>
                        <button type="button" tabIndex={-1} onClick={(ev) => { ev.preventDefault(); markieren(z.id, f, v.wert, 'abgelehnt'); }} title="Reject - will not be suggested again" className="rounded border border-white/25 px-1 text-white/55 hover:bg-white/[0.08]">✕</button>
                      </summary>
                      {belegListe(v.belege)}
                      {!!v.andere?.length && <p className="mt-1 text-[10px] text-white/40">also possible: {v.andere.map((o) => zeigeWert(f, o.wert)).join(', ')}</p>}
                    </details>
                  );
                };
                return (
                  <tr key={z.id} onBlur={(ev) => zeileVerlassen(ev, z)} data-id={z.id}
                    className={`border-b border-white/10 align-top ${fertig ? 'bg-sky-500/[0.06]' : ''}`}>
                    <td className="px-3 py-2 text-xs font-bold tabular-nums text-white/40" title={`${z.punkte} points`}>{z.rang}</td>
                    <td className="max-w-[230px] px-3 py-2">
                      <a href={`/statistics?spieler=${z.id}`} target="_blank" rel="noreferrer" tabIndex={-1} className={`block truncate font-semibold hover:text-sky-300 ${z.name ? 'text-white' : 'font-mono text-xs text-white/55'}`}>{z.name || `${z.id.slice(0, 12)}… (name unknown)`}</a>
                      {z.namen.length > 0 && <p className="truncate text-[11px] text-white/40" title={z.namen.join(', ')}>{z.namen.join(' · ')}</p>}
                      {z.alterEintrag && <p className="text-[11px] text-violet-300" title="Stored only under the name, without account ID - the stats cannot see it. Saving puts it under the ID.">Alteintrag „{z.alterEintrag}“</p>}
                      {z.anzeige && z.anzeige !== z.name && <p className="truncate text-[11px] text-sky-300/80" title="Maintained display name - shown everywhere instead of the raw name">shows as “{z.anzeige}“</p>}
                      {finder('anzeige')}
                    </td>
                    <td className="px-2 py-2 text-xs text-white/55">{z.region || '–'}<span className="block text-[10px] text-white/30">{jahr(z.letzte)}</span></td>
                    <td className="px-2 py-2 text-right text-xs tabular-nums text-white/70">{z.final} · {z.semi + z.heat} · {z.runde} · {z.cup}</td>
                    <td className="px-2 py-2 text-right text-xs tabular-nums text-white/55">{z.besteFinal ? `#${z.besteFinal}` : '–'}</td>
                    <td className="px-2 py-2 text-right text-xs tabular-nums text-white/55">{z.pr ? `#${z.pr}` : '–'}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <input data-zeile={i} data-feld="land" value={e.land} placeholder={z.auto ? `${z.auto.land}?` : 'Country / DE / DEU'} aria-label={`Flag ${z.name}`}
                          onChange={(ev) => setEntwurf((x) => ({ ...x, [z.id]: { ...e, land: ev.target.value } }))} onKeyDown={(ev) => taste(ev, z, i, 'land')}
                          className={`${zelle} max-w-[130px] ${pl.fehler ? 'border-rose-500' : 'border-white/15'}`} />
                        {!e.land.trim() && z.auto && (
                          <button type="button" tabIndex={-1} data-uebernehmen onClick={() => setEntwurf((x) => ({ ...x, [z.id]: { ...e, land: z.auto!.land } }))}
                            title={`Suggestion from ${QUELLE[z.auto.quelle] ?? z.auto.quelle} (automatic, not checked). Enter in the empty field accepts it too.`}
                            className="flex shrink-0 items-center gap-1 rounded border border-dashed border-white/25 px-1.5 py-0.5 text-[11px] text-white/70 hover:border-sky-500 hover:text-sky-300">
                            <TeamFlagge groesse={12} laender={[z.auto.land]} />{z.auto.land} <T>accept</T>
                          </button>
                        )}
                        {land ? (
                          <span className="flex min-w-0 items-center gap-1.5 text-xs text-white/70" data-vorschau="land"><TeamFlagge groesse={16} laender={[land.code]} /><span className="truncate">{land.code} · {land.en}</span></span>
                        ) : pl.fehler ? <span className="text-xs text-rose-300">{pl.fehler}</span> : z.auto ? <span className="text-[10px] text-white/30">{QUELLE[z.auto.quelle] ?? z.auto.quelle}</span> : null}
                      </div>
                      {herkunft('land')}
                      {finder('land')}
                    </td>
                    <td className="px-2 py-2">
                      <input data-zeile={i} data-feld="x" value={e.x} placeholder="@handle or x.com/…" aria-label={`X ${z.name}`}
                        onChange={(ev) => setEntwurf((x) => ({ ...x, [z.id]: { ...e, x: ev.target.value } }))} onKeyDown={(ev) => taste(ev, z, i, 'x')}
                        className={`${zelle} ${px.fehler ? 'border-rose-500' : 'border-white/15'}`} />
                      {px.fehler ? <p className="mt-0.5 text-[11px] text-rose-300">{px.fehler}</p>
                        : px.wert && px.wert !== e.x.trim() ? <p className="mt-0.5 text-[11px] text-white/40" data-vorschau="x">→ @{px.wert}</p> : null}
                      {herkunft('x')}
                      {finder('x')}
                    </td>
                    {twitchZeigen && (
                      <td className="px-2 py-2">
                        <input data-zeile={i} data-feld="twitch" value={e.twitch} placeholder="Channel" aria-label={`Twitch ${z.name}`}
                          onChange={(ev) => setEntwurf((x) => ({ ...x, [z.id]: { ...e, twitch: ev.target.value } }))} onKeyDown={(ev) => taste(ev, z, i, 'twitch')}
                          className={`${zelle} ${pt.fehler ? 'border-rose-500' : 'border-white/15'}`} />
                        {pt.fehler && <p className="mt-0.5 text-[11px] text-rose-300">{pt.fehler}</p>}
                        {herkunft('twitch')}
                        {finder('twitch')}
                      </td>
                    )}
                    <td className="px-2 py-2 text-xs" data-status={s?.art ?? (geaendert ? 'geaendert' : '')}>
                      {s?.art === 'sendet' ? <span className="text-white/55">sending …</span>
                        : s?.art === 'wartet' ? <span className="text-white/70">queued …</span>
                        : s?.art === 'fehler' ? <span className="text-rose-300" title={s.text}>✕ {s.text}</span>
                          : geaendert ? <span className="text-white/55">not saved</span>
                            : s?.art === 'ok' ? <span className="font-semibold text-sky-300">✓ saved{fertig ? ' · done' : ''}</span>
                              : z.nurZweit ? <button type="button" tabIndex={-1} onClick={() => void speichern(z, true)} title="The values are on another account of the player or in the old entry - move them to the main account here" className="rounded border border-violet-500/50 px-1.5 py-0.5 text-[11px] text-violet-300 hover:bg-violet-500/10">move to main account</button>
                                : <span className="text-white/30">{[z.fehlt.land && 'Flag', z.fehlt.x && 'X'].filter(Boolean).join(' + ')}  missing</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex justify-end">{blaettern}</div>
      </div>
    </main>
  );
}
