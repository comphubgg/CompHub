'use client';

import { useCallback, useEffect, useState } from 'react';
import SpielerPlatzhalter, { PlatzhalterRund } from '@/app/components/SpielerPlatzhalter';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import OrgPov from './OrgPov';

/*
 * Team (Betreiber, 14.10.2026): der Zugang einer Organisation. Ein Konto, das der Admin einer Org zugeordnet hat, pflegt hier den Kader dieser einen Org -
 * Spieler hinzufuegen (per Namenssuche), Rolle und Beitritt setzen, Fotos zuteilen, Spieler entfernen - und die Farbe der Org waehlen. Der Admin sieht
 * jede Org mit /org?org=<Kennung>. Alles gilt fuer alle: es ist dieselbe Liste wie unter Statistik > Organisationen.
 */

type Rolle = 'pro' | 'academy' | 'creator';
interface Spieler { epicId: string | null; name: string; seit: string | null; rolle: Rolle; x: string | null; bild?: string | null }
interface Org { id: string; name: string; logo: string | null; farbe?: string | null; spieler: Spieler[] }
interface Treffer { epicId: string; anzeige: string; bild: string | null; land: string | null }

const ROLLEN: Array<[Rolle, string]> = [['pro', 'Pro Roster'], ['academy', 'Academy Roster'], ['creator', 'Content Creator']];
const FARBEN = ['#0ea5e9', '#6366f1', '#a855f7', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#94a3b8'];

const feld = 'w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500';

export default function OrgSeite() {
  const t = useT();
  const [org, setOrg] = useState<Org | null>(null);
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [frage, setFrage] = useState<number | null>(null);
  const [orgParam, setOrgParam] = useState('');

  useEffect(() => { setOrgParam(new URLSearchParams(window.location.search).get('org') ?? ''); }, []);

  const antwort = useCallback((j: { ok?: boolean; error?: string; org?: Org; fotos?: Record<string, string> }) => {
    if (j.ok && j.org) { setOrg(j.org); setFotos(j.fotos ?? {}); setFehler(null); return true; }
    setMeldung(j.error ?? 'Das hat nicht geklappt.');
    return false;
  }, []);

  useEffect(() => {
    let weg = false;
    void (async () => {
      try {
        const r = await fetch(`/api/org-konto${orgParam ? `?org=${encodeURIComponent(orgParam)}` : ''}`, { cache: 'no-store' });
        const j = await r.json();
        if (weg) return;
        if (j.ok) antwort(j); else setFehler(j.error ?? 'Das hat nicht geklappt.');
      } catch { if (!weg) setFehler('Die Ablage antwortet gerade nicht.'); }
      if (!weg) setLaedt(false);
    })();
    return () => { weg = true; };
  }, [orgParam, antwort]);

  const senden = async (koerper: Record<string, unknown>) => {
    setMeldung(null);
    try {
      const r = await fetch('/api/org-konto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...koerper, org: orgParam || undefined }) });
      return antwort(await r.json());
    } catch { setMeldung('Die Ablage antwortet gerade nicht.'); return false; }
  };

  // ------------------------------------------------------------------ Suche
  const [name, setName] = useState('');
  const [treffer, setTreffer] = useState<Treffer[]>([]);
  useEffect(() => {
    const q = name.trim().toLowerCase();
    if (q.length < 2) { const zu = setTimeout(() => setTreffer([]), 0); return () => clearTimeout(zu); }
    let weg = false;
    const uhr = setTimeout(() => {
      void fetch(`/api/szene-stats?ansicht=suche&q=${encodeURIComponent(q)}`).then((r) => r.json())
        .then((j) => { if (!weg) setTreffer(Array.isArray(j?.spieler) ? j.spieler : []); })
        .catch(() => { if (!weg) setTreffer([]); });
    }, 300);
    return () => { weg = true; clearTimeout(uhr); };
  }, [name]);

  const hinzu = async (p: { name: string; epicId?: string }) => {
    if (await senden({ aktion: 'spieler-neu', name: p.name, epicId: p.epicId })) { setName(''); setTreffer([]); }
  };

  const fotoHoch = async (index: number, s: Spieler, datei: File) => {
    if (!org) return;
    setMeldung(null);
    const form = new FormData();
    form.set('datei', datei); form.set('name', s.name); if (orgParam) form.set('org', orgParam);
    try {
      const j = await (await fetch('/api/org-konto', { method: 'POST', body: form })).json();
      if (!j.ok) { setMeldung(j.error ?? 'Das Foto hat nicht geklappt.'); return; }
      await senden({ aktion: 'spieler-aendern', index, name: s.name, bild: j.bild });
    } catch { setMeldung('Die Ablage antwortet gerade nicht.'); }
  };

  const farbe = org?.farbe ?? '#0ea5e9';

  if (laedt) return <main className="grid min-h-[60vh] place-items-center text-sm text-slate-400"><T>Lädt …</T></main>;
  if (fehler || !org) {
    return (
      <div className="min-h-screen bg-zinc-950"><main className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="text-3xl font-extrabold text-white"><T>Dein Team</T></h1>
        <p className="mt-4 text-sm text-slate-400">{t(fehler ?? 'Dieses Konto verwaltet keine Organisation.')}</p>
        <Link href="/account" className="mt-6 inline-block rounded-full bg-sky-500 px-5 py-2 text-sm font-bold text-white hover:bg-sky-400"><T>Zum Konto</T></Link>
      </main></div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950"><main className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6" style={{ ['--org' as string]: farbe }}>
      {/* Kopf: Logo, Name, Farbe */}
      <section className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-[0_10px_30px_rgba(15,23,42,.18)] sm:p-8">
        <span aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-30 blur-3xl" style={{ background: farbe }} />
        <div className="relative flex flex-wrap items-center gap-5">
          {org.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logo} alt="" className="h-20 w-20 rounded-2xl bg-zinc-950/60 object-contain p-2" />
          ) : <span className="grid h-20 w-20 place-items-center rounded-2xl text-3xl font-black text-white" style={{ background: farbe }}>{org.name.slice(0, 1)}</span>}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: farbe }}><T>Dein Team</T></p>
            <h1 className="truncate text-3xl font-extrabold text-white sm:text-4xl">{org.name}</h1>
            <p className="mt-1 text-sm text-slate-400">{t('{n} Spieler im Kader').replace('{n}', String(org.spieler.length))}</p>
          </div>
          <div className="w-full sm:w-auto">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400"><T>Farbe der Organisation</T></p>
            <div className="flex flex-wrap items-center gap-2">
              {FARBEN.map((f) => (
                <button key={f} type="button" aria-label={f} onClick={() => void senden({ aktion: 'farbe', farbe: f })}
                  className={`h-7 w-7 rounded-full border-2 transition hover:scale-110 ${farbe.toLowerCase() === f ? 'border-white' : 'border-transparent'}`} style={{ background: f }} />
              ))}
              <input type="color" value={farbe} aria-label={t('Eigene Farbe')} onChange={(e) => void senden({ aktion: 'farbe', farbe: e.target.value })}
                className="h-7 w-9 cursor-pointer rounded-md border border-zinc-700 bg-zinc-950 p-0.5" />
            </div>
          </div>
        </div>
      </section>

      {meldung && <p role="alert" className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">{t(meldung)}</p>}

      {/* Die POVs des Teams - das Wichtigste der Org (Betreiber, 20.10.2026): einstellen, wer sie sehen darf */}
      <OrgPov orgParam={orgParam} farbe={farbe} />

      {/* Spieler hinzufuegen */}
      <section className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-[0_10px_30px_rgba(15,23,42,.18)]">
        <h2 className="text-lg font-bold text-white"><T>Spieler hinzufügen</T></h2>
        <p className="mt-1 text-xs text-slate-400"><T>Tippe den Namen - das Konto wird für dich gesucht.</T></p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Spielername')} className={`${feld} mt-3`} />
        {name.trim().length >= 2 && (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {treffer.map((x) => (
              <li key={x.epicId}>
                <button type="button" onClick={() => void hinzu({ name: x.anzeige, epicId: x.epicId })}
                  className="flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-2 text-left transition hover:border-sky-500">
                  {x.bild
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={x.bild} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    : <PlatzhalterRund name={x.anzeige} groesse={40} eckig />}
                  <span className="min-w-0 flex-1 truncate text-sm font-bold uppercase text-slate-100">{x.anzeige}</span>
                  <span className="text-xs font-bold" style={{ color: farbe }}>+ <T>Hinzufügen</T></span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => void hinzu({ name: name.trim() })}
                className="flex w-full items-center gap-3 rounded-xl border border-dashed border-zinc-700 p-2 text-left text-sm text-slate-300 transition hover:border-sky-500">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-zinc-800 text-lg font-bold text-slate-400">+</span>
                <span className="min-w-0 flex-1 truncate">{t('Ohne Konto hinzufügen: {name}').replace('{name}', name.trim().toUpperCase())}</span>
              </button>
            </li>
          </ul>
        )}
      </section>

      {/* Kader nach Rolle */}
      {ROLLEN.map(([rolle, titel]) => {
        const reihe = org.spieler.map((s, i) => ({ s, i })).filter((x) => x.s.rolle === rolle);
        if (reihe.length === 0) return null;
        return (
          <section key={rolle} className="mt-8">
            <h2 className="mb-3 flex items-center gap-3 text-xl font-extrabold text-white">
              <span className="h-5 w-1 rounded-full" style={{ background: farbe }} /> {t(titel)}
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-bold text-slate-400">{reihe.length}</span>
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {reihe.map(({ s, i }) => {
                const bild = (s.epicId && fotos[s.epicId]) || s.bild || null;
                return (
                  <li key={`${s.epicId ?? s.name}-${i}`} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-[0_8px_24px_rgba(15,23,42,.14)]">
                    <div className="foto-dunkel relative h-44 bg-zinc-800">
                      {bild
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={bild} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: '50% 12%' }} />
                        : <SpielerPlatzhalter name={s.name} />}
                      <span aria-hidden className="foto-unten absolute inset-0 opacity-80" />
                      <span className="absolute bottom-3 left-4 right-4 truncate text-xl font-extrabold uppercase tracking-wide text-white drop-shadow">{s.name}</span>
                    </div>
                    <div className="grid gap-3 p-4 text-xs">
                      <label className="grid gap-1 text-slate-400"><T>Rolle</T>
                        <select value={s.rolle} onChange={(e) => void senden({ aktion: 'spieler-aendern', index: i, name: s.name, rolle: e.target.value })} className={feld}>
                          {ROLLEN.map(([r, n]) => <option key={r} value={r}>{t(n)}</option>)}
                        </select>
                      </label>
                      <label className="grid gap-1 text-slate-400"><T>Dabei seit</T>
                        <input type="date" defaultValue={s.seit ?? ''} onBlur={(e) => { if ((e.target.value || null) !== s.seit) void senden({ aktion: 'spieler-aendern', index: i, name: s.name, seit: e.target.value }); }} className={feld} />
                      </label>
                      <label className="grid gap-1 text-slate-400"><T>X-Konto</T>
                        <input defaultValue={s.x ?? ''} placeholder="@name" onBlur={(e) => { if ((e.target.value || null) !== s.x) void senden({ aktion: 'spieler-aendern', index: i, name: s.name, x: e.target.value }); }} className={feld} />
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        {!s.epicId && (
                          <label className="cursor-pointer rounded-full border border-zinc-700 px-3 py-1.5 font-bold text-slate-300 transition hover:border-sky-500 hover:text-sky-500">
                            <T>Foto hochladen</T>
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const d = e.target.files?.[0]; if (d) void fotoHoch(i, s, d); e.target.value = ''; }} />
                          </label>
                        )}
                        {s.epicId && (
                          <Link href={`/statistics?spieler=${encodeURIComponent(s.name)}`} className="rounded-full border border-zinc-700 px-3 py-1.5 font-bold text-slate-300 transition hover:border-sky-500 hover:text-sky-500"><T>Profil ansehen</T></Link>
                        )}
                        <span className="flex-1" />
                        {frage === i ? (
                          <span className="flex items-center gap-2">
                            <button type="button" onClick={() => { setFrage(null); void senden({ aktion: 'spieler-weg', index: i, name: s.name }); }}
                              className="rounded-full bg-red-500 px-3 py-1.5 font-bold text-white hover:bg-red-400"><T>Wirklich entfernen</T></button>
                            <button type="button" onClick={() => setFrage(null)} className="px-2 py-1.5 font-bold text-slate-400 hover:text-white"><T>Abbrechen</T></button>
                          </span>
                        ) : (
                          <button type="button" onClick={() => setFrage(i)} className="rounded-full px-3 py-1.5 font-bold text-red-400 transition hover:bg-red-500/10"><T>Entfernen</T></button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </main></div>
  );
}
