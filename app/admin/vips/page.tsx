'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

/*
 * Wer auf der Startseite steht.
 *
 * Zwei Listen: oben die Ausgewaehlten in der Reihenfolge, in der sie
 * erscheinen, darunter alle uebrigen VIP-Zugaenge als Vorschlag.
 *
 * Ausdruecklich getrennt vom VIP-Recht selbst: wer hier heraus faellt,
 * bleibt VIP. Das steht auch so auf der Seite, damit niemand das eine mit
 * dem anderen verwechselt.
 */

interface Vip {
  id: string;
  konto?: string;
  name: string;
  twitch?: string;
  x?: string;
  tiktok?: string;
  bild?: string;
  aktiv: boolean;
  reihenfolge: number;
}

/*
 * Die drei Netze, die auf einer Karte stehen koennen.
 *
 * Alle freiwillig: nicht jeder Partner streamt, und wer nur auf X oder
 * TikTok unterwegs ist, gehoert genauso auf die Startseite.
 */
const NETZE: Array<{ schluessel: 'twitch' | 'x' | 'tiktok'; platzhalter: string }> = [
  { schluessel: 'twitch', platzhalter: 'Twitch-Konto' },
  { schluessel: 'x', platzhalter: 'X-Konto' },
  { schluessel: 'tiktok', platzhalter: 'TikTok-Konto' },
];

interface Kandidat { konto: string; name: string; art: 'schluessel' | 'konto' }

