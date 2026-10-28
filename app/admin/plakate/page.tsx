'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import T from '@/app/components/T';
import SeitenKopf from '@/app/components/SeitenKopf';
import { useT } from '@/app/components/SprachProvider';
import KartenPlakat from './KartenPlakat';

/*
 * Plakate - ein Bild fuer Spieler, Standings, Finals und Top 5, mit Beitragstext zum Kopieren (Betreiber, 21.10.2026: "ein Plakat fuer alles unter Posts, in meinem Stil").
 *
 * Gezeichnet wird auf dem Server (/api/plakat, nur fuer den Admin); die Zahlen sind die der Cup-Seiten und der Statistik - nichts ist geschaetzt. Hier waehlt man den Cup und die
 * Spieltage (mehrere Tage eines Finales rechnen sich zusammen), den Spieler oder das Team und sieht gleich das Bild. Herunterladen, als Bild kopieren oder den Text zum Beitrag nehmen.
 */

type Art = 'spieler' | 'standings' | 'finale' | 'top5' | 'earnings' | 'karte';
const ARTEN: Array<[Art, string]> = [['spieler', 'Spieler'], ['standings', 'Standings'], ['finale', 'Finale'], ['top5', 'Top 5'], ['earnings', 'Earnings-Zeitstrahl'], ['karte', 'Karte']];

interface Fenster { status: string; begin: number; end?: number; eventId: string; windowId: string; region: string; istFinale: boolean }
interface Cup { id: string; titel: string; regionen: Record<string, Fenster[]> }

