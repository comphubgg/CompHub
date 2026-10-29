'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

/*
 * Der POV-Bereich der VIPs (Betreiber, 27./29.10.2026: "die VIPs sollen auch die POV-Seite sehen, einfach nur wie sie funktioniert + Pros anmelden,
 * deren POV sie dann sehen + den Bot auf ihren eigenen Discord einladen und einstellen"). Daten: /api/pov/vip (lib/povVip, lib/discordGilden).
 */

interface Pro { ident: string; name: string; bild: string | null; live: boolean; fuerAlle: boolean; eingeladen: boolean }
interface Einladung { code: string; name: string; erstellt: number; offen: boolean; angenommen: { name: string; zeit: number } | null; link: string }
interface Gilde { id: string; name: string; kanal: string; melden: boolean; eingerichtet: boolean; fehler: string; kanaele: Array<{ id: string; name: string }> }
interface Antwort {
  ok: boolean; error?: string; name: string; pros: Pro[]; einladungen: Einladung[]; discordVerbunden: boolean;
  einladung: string | null; gilden: Gilde[]; discordFehler: string;
}

const karte = 'rounded-xl border border-zinc-800 bg-zinc-900/40 p-5';

export default function VipPov() {
  const t = useT();
  const [d, setD] = useState<Antwort | null>(null);
  const [fehler, setFehler] = useState('');
  const [hinweis, setHinweis] = useState('');
  const [neuName, setNeuName] = useState('');
  const [arbeitet, setArbeitet] = useState(false);
  const [kopiert, setKopiert] = useState('');

  const laden = useCallback(() => {
    fetch('/api/pov/vip', { cache: 'no-store' }).then((r) => r.json())
      .then((j: Antwort) => { if (j?.ok) { setD(j); setFehler(''); } else setFehler(j?.error ? t(j.error) : t('Nicht ladbar')); })
      .catch(() => setFehler(t('Nicht ladbar')));
  }, []);
  useEffect(() => {
    laden();
    const id = window.setInterval(laden, 30_000);
    return () => window.clearInterval(id);
  }, [laden]);

  const senden = async (body: Record<string, unknown>, erfolg?: string) => {
    setArbeitet(true); setHinweis('');
    try {
      const j = await fetch('/api/pov/vip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
      if (!j?.ok) { setFehler(j?.error ? t(j.error) : t('Das hat nicht geklappt.')); return null; }
      setFehler(''); if (erfolg) setHinweis(erfolg);
      laden();
      return j;
    } catch { setFehler(t('Das hat nicht geklappt.')); return null; } finally { setArbeitet(false); }
  };
  const kopieren = (text: string, id: string) => {
    void navigator.clipboard.writeText(text).then(() => { setKopiert(id); window.setTimeout(() => setKopiert(''), 3000); }).catch(() => undefined);
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-[1300px] px-4 py-6">
        <section className="relative mb-5 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-[0_10px_30px_rgba(15,23,42,.18)] sm:p-8">
          <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-sky-500/25 blur-3xl" />
          <span aria-hidden className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-indigo-500/15 blur-3xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-500">POV</p>
              <h1 className="mt-1 truncate text-3xl font-extrabold text-white sm:text-4xl">{d?.name ?? ''}
                <span className="ml-3 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 align-middle text-xs font-semibold text-amber-400">VIP</span>
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                <T>Hier siehst du, wie Pro-POVs funktionieren, meldest deine Pros an und lädst den CompHub-Bot auf deinen Discord ein.</T>
              </p>
            </div>
            <Link href="/streams" className="rounded-full bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400">
              <T>POVs ansehen</T>
            </Link>
          </div>
        </section>

        {fehler && <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{fehler}</p>}
        {hinweis && <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-300">{hinweis}</p>}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-5">
            {/* ------------------------------------------- So funktioniert es */}
            <section className={karte}>
              <h2 className="text-sm font-semibold"><T>So funktionieren Pro-POVs</T></h2>
              <ol className="mt-3 space-y-2.5 text-xs leading-relaxed text-slate-400">
                <li><b className="text-slate-200"><T>1. Pro anmelden.</T></b> <T>Erstelle rechts einen Einladungslink und schick ihn deinem Pro. Sobald er ihn öffnet, hat er sein eigenes Pro-Konto und ist angemeldet - ohne Registrieren. Anmeldename und Passwort stehen in seinem Dashboard, und du darfst sein POV ab dann sehen.</T></li>
                <li><b className="text-slate-200"><T>2. Der Pro geht live.</T></b> <T>In seinem Dashboard (oder im Windows-Programm) teilt er sein Spielfenster. Das Bild geht nicht über Twitch und ist nicht öffentlich: nur die VIPs, die er freigibt, sehen es. Kein Stream-Sniping, keine Fremden.</T></li>
                <li><b className="text-slate-200"><T>3. Du schaust zu.</T></b> <T>Auf der Streams-Seite steht sein POV im Ordner „Pro-POVs“ - einzeln oder in der Multiview neben anderen Streams. Das Namensschild stellst du dort in den Einstellungen ein.</T></li>
                <li><b className="text-slate-200"><T>4. Meldung auf deinem Discord.</T></b> <T>Lade unten den CompHub-Bot auf deinen Server ein und wähle einen Kanal: geht einer deiner Pros live, schreibt der Bot es dort hinein.</T></li>
              </ol>
            </section>

            {/* ------------------------------------------- Deine Pros */}
            <section className={karte}>
              <h2 className="text-sm font-semibold"><T>Deine Pros</T></h2>
              <p className="mt-1 text-xs text-slate-500"><T>Pros, die dich ihr POV sehen lassen - über deine Einladung oder weil sie dich freigegeben haben.</T></p>
              {!d && !fehler && <p className="mt-4 text-sm text-slate-500"><T>Wird geladen …</T></p>}
              {d && d.pros.length === 0 && (
                <p className="mt-4 rounded-lg border border-dashed border-zinc-700 px-4 py-6 text-center text-sm text-slate-500">
                  <T>Noch kein Pro lässt dich zusehen. Lade rechts deinen ersten Pro ein.</T>
                </p>
              )}
              {d && d.pros.length > 0 && (
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {d.pros.map((p) => (
                    <li key={p.ident} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                      {p.bild
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={p.bild} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover object-top" />
                        : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-zinc-800 text-lg font-bold text-slate-400">{p.name.slice(0, 1).toUpperCase()}</span>}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-100">{p.name}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px]">
                          {p.live
                            ? <span className="flex items-center gap-1.5 font-semibold text-red-400"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />LIVE</span>
                            : <span className="text-slate-500">offline</span>}
                          {p.eingeladen && <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-sky-400"><T>über deine Einladung</T></span>}
                          {p.fuerAlle && <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-slate-400"><T>für alle sichtbar</T></span>}
                        </p>
                      </div>
                      {p.live && (
                        <Link href="/streams" className="rounded-md bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-400"><T>Ansehen</T></Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ------------------------------------------- Discord */}
            <section className={karte}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold"><T>CompHub-Bot auf deinem Discord</T></h2>
                  <p className="mt-1 max-w-xl text-xs text-slate-500">
                    <T>Der Bot meldet in einem Kanal deiner Wahl, wenn einer deiner Pros live geht. Das Bild selbst siehst du auf CompHub - Discord gibt Bots keine Bildschirmübertragung.</T>
                  </p>
                </div>
                {d?.einladung && (
                  <a href={d.einladung} target="_blank" rel="noreferrer"
                    className="rounded-full bg-indigo-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-400">
                    <T>Bot einladen</T>
                  </a>
                )}
              </div>
              {d && !d.discordVerbunden && (
                <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200">
                  <T>Damit CompHub weiß, welche Server dir gehören, verbinde dein Discord-Konto unter</T>{' '}
                  <Link href="/account" className="font-semibold underline underline-offset-2">Account</Link>.
                </p>
              )}
              {d?.discordFehler && <p className="mt-3 text-xs text-amber-300">{d.discordFehler}</p>}
              {d?.discordVerbunden && d.gilden.length === 0 && (
                <p className="mt-4 rounded-lg border border-dashed border-zinc-700 px-4 py-5 text-center text-xs text-slate-500">
                  <T>Auf keinem Server, den du verwaltest, ist der Bot. Lade ihn mit dem Knopf oben ein und lade diese Seite danach neu.</T>
                </p>
              )}
              {d && d.gilden.length > 0 && (
                <ul className="mt-4 space-y-3">
                  {d.gilden.map((g) => (
                    <li key={g.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-slate-100">{g.name}</p>
                        {g.fehler === 'rechte' && <span className="text-[11px] text-amber-300"><T>Dem Bot fehlt das Recht „Kanäle verwalten“.</T></span>}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                        <label className="flex items-center gap-2 text-slate-400">
                          <T>Kanal für Live-Meldungen</T>
                          <select value={g.kanal} disabled={arbeitet}
                            onChange={(e) => void senden({ aktion: 'kanal', gilde: g.id, kanal: e.target.value }, t('Gespeichert'))}
                            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-slate-200 outline-none focus:border-sky-500">
                            <option value="">{t('— aus —')}</option>
                            {g.kanaele.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
                          </select>
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 text-slate-300">
                          <input type="checkbox" checked={g.melden} disabled={arbeitet || !g.kanal} className="accent-sky-500"
                            onChange={(e) => void senden({ aktion: 'melden', gilde: g.id, an: e.target.checked }, t('Gespeichert'))} />
                          <T>Meine Pros hier melden</T>
                        </label>
                        <button type="button" disabled={arbeitet || !g.kanal}
                          onClick={() => void senden({ aktion: 'test', gilde: g.id }, t('Testmeldung gesendet - schau in deinen Kanal.'))}
                          className="rounded-md border border-zinc-700 px-3 py-1.5 text-slate-300 transition hover:border-sky-500 hover:text-sky-400 disabled:opacity-40">
                          <T>Testmeldung</T>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* ------------------------------------------- Pro einladen */}
          <aside className="space-y-5">
            <section className={karte}>
              <h2 className="text-sm font-semibold"><T>Pro anmelden</T></h2>
              <p className="mt-1 text-xs text-slate-500">
                <T>Wer den Link öffnet, ist sofort in seinem eigenen Pro-Konto - ohne Registrieren und jedes Mal im selben. Ungeöffnet verfällt er nach 14 Tagen; ziehst du ihn zurück, öffnet er nichts mehr.</T>
              </p>
              <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); void senden({ aktion: 'einladen', name: neuName }, t('Link erstellt - kopier ihn und schick ihn deinem Pro.')).then((j) => { if (j) setNeuName(''); }); }}>
                <input value={neuName} onChange={(e) => setNeuName(e.target.value)} maxLength={40} placeholder={t('Name des Pros (nur für dich)')}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
                <button type="submit" disabled={arbeitet}
                  className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:opacity-50">
                  <T>Link erstellen</T>
                </button>
              </form>
              {d && d.einladungen.length > 0 && (
                <ul className="mt-5 space-y-2.5">
                  {d.einladungen.map((e) => (
                    <li key={e.code} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold text-slate-200">{e.name || t('Ohne Namen')}</span>
                        {e.angenommen
                          ? <span className="text-emerald-400"><T>angenommen von</T> {e.angenommen.name}</span>
                          : e.offen ? <span className="text-sky-400"><T>offen</T></span> : <span className="text-slate-500"><T>abgelaufen</T></span>}
                      </div>
                      {e.offen && (
                        <div className="mt-2 flex items-center gap-2">
                          <input readOnly value={e.link} onFocus={(ev) => ev.currentTarget.select()}
                            className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-slate-400" />
                          <button type="button" onClick={() => kopieren(e.link, e.code)}
                            className="rounded-md border border-zinc-700 px-2.5 py-1 text-slate-300 transition hover:border-sky-500 hover:text-sky-400">
                            {kopiert === e.code ? t('Kopiert') : t('Kopieren')}
                          </button>
                          <button type="button" disabled={arbeitet} onClick={() => void senden({ aktion: 'zurueck', code: e.code })}
                            className="rounded-md px-2 py-1 text-slate-500 transition hover:text-rose-400">
                            <T>Zurückziehen</T>
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
