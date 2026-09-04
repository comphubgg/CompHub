'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

// Der Bildvorrat.
//
// Zwei Ordner mit klarer Bedeutung: alles zu einem Turnier unter "turniere",
// alles zu einem einzelnen Profi unter "spieler". Wer hier ein Logo, eine
// Siegergrafik oder einen Streamausschnitt ablegt, findet es beim Bauen
// eines Beitrags wieder.
//
// Bewusst schlicht: Ordner waehlen oder anlegen, Dateien hineinziehen,
// fertig. Umbenennen, Sortieren und Verschieben gibt es nicht - dafuer ist
// der Datei-Explorer da, und jede zusaetzliche Schaltflaeche hier waere eine
// Bedienung mehr, die niemand braucht.

interface Datei { name: string; pfad: string; bytes: number; geaendert: number }
interface Ordner { bereich: string; name: string; dateien: Datei[] }

const groesse = (b: number) => (b > 1048576
  ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

export default function AssetsVerwaltung() {
  const t = useT();
  const [istAdmin, setIstAdmin] = useState<boolean | null>(null);
  const [turniere, setTurniere] = useState<Ordner[]>([]);
  const [spieler, setSpieler] = useState<Ordner[]>([]);
  const [bereich, setBereich] = useState<'turniere' | 'spieler'>('turniere');
  const [ordner, setOrdner] = useState('');
  const [neuerOrdner, setNeuerOrdner] = useState('');
  const [laedtHoch, setLaedtHoch] = useState(false);
  const [meldung, setMeldung] = useState('');
  const [ueberZiel, setUeberZiel] = useState(false);
  const dateiFeld = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch('/api/auth/check-admin')
      .then((r) => r.json())
      .then((j) => setIstAdmin(j.isAdmin === true))
      .catch(() => setIstAdmin(false));
  }, []);

  const laden = useCallback(async () => {
    try {
      const j = await (await fetch('/api/assets', { cache: 'no-store' })).json();
      setTurniere(j?.turniere ?? []);
      setSpieler(j?.spieler ?? []);
    } catch { /* dann bleibt die Liste leer */ }
  }, []);

  useEffect(() => { void Promise.resolve().then(laden); }, [laden]);

  const liste = bereich === 'turniere' ? turniere : spieler;
  const aktiv = liste.find((o) => o.name === ordner);

  /**
   * Dateien ablegen.
   *
   * Der Ordner kommt aus der Auswahl oder aus dem Feld daneben - beides
   * fuehrt zum selben Ergebnis, und ein neuer Ordner entsteht einfach beim
   * ersten Hochladen. Ein Anlegen-Knopf waere ein Schritt mehr fuer nichts.
   */
  const hochladen = useCallback(async (dateien: FileList | File[]) => {
    const ziel = (neuerOrdner.trim() || ordner).trim();
    if (!ziel) { setMeldung(t('Erst einen Ordner wählen oder benennen.')); return; }
    if (!dateien.length) return;

    setLaedtHoch(true); setMeldung('');
    try {
      const form = new FormData();
      form.append('bereich', bereich);
      form.append('ordner', ziel);
      for (const d of Array.from(dateien)) form.append('dateien', d);

      const r = await fetch('/api/assets', { method: 'POST', body: form });
      const j = await r.json();
      if (!r.ok) { setMeldung(j?.error ?? 'nicht hochgeladen'); return; }

      setMeldung(`${j.abgelegt.length} ${t('abgelegt')}`
        + (j.abgelehnt.length ? ` — ${j.abgelehnt.join(', ')}` : ''));
      setOrdner(ziel); setNeuerOrdner('');
      await laden();
    } catch (e) { setMeldung((e as Error).message); }
    finally { setLaedtHoch(false); }
  }, [bereich, ordner, neuerOrdner, laden, t]);

  const entfernen = useCallback(async (d: Datei) => {
    if (!window.confirm(`${d.name} ${t('endgültig löschen?')}`)) return;
    await fetch(`/api/assets?pfad=${encodeURIComponent(d.pfad)}`, { method: 'DELETE' });
    await laden();
  }, [laden, t]);

  if (istAdmin === false) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-16 text-center">
        <p className="text-sm text-slate-500">
          <T>Dieser Bereich ist dem Adminkonto vorbehalten.</T>
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-6 flex flex-wrap items-baseline gap-4">
          <h1 className="text-2xl font-bold"><T>Bildvorrat</T></h1>
          <Link href="/admin"
            className="text-xs text-slate-500 transition hover:text-sky-400">
            ← <T>Zurück zum Dashboard</T>
          </Link>
        </div>

        {/* -------------------------------------------------- Zwei Bereiche */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {([['turniere', 'Turniere'], ['spieler', 'Spieler']] as
            Array<['turniere' | 'spieler', string]>).map(([w, titel]) => (
            <button key={w} onClick={() => { setBereich(w); setOrdner(''); }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold
                          transition ${bereich === w
                ? 'border-sky-500 bg-sky-500/15 text-sky-400'
                : 'border-zinc-800 text-slate-500 hover:text-slate-300'}`}>
              <T>{titel}</T>
              <span className="ml-1.5 font-normal tabular-nums text-slate-600">
                {(w === 'turniere' ? turniere : spieler).length}
              </span>
            </button>
          ))}
          <span className="ml-auto text-[11px] text-slate-600">
            <T>png, jpg, webp, gif, svg — bis 20 MB je Datei</T>
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
          {/* ------------------------------------------------- Die Ordner */}
          <div className="space-y-1.5">
            {liste.map((o) => (
              <button key={o.name} onClick={() => setOrdner(o.name)}
                className={`flex w-full items-center gap-2 rounded-lg border
                            px-3 py-2 text-left text-xs transition ${ordner === o.name
                  ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                  : 'border-zinc-800 text-slate-400 hover:border-zinc-700'}`}>
                <span className="truncate">{o.name}</span>
                <span className="ml-auto tabular-nums text-slate-600">
                  {o.dateien.length}
                </span>
              </button>
            ))}
            {!liste.length && (
              <p className="rounded-lg border border-zinc-800 px-3 py-4
                            text-center text-[11px] text-slate-600">
                <T>Noch kein Ordner. Unten einen Namen eintragen und Dateien
                hineinziehen.</T>
              </p>
            )}

            <input value={neuerOrdner}
              onChange={(e) => setNeuerOrdner(e.target.value)}
              placeholder={bereich === 'turniere'
                ? t('neuer Ordner, z. B. EWC 2026')
                : t('neuer Ordner, z. B. Peterbot')}
              className="mt-2 w-full rounded-lg border border-zinc-800
                         bg-zinc-900/80 px-3 py-1.5 text-xs text-slate-100
                         outline-none placeholder:text-slate-600
                         focus:border-sky-500" />
          </div>

          {/* -------------------------------------------------- Der Inhalt */}
          <div>
            {/* Das Ablagefeld */}
            <div
              onDragOver={(e) => { e.preventDefault(); setUeberZiel(true); }}
              onDragLeave={() => setUeberZiel(false)}
              onDrop={(e) => {
                e.preventDefault(); setUeberZiel(false);
                void hochladen(e.dataTransfer.files);
              }}
              onClick={() => dateiFeld.current?.click()}
              className={`mb-4 cursor-pointer rounded-xl border-2 border-dashed
                          px-6 py-8 text-center transition ${ueberZiel
                ? 'border-sky-500 bg-sky-500/10' : 'border-zinc-800 hover:border-zinc-700'}`}>
              <p className="text-sm text-slate-400">
                {laedtHoch ? <T>wird hochgeladen …</T>
                  : <T>Dateien hierher ziehen oder klicken</T>}
              </p>
              <p className="mt-1 text-[11px] text-slate-600">
                {(neuerOrdner.trim() || ordner)
                  ? <><T>Ziel</T>: {bereich}/{neuerOrdner.trim() || ordner}</>
                  : <T>Erst einen Ordner wählen oder benennen.</T>}
              </p>
              <input ref={dateiFeld} type="file" multiple hidden
                accept=".png,.jpg,.jpeg,.webp,.gif,.svg"
                onChange={(e) => {
                  if (e.target.files) void hochladen(e.target.files);
                  e.target.value = '';
                }} />
            </div>

            {meldung && (
              <p className="mb-3 text-[11px] text-sky-400/90">{meldung}</p>
            )}

            {aktiv?.dateien.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {aktiv.dateien.map((d) => (
                  <div key={d.pfad}
                    className="group overflow-hidden rounded-lg border
                               border-zinc-800 bg-zinc-900/40">
                    <div className="relative aspect-video bg-zinc-950">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={d.pfad} alt={d.name} loading="lazy"
                        className="h-full w-full object-contain" />
                      <button onClick={() => void entfernen(d)}
                        title={t('löschen')}
                        className="absolute right-1 top-1 rounded bg-black/70 px-1.5
                                   py-0.5 text-[10px] text-rose-400 opacity-0
                                   transition group-hover:opacity-100
                                   hover:bg-rose-950">
                        ✕
                      </button>
                    </div>
                    <div className="px-2 py-1.5">
                      <p className="truncate text-[11px] text-slate-300">{d.name}</p>
                      <p className="text-[10px] text-slate-600">{groesse(d.bytes)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-10 text-center text-xs text-slate-600">
                {ordner ? <T>Dieser Ordner ist leer.</T>
                  : <T>Links einen Ordner wählen.</T>}
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