const LISTEN: Array<[string, string]> = [
  ['verdienst', 'Preisgeld'], ['elims', 'Eliminierungen'], ['teamElims', 'Team-Eliminierungen'], ['damage', 'Schaden'], ['hits', 'Treffer'], ['headshots', 'Kopftreffer'], ['builds', 'Bauteile'],
];
const REGIONEN = ['', 'EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];

const feld = 'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500';
const beschriftung = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500';
const tag = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function PlakatSeite() {
  const t = useT();
  const [erlaubt, setErlaubt] = useState<boolean | null>(null);
  const [cups, setCups] = useState<Cup[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [art, setArt] = useState<Art>('standings');
  const [suche, setSuche] = useState('');
  const [cupId, setCupId] = useState('');
  const [region, setRegion] = useState('');
  const [tage, setTage] = useState<string[]>([]);
  const [titel, setTitel] = useState('');
  const [stufe, setStufe] = useState('');
  const [datum, setDatum] = useState('');
  const [preis, setPreis] = useState('');
  const [spieler, setSpieler] = useState('');
  const [anzahl, setAnzahl] = useState(10);
  const [liste, setListe] = useState('verdienst');
  const [jahr, setJahr] = useState(new Date().getFullYear());
  const [topRegion, setTopRegion] = useState('EU');

  const [bildUrl, setBildUrl] = useState('');
  const [bildFehler, setBildFehler] = useState('');
  const [bauen, setBauen] = useState(false);
  const [text, setText] = useState('');
  const [meldung, setMeldung] = useState('');
  const blobUrl = useRef('');

  useEffect(() => {
    fetch('/api/auth/check-admin').then((r) => r.json()).then((j) => setErlaubt(j?.isAdmin === true)).catch(() => setErlaubt(false));
  }, []);
  useEffect(() => {
    if (!erlaubt) return;
    fetch('/api/cup-catalog?modus=alle').then((r) => r.json()).then((j) => setCups(Array.isArray(j?.cups) ? j.cups : []))
      .catch(() => setCups([])).finally(() => setLaedt(false));
  }, [erlaubt]);

  // Die Cups mit mindestens einem Spieltag, der schon begonnen hat - zuerst die juengsten.
  const wahl = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const jetzt = Date.now();
    return cups
      .map((c) => ({ c, letzter: Math.max(0, ...Object.values(c.regionen).flat().filter((f) => f.begin <= jetzt).map((f) => f.begin)) }))
      .filter((x) => x.letzter > 0 && (!q || x.c.titel.toLowerCase().includes(q)))
      .sort((a, b) => b.letzter - a.letzter).slice(0, 40).map((x) => x.c);
  }, [cups, suche]);
  const cup = cups.find((c) => c.id === cupId);
  const regionen = cup ? Object.keys(cup.regionen) : [];
  const fenster = useMemo(() => (cup && region ? [...(cup.regionen[region] ?? [])].filter((f) => f.begin <= Date.now()).sort((a, b) => a.begin - b.begin) : []), [cup, region]);

  const cupWaehlen = (c: Cup) => {
    setCupId(c.id); setTitel(c.titel);
    const rs = Object.keys(c.regionen);
    const r = rs.includes('EU') ? 'EU' : rs[0] ?? '';
    setRegion(r); setTage([]); setDatum('');
  };
  const tagUmschalten = (f: Fenster) => {
    const neu = tage.includes(f.windowId) ? tage.filter((x) => x !== f.windowId) : [...tage, f.windowId];
    setTage(neu);
    const erster = fenster.filter((x) => neu.includes(x.windowId)).sort((a, b) => a.begin - b.begin)[0];
    setDatum(erster ? tag(erster.begin) : '');
  };

  const adresse = useMemo(() => {
    if (art === 'karte') return '';
    const q = new URLSearchParams({ art });
    if (art === 'top5') {
      q.set('region', topRegion); q.set('liste', liste); q.set('jahr', String(jahr));
      return `/api/plakat?${q.toString()}`;
    }
    if (art === 'earnings') {
      if (spieler.trim().length < 2) return '';
      q.set('q', spieler.trim());
      return `/api/plakat?${q.toString()}`;
    }
    const f = fenster.find((x) => tage.includes(x.windowId));
    if (!f || !tage.length) return '';
    q.set('event', f.eventId); q.set('windows', tage.join(','));
    if (titel) q.set('titel', titel);
    if (stufe) q.set('stufe', stufe);
    q.set('region', region);
    if (datum) q.set('datum', datum);
    if (preis) q.set('preis', preis);
    if (art === 'spieler' && spieler.trim()) q.set('q', spieler.trim());
    return `/api/plakat?${q.toString()}`;
  }, [art, fenster, tage, titel, stufe, region, datum, preis, spieler, anzahl, liste, jahr, topRegion]);

  const zeichnen = useCallback(async () => {
    if (!adresse) { setBildUrl(''); setText(''); return; }
    setBauen(true); setBildFehler(''); setMeldung('');
    try {
      const [b, tx] = await Promise.all([fetch(adresse), fetch(`${adresse}&format=json`)]);
      const typ = b.headers.get('Content-Type') ?? '';
      if (typ.startsWith('image/')) {
        const blob = await b.blob();
        if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
        blobUrl.current = URL.createObjectURL(blob);
        setBildUrl(blobUrl.current);
      } else {
        const j = await b.json().catch(() => ({} as { fehler?: string }));
        setBildUrl(''); setBildFehler(String((j as { fehler?: string }).fehler ?? t('Das Plakat lässt sich gerade nicht zeichnen.')));
      }
      const tj = await tx.json().catch(() => ({} as { text?: string }));
      setText(String((tj as { text?: string }).text ?? ''));
    } catch { setBildFehler(t('Keine Verbindung zum Server.')); } finally { setBauen(false); }
  }, [adresse, t]);

  // Neu zeichnen, kurz nachdem sich eine Eingabe nicht mehr aendert.
  useEffect(() => {
    const uhr = setTimeout(() => { void zeichnen(); }, 600);
    return () => clearTimeout(uhr);
  }, [zeichnen]);
  useEffect(() => () => { if (blobUrl.current) URL.revokeObjectURL(blobUrl.current); }, []);

  const bildKopieren = async () => {
    try {
      const blob = await (await fetch(bildUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setMeldung(t('Bild kopiert'));
    } catch { setMeldung(t('Kopieren hat nicht geklappt - bitte herunterladen.')); }
    setTimeout(() => setMeldung(''), 2500);
  };
  const textKopieren = async () => {
    try { await navigator.clipboard.writeText(text); setMeldung(t('Text kopiert')); } catch { setMeldung(t('Kopieren hat nicht geklappt.')); }
    setTimeout(() => setMeldung(''), 2500);
  };

  if (erlaubt === false) {
    return <main className="min-h-screen bg-zinc-950 px-4 py-16 text-center text-sm text-slate-500"><T>Dieser Bereich ist dem Adminkonto vorbehalten.</T></main>;
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-[1400px]">
        <SeitenKopf className="mb-6" marke={<T>Posts</T>} titel={<T>Plakate</T>}
          text={<T>Ein Bild für den Beitrag: ein Spieler oder Team mit allen Zahlen, die Standings, das Finale oder die Top 5. Die Zahlen sind die der Cup-Seiten und der Statistik.</T>} />

        <nav className="mb-5 flex flex-wrap gap-1 self-start rounded-full border border-zinc-800 bg-zinc-900 p-1">
          {ARTEN.map(([k, name]) => (
            <button key={k} type="button" onClick={() => setArt(k)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition ${art === k ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-slate-100'}`}>
              <T>{name}</T>
            </button>
          ))}
        </nav>

        {art === 'karte' ? <KartenPlakat /> : (
        <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
          <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            {art === 'earnings' ? (
              <label className="block"><span className={beschriftung}><T>Spieler</T></span>
                <input value={spieler} onChange={(e) => setSpieler(e.target.value)} placeholder={t('Name wie im Profil, z. B. Peterbot')} spellCheck={false} className={feld} />
                <span className="mt-2 block text-[11px] leading-snug text-slate-500"><T>Preisgeld je Jahr seit 2019 aus Epics Auszahlungstabellen und den LAN-Preislisten - dieselben Zahlen wie in der Statistik.</T></span>
              </label>
            ) : art === 'top5' ? (
              <>
                <label className="block"><span className={beschriftung}><T>Liste</T></span>
                  <select value={liste} onChange={(e) => setListe(e.target.value)} className={feld}>
                    {LISTEN.map(([k, n]) => <option key={k} value={k}>{t(n)}</option>)}
                  </select></label>
                <label className="block"><span className={beschriftung}><T>Region</T></span>
                  <select value={topRegion} onChange={(e) => setTopRegion(e.target.value)} className={feld}>
                    {REGIONEN.map((r) => <option key={r} value={r}>{r || t('Welt')}</option>)}
                  </select></label>
                <label className="block"><span className={beschriftung}><T>Jahr</T></span>
                  <input type="number" value={jahr} onChange={(e) => setJahr(Number(e.target.value) || new Date().getFullYear())} className={feld} /></label>
              </>
            ) : (
              <>
                <label className="block"><span className={beschriftung}><T>Cup</T></span>
                  <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Cup suchen …')} spellCheck={false} className={feld} /></label>
                <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                  {laedt && <p className="py-3 text-center text-xs text-slate-500"><T>Wird geladen …</T></p>}
                  {wahl.map((c) => (
                    <button key={c.id} type="button" onClick={() => cupWaehlen(c)}
                      className={`block w-full truncate rounded-lg border px-3 py-1.5 text-left text-xs transition ${cupId === c.id
                        ? 'border-sky-500 bg-sky-500/10 text-sky-300' : 'border-zinc-800 text-slate-300 hover:border-zinc-600'}`}>{c.titel}</button>
                  ))}
                </div>
                {cup && (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {regionen.map((r) => (
                        <button key={r} type="button" onClick={() => { setRegion(r); setTage([]); setDatum(''); }}
                          className={`rounded-full border px-3 py-1 text-[11px] font-bold transition ${region === r
                            ? 'border-sky-500 bg-sky-500 text-white' : 'border-zinc-700 text-slate-400 hover:border-zinc-500'}`}>{r}</button>
                      ))}
                    </div>
                    <div>
                      <span className={beschriftung}><T>Spieltage — mehrere werden zusammengerechnet</T></span>
                      <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                        {fenster.map((f) => (
                          <label key={f.windowId} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition ${tage.includes(f.windowId)
                            ? 'border-sky-500/60 bg-sky-500/10' : 'border-zinc-800 hover:border-zinc-600'}`}>
                            <input type="checkbox" checked={tage.includes(f.windowId)} onChange={() => tagUmschalten(f)} className="accent-sky-500" />
                            <span className="min-w-0 flex-1 truncate">{f.windowId.replace(/^S\d+_/, '').replace(/_[A-Z]{2,4}$/, '')}</span>
                            <span className="text-[10px] text-slate-500">{tag(f.begin)}{f.istFinale ? ' · F' : ''}</span>
                          </label>
                        ))}
                        {!fenster.length && <p className="py-3 text-center text-xs text-slate-500"><T>Noch kein Spieltag gespielt.</T></p>}
                      </div>
                    </div>
                  </>
                )}
                <label className="block"><span className={beschriftung}><T>Titel</T></span>
                  <input value={titel} onChange={(e) => setTitel(e.target.value)} spellCheck={false} className={feld} /></label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block"><span className={beschriftung}><T>Stufe</T></span>
                    <input value={stufe} onChange={(e) => setStufe(e.target.value)} placeholder="Finals" spellCheck={false} className={feld} /></label>
                  <label className="block"><span className={beschriftung}><T>Datum</T></span>
                    <input value={datum} onChange={(e) => setDatum(e.target.value)} spellCheck={false} className={feld} /></label>
                </div>
                <label className="block"><span className={beschriftung}><T>Preisgeld (optional)</T></span>
                  <input value={preis} onChange={(e) => setPreis(e.target.value)} placeholder="$20,000" spellCheck={false} className={feld} /></label>
                {art === 'spieler' && (
                  <label className="block"><span className={beschriftung}><T>Spieler oder Team</T></span>
                    <input value={spieler} onChange={(e) => setSpieler(e.target.value)} placeholder={t('Name tippen — ohne Eingabe der Erste')} spellCheck={false} className={feld} /></label>
                )}
              </>
            )}
          </section>

          <section className="space-y-4">
            <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
              {bildUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={bildUrl} alt="" className={`w-full rounded-xl transition ${bauen ? 'opacity-50' : ''}`} />
                : (
                  <p className="px-6 py-24 text-center text-sm text-slate-500">
                    {bauen ? <T>Plakat wird gezeichnet …</T>
                      : bildFehler || (art === 'top5' || art === 'earnings' ? <T>Das Plakat erscheint hier.</T> : <T>Cup, Region und mindestens einen Spieltag wählen — dann erscheint das Plakat hier.</T>)}
                  </p>
                )}
              {bauen && bildUrl && <span className="absolute right-5 top-5 rounded-full bg-zinc-950/80 px-3 py-1 text-[11px] text-slate-300"><T>zeichnet …</T></span>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a href={bildUrl || undefined} download="comphub-plakat.png" aria-disabled={!bildUrl}
                className={`rounded-full px-5 py-2 text-xs font-bold text-white transition ${bildUrl ? 'bg-sky-500 hover:bg-sky-400' : 'pointer-events-none bg-zinc-700 opacity-50'}`}>
                <T>Herunterladen</T>
              </a>
              <button type="button" onClick={() => void bildKopieren()} disabled={!bildUrl}
                className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-sky-500 hover:text-sky-400 disabled:opacity-40">
                <T>Bild kopieren</T>
              </button>
              {meldung && <span className="text-xs text-slate-400">{meldung}</span>}
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500"><T>Text zum Beitrag</T></h2>
                <button type="button" onClick={() => void textKopieren()} disabled={!text}
                  className="rounded-full border border-zinc-700 px-3 py-1 text-[11px] font-semibold text-slate-300 transition hover:border-sky-500 hover:text-sky-400 disabled:opacity-40">
                  <T>Text kopieren</T>
                </button>
              </div>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} spellCheck={false}
                className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm leading-relaxed text-slate-200 outline-none focus:border-sky-500" />
              <p className="mt-2 text-[11px] text-slate-500"><T>Die X-Konten stehen im Text, wo sie gepflegt sind — vor dem Posten kurz prüfen.</T></p>
            </div>
          </section>
        </div>
        )}
      </div>
    </main>
  );
}