export default function VipsSeite() {
  const t = useT();
  const [vips, setVips] = useState<Vip[]>([]);
  const [kandidaten, setKandidaten] = useState<Kandidat[]>([]);
  const [erlaubt, setErlaubt] = useState(true);
  const [laedt, setLaedt] = useState(true);
  const [stand, setStand] = useState('');
  const [suche, setSuche] = useState('');
  /** Zu welchem Eintrag gerade ein Bild gewaehlt wird. */
  const dateiFeld = useRef<HTMLInputElement | null>(null);
  const [bildFuer, setBildFuer] = useState<string | null>(null);

  const holen = useCallback(async () => {
    try {
      const r = await fetch('/api/vips?alle=1', { cache: 'no-store' });
      if (r.status === 403) { setErlaubt(false); return; }
      const j = await r.json();
      setVips(Array.isArray(j?.vips) ? j.vips : []);
      setKandidaten(Array.isArray(j?.kandidaten) ? j.kandidaten : []);
    } catch { setErlaubt(false); }
    finally { setLaedt(false); }
  }, []);

  useEffect(() => {
    let weg = false;
    void Promise.resolve().then(() => { if (!weg) return holen(); });
    return () => { weg = true; };
  }, [holen]);

  const melden = useCallback((text: string, dauer = 2500) => {
    setStand(text);
    if (dauer) window.setTimeout(() => setStand(''), dauer);
  }, []);

  async function senden(koerper: Record<string, unknown>, sagen = t('gespeichert')) {
    setStand(t('speichert …'));
    try {
      const r = await fetch('/api/vips', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(koerper),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) { melden(j?.fehler ?? t('nicht gespeichert'), 5000); return false; }
      setVips(Array.isArray(j?.vips) ? j.vips : vips);
      await holen();
      melden(sagen);
      return true;
    } catch (e) { melden((e as Error).message, 5000); return false; }
  }

  async function entfernen(v: Vip) {
    if (!window.confirm(
      `${t('Von der Startseite nehmen? Der VIP-Zugang bleibt davon unberührt.')}`
      + `\n\n${v.name}`)) return;
    setStand(t('speichert …'));
    try {
      const r = await fetch(`/api/vips?id=${encodeURIComponent(v.id)}`,
        { method: 'DELETE' });
      const j = await r.json().catch(() => null);
      if (!r.ok) { melden(j?.fehler ?? t('nicht gespeichert'), 5000); return; }
      await holen();
      melden(t('von der Startseite genommen'));
    } catch (e) { melden((e as Error).message, 5000); }
  }

  async function bildHochladen(datei: File) {
    if (!bildFuer) return;
    setStand(t('lädt hoch …'));
    try {
      const daten = new FormData();
      daten.append('id', bildFuer);
      daten.append('bild', datei);
      const r = await fetch('/api/vips', { method: 'POST', body: daten });
      const j = await r.json().catch(() => null);
      if (!r.ok) { melden(j?.fehler ?? t('nicht gespeichert'), 5000); return; }
      await holen();
      melden(t('Bild gesetzt'));
    } catch (e) { melden((e as Error).message, 5000); }
    finally { setBildFuer(null); }
  }

  const feld = 'rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm '
    + 'text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500';

  if (laedt) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16 text-sm text-slate-500">
        <T>Wird geladen …</T>
      </main>
    );
  }

  if (!erlaubt) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16">
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6
                      text-sm text-slate-400">
          <T>Diese Seite ist dem Admin vorbehalten.</T>
        </p>
      </main>
    );
  }

  const gefiltert = kandidaten.filter((k) =>
    !suche.trim() || k.name.toLowerCase().includes(suche.trim().toLowerCase()));

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-2 flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold text-slate-100"><T>VIPs</T></h1>
        <span className="text-xs text-slate-600">
          {vips.filter((v) => v.aktiv).length} <T>auf der Startseite</T>
        </span>
        {stand && (
          <span className={`text-xs ${/nicht|Fehler|error/i.test(stand)
            ? 'text-rose-400' : 'text-emerald-400'}`}>{stand}</span>
        )}
        <Link href="/admin" className="ml-auto text-xs text-slate-500 transition
                                       hover:text-sky-400">
          ← <T>zum Verwaltungsbereich</T>
        </Link>
      </div>

      <p className="mb-8 text-[11px] leading-relaxed text-slate-600">
        <T>Wer hier steht, erscheint unten auf der Startseite — mit Bild, Namen
        und den Konten, die du hinterlegst: Twitch, X oder TikTok, einzeln oder
        zusammen. Das ist eine eigene Auswahl: ein VIP bleibt VIP, auch wenn er
        hier nicht steht, und wer hier heraus fällt, verliert nichts.</T>
      </p>

      {/* ------------------------------------------- Auf der Startseite */}
      <h2 className="mb-3 text-[10px] font-semibold uppercase
                     tracking-[0.16em] text-slate-500">
        <T>Auf der Startseite</T>
      </h2>

      {!vips.length ? (
        <p className="mb-8 rounded-xl border border-dashed border-zinc-800
                      px-4 py-8 text-center text-[11px] text-slate-600">
          <T>Noch niemand ausgewählt — der Bereich erscheint dann gar nicht
          erst auf der Startseite.</T>
        </p>
      ) : (
        <ul className="mb-10 space-y-2">
          {vips.map((v, i) => (
            <li key={v.id}
              className={`flex flex-wrap items-center gap-3 rounded-xl border
                          bg-zinc-900/40 p-3 ${v.aktiv
                ? 'border-zinc-800' : 'border-zinc-900 opacity-50'}`}>

              {/* Das Bild - ein Klick tauscht es aus. */}
              <button type="button"
                onClick={() => { setBildFuer(v.id); dateiFeld.current?.click(); }}
                title={t('Bild wählen oder austauschen')}
                className="group relative h-16 w-16 shrink-0 overflow-hidden
                           rounded-lg border border-zinc-800 bg-zinc-900">
                {v.bild ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={v.bild} alt="" style={{ objectPosition: 'center 25%' }}
                    className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full place-items-center text-xl
                                   text-zinc-700">
                    {v.name.trim().charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="absolute inset-0 hidden place-items-center
                                 bg-black/60 text-[9px] uppercase tracking-wider
                                 text-sky-300 group-hover:grid">
                  <T>Bild</T>
                </span>
              </button>

              <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
                <input defaultValue={v.name}
                  onBlur={(e) => {
                    if (e.target.value.trim() === v.name) return;
                    void senden({ id: v.id, name: e.target.value });
                  }}
                  placeholder={t('Angezeigter Name')}
                  className={`${feld} py-1`} />
                {/*
                  * Ein Feld je Netz. Leer heisst: steht nicht auf der Karte -
                  * eine Karte mit nur einem Konto ist der Normalfall.
                  */}
                <div className="flex flex-wrap gap-1.5">
                  {NETZE.map((n) => (
                    <input key={n.schluessel} defaultValue={v[n.schluessel] ?? ''}
                      onBlur={(e) => {
                        if (e.target.value.trim() === (v[n.schluessel] ?? '')) return;
                        void senden({ id: v.id, [n.schluessel]: e.target.value });
                      }}
                      placeholder={t(n.platzhalter)}
                      title={t('Leer lassen, wenn es nicht auf die Karte soll')}
                      className={`${feld} min-w-[120px] flex-1 py-1 text-[13px]`} />
                  ))}
                </div>
              </div>

              {/* Reihenfolge - ein Platz auf oder ab. */}
              <span className="flex shrink-0 items-center gap-0.5">
                <button type="button" disabled={i === 0}
                  onClick={() => senden({ id: v.id, richtung: 'hoch' },
                    t('verschoben'))}
                  title={t('nach vorn')}
                  className="px-1.5 text-slate-600 transition hover:text-sky-400
                             disabled:opacity-20">↑</button>
                <button type="button" disabled={i === vips.length - 1}
                  onClick={() => senden({ id: v.id, richtung: 'runter' },
                    t('verschoben'))}
                  title={t('nach hinten')}
                  className="px-1.5 text-slate-600 transition hover:text-sky-400
                             disabled:opacity-20">↓</button>
              </span>

              <button type="button"
                onClick={() => senden({ id: v.id, aktiv: !v.aktiv },
                  v.aktiv ? t('ausgeblendet') : t('auf der Startseite'))}
                className={`shrink-0 rounded-lg border px-3 py-1.5 text-[11px]
                            font-semibold transition ${v.aktiv
                  ? 'border-emerald-700/60 text-emerald-400 hover:border-emerald-500'
                  : 'border-zinc-700 text-slate-400 hover:border-sky-500 hover:text-sky-400'}`}>
                {v.aktiv ? <T>sichtbar</T> : <T>ausgeblendet</T>}
              </button>

              {(() => {
                // Der Pfeil oeffnet das erste hinterlegte Konto - zum
                // schnellen Nachsehen, ob der Name stimmt.
                const adressen: Record<string, string> = {
                  twitch: 'https://twitch.tv/', x: 'https://x.com/',
                  tiktok: 'https://tiktok.com/@',
                };
                const n = NETZE.find((x) => v[x.schluessel]);
                if (!n) return null;
                return (
                  <a href={`${adressen[n.schluessel]}${v[n.schluessel]}`}
                    target="_blank" rel="noreferrer" title={t('Kanal öffnen')}
                    className="shrink-0 text-[11px] text-slate-600 transition
                               hover:text-sky-400">↗</a>
                );
              })()}

              <button type="button" onClick={() => entfernen(v)}
                className="shrink-0 rounded-lg border border-zinc-800 px-3 py-1.5
                           text-[11px] font-semibold text-slate-600 transition
                           hover:border-rose-600 hover:text-rose-400">
                <T>entfernen</T>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Das versteckte Dateifeld - eines fuer alle Zeilen. */}
      <input ref={dateiFeld} type="file" accept="image/*" className="hidden"
        onChange={(e) => {
          const d = e.target.files?.[0];
          e.target.value = '';
          if (d) void bildHochladen(d);
        }} />

      {/* ------------------------------------------------- Wer noch könnte */}
      <h2 className="mb-2 text-[10px] font-semibold uppercase
                     tracking-[0.16em] text-slate-500">
        <T>Alle VIP-Zugänge</T>
      </h2>
      <p className="mb-3 text-[11px] text-slate-600">
        <T>Ein Klick stellt jemanden auf die Startseite. Bild und Twitch-Konto
        trägst du danach oben ein.</T>
      </p>

      <input value={suche} onChange={(e) => setSuche(e.target.value)}
        placeholder={t('Namen suchen …')}
        className={`${feld} mb-3 w-full`} />

      <div className="mb-8 flex flex-wrap gap-2">
        {gefiltert.map((k) => (
          <button key={`${k.art}-${k.konto}`} type="button"
            onClick={() => senden({ name: k.name, konto: k.konto },
              t('auf die Startseite gestellt'))}
            className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-1.5
                       text-xs text-slate-300 transition hover:border-sky-500
                       hover:text-sky-400">
            {k.name}
            <span className="ml-2 text-[9px] uppercase tracking-wider
                             text-slate-700">
              {k.art === 'schluessel' ? <T>Schlüssel</T> : <T>Konto</T>}
            </span>
          </button>
        ))}
        {!gefiltert.length && (
          <p className="text-[11px] text-slate-600">
            <T>Niemand mehr übrig — alle VIP-Zugänge stehen schon oben.</T>
          </p>
        )}
      </div>

      {/* ------------------------------------------------- Ohne Konto */}
      <h2 className="mb-2 text-[10px] font-semibold uppercase
                     tracking-[0.16em] text-slate-500">
        <T>Jemand ohne Zugang</T>
      </h2>
      <p className="mb-3 text-[11px] text-slate-600">
        <T>Ein Kooperationspartner braucht kein Konto im Werkzeug, um auf der
        Startseite zu stehen.</T>
      </p>
      <form className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const name = String(f.get('name') ?? '').trim();
          if (!name) return;
          if (await senden({
            name,
            twitch: String(f.get('twitch') ?? ''),
            x: String(f.get('x') ?? ''),
            tiktok: String(f.get('tiktok') ?? ''),
          }, t('auf die Startseite gestellt'))) {
            (e.target as HTMLFormElement).reset();
          }
        }}>
        <input name="name" placeholder={t('Name')} className={`${feld} flex-1`} />
        {NETZE.map((n) => (
          <input key={n.schluessel} name={n.schluessel}
            placeholder={t(n.platzhalter)} className={`${feld} w-40`} />
        ))}
        <button type="submit"
          className="rounded-lg bg-sky-500 px-5 text-sm font-semibold text-white
                     transition hover:bg-sky-400">
          <T>hinzufügen</T>
        </button>
      </form>
    </main>
  );
}
