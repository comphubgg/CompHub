'use client';

/*
 * Das Logbuch des Chefs - nur auf dem PC des Betreibers (localhost:3200/chef, Zweig "claude/chef").
 *
 * Der Betreiber (31.10.2026): ein KI-Chef arbeitet rund um die Uhr an der Seite weiter, "dokumentiert, was er neu gemacht hat, dass ich
 * mir das durchlesen kann und alles ueber localhost sehe - oeffentlich ist das Neueste erst, wenn ich sage ja". Je Verbesserung eine Karte:
 * warum, was, wo ansehen; darunter Ja / Aendern / Nein. "Ja" bringt sie ueber scripts/chef-uebernahme.mjs auf die echte Seite.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';

interface Eintrag {
  id: string; datum: string; titel: string; bereich?: string; warum: string; was: string;
  ansehen?: string[]; commits?: string[]; groesse?: string; modell?: string; status: string; runde?: number;
  /** Ein Satz, hoechstens 12 Woerter - das liest der Betreiber zuerst (31.10.2026: "ich bin faul, so einfach wie moeglich"). */
  kurz?: string;
}
interface Foto { pfad: string; vorher: string; nachher: string; stellen: number; benannt?: boolean }
interface Entscheidung {
  entscheidung: 'ja' | 'nein' | 'aendern'; notiz?: string; zeit: string;
  uebernahme?: { stand: string; text: string; zeit?: string };
}
interface Status { letzteRunde?: string; macheGerade?: string; naechstes?: string[]; modell?: string }
interface Antwort {
  ok: boolean; error?: string; holfehler?: string | null; logbuch: Eintrag[]; entscheidungen: Record<string, Entscheidung>;
  status: Status | null; pause: boolean;
  bilder?: Record<string, { fotos: Foto[]; zeit: string }>; bilderLaufen?: boolean;
}

const wann = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export default function ChefSeite() {
  const t = useT();
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [fehler, setFehler] = useState('');
  const [hinweis, setHinweis] = useState('');
  const [sendet, setSendet] = useState<string | null>(null);
  const [notizFuer, setNotizFuer] = useState<string | null>(null);
  const [notiz, setNotiz] = useState('');
  /** Vorher/Nachher: welche Karte und welcher Pfad gerade nebeneinander offen ist (Betreiber, 31.10.2026: "sehen, was er aendern wuerde und wieso"). */
  const [vergleich, setVergleich] = useState<{ id: string; pfad: string } | null>(null);
  /** Welche Karten ihre langen Texte zeigen - sonst steht nur der kurze Satz und das Bild da. */
  const [lang, setLang] = useState<Record<string, boolean>>({});
  const [gross, setGross] = useState<string | null>(null);

  const laden = useCallback(() => fetch('/api/chef', { cache: 'no-store' }).then((r) => r.json())
    .then((j: Antwort) => { if (j.ok) { setDaten(j); setFehler(''); } else setFehler(j.error ?? 'Nicht erreichbar.'); })
    .catch(() => setFehler('Der lokale Server antwortet gerade nicht.')), []);
  useEffect(() => { void laden(); const u = setInterval(() => { void laden(); }, 30_000); return () => clearInterval(u); }, [laden]);

  const senden = async (body: Record<string, unknown>, schluessel: string) => {
    setSendet(schluessel); setHinweis('');
    try {
      const j = await fetch('/api/chef', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
      if (!j.ok) setHinweis(j.error ?? 'Ging nicht.');
      else if (j.hinweis) setHinweis(j.hinweis);
      setNotizFuer(null); setNotiz('');
      await laden();
    } catch { setHinweis('Der lokale Server antwortet gerade nicht.'); } finally { setSendet(null); }
  };

  const gruppen = useMemo(() => {
    const e = daten?.entscheidungen ?? {};
    const alle = [...(daten?.logbuch ?? [])].sort((a, b) => String(b.datum).localeCompare(String(a.datum)));
    const offen = alle.filter((x) => x.status === 'wartet' && (!e[x.id] || (e[x.id].entscheidung === 'aendern' && (x.runde ?? 1) > 1 && e[x.id].zeit < x.datum)));
    const inArbeit = alle.filter((x) => x.status === 'wartet' && e[x.id] && !offen.includes(x));
    return {
      offen,
      inArbeit,
      vorschlaege: alle.filter((x) => x.status === 'vorschlag'),
      live: alle.filter((x) => x.status === 'live' || x.status === 'freigabe-haengt'),
      abgelehnt: alle.filter((x) => x.status === 'abgelehnt'),
    };
  }, [daten]);

  if (!daten && !fehler) return <LadeSchirm text={t('Logbuch wird geladen')} />;

  const s = daten?.status;
  const Karte = ({ x, knoepfe }: { x: Eintrag; knoepfe: boolean }) => {
    const ent = daten?.entscheidungen[x.id];
    return (
      <article className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
          <span className="font-mono text-slate-500">{x.id}</span>
          {x.bereich && <span className="rounded-full bg-sky-500/15 px-3 py-0.5 font-semibold text-sky-400">{x.bereich}</span>}
          <span>{wann(x.datum)}</span>
          {x.groesse && <span>· {x.groesse}</span>}
          {x.modell && <span>· {x.modell}</span>}
          {(x.runde ?? 1) > 1 && <span>· <T>Fassung</T> {x.runde}</span>}
        </div>
        <h3 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-100">{x.kurz || x.titel}</h3>
        {x.kurz && <p className="mt-1 text-sm text-slate-500">{x.titel}</p>}
        {/* Ohne kurzen Satz (aeltere Eintraege) steht "Was ist neu" gleich offen da - sonst stuende nur der Titel (Betreiber, 31.10.2026: "ich sehe keinen Text"). */}
        {!x.kurz && <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-300">{x.was}</p>}
        {/* Das markierte Bild zuerst - rot umrandet, was neu ist (scripts/chef-bilder.mjs). Klick vergroessert. */}
        {(daten?.bilder?.[x.id]?.fotos ?? []).map((f) => (
          <figure key={f.nachher} className="mt-5">
            <button type="button" onClick={() => setGross(gross === f.nachher ? null : f.nachher)}
              className={`block w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 text-left ${gross === f.nachher ? '' : 'max-h-[26rem]'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.nachher} alt={x.titel} className="w-full" />
            </button>
            <figcaption className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <span>{f.pfad}</span>
              <span>· {f.stellen ? `${f.stellen} ${t('Stelle(n) rot markiert')}` : t('Keine Stelle markiert - Vergleich unten öffnen')}</span>
              <a href={f.vorher} target="_blank" rel="noreferrer" className="text-sky-400 hover:text-sky-300"><T>Bild vorher</T> ↗</a>
            </figcaption>
          </figure>
        ))}
        {!daten?.bilder?.[x.id] && knoepfe && daten?.bilderLaufen && <p className="mt-4 text-sm text-slate-500"><T>Bild wird gerade gemacht …</T></p>}
        {lang[x.id] ? (
          <div className="mt-4 grid gap-4 text-base leading-relaxed text-slate-300 md:grid-cols-2">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500"><T>Warum</T></p><p className="mt-1 whitespace-pre-line">{x.warum}</p></div>
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500"><T>Was ist neu</T></p><p className="mt-1 whitespace-pre-line">{x.was}</p></div>
          </div>
        ) : (
          <button type="button" onClick={() => setLang({ ...lang, [x.id]: true })} className="mt-3 text-sm font-semibold text-slate-400 hover:text-sky-400"><T>Warum und was genau?</T></button>
        )}
        {!!x.ansehen?.length && (
          <div className="mt-5 flex flex-wrap gap-2">
            {x.ansehen.map((p) => (
              <button key={p} type="button" onClick={() => setVergleich(vergleich?.id === x.id && vergleich.pfad === p ? null : { id: x.id, pfad: p })}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${vergleich?.id === x.id && vergleich.pfad === p ? 'border-sky-500 bg-sky-500/15 text-sky-300' : 'border-zinc-700 text-slate-200 hover:border-sky-500 hover:text-sky-400'}`}>
                <T>Vorher / Nachher</T>: {p}
              </button>
            ))}
          </div>
        )}
        {vergleich?.id === x.id && (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {[
              { titel: t('Vorher - die echte Seite'), url: `https://www.thecomphub.com${vergleich.pfad}` },
              { titel: t('Nachher - die Fassung des Chefs'), url: vergleich.pfad },
            ].map((f) => (
              <div key={f.titel} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
                <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-2 text-sm">
                  <span className="font-bold text-slate-200">{f.titel}</span>
                  <a href={f.url} target="_blank" rel="noreferrer" className="text-sky-400 hover:text-sky-300"><T>Groß öffnen</T> ↗</a>
                </div>
                {/* In Computerbreite (dreifach breit, auf ein Drittel verkleinert) - sonst zeigte der schmale Rahmen die Handy-Ansicht. */}
                <div className="relative h-[36rem] overflow-hidden">
                  <iframe src={f.url} title={f.titel} loading="lazy" className="absolute left-0 top-0 h-[300%] w-[300%] origin-top-left scale-[0.3333] bg-zinc-950" />
                </div>
              </div>
            ))}
          </div>
        )}
        {ent?.notiz && <p className="mt-4 rounded-2xl bg-zinc-800/70 px-4 py-3 text-sm text-slate-300"><span className="font-semibold text-slate-400"><T>Deine Notiz</T>:</span> {ent.notiz}</p>}
        {ent?.uebernahme && (
          <p className={`mt-4 rounded-2xl px-4 py-3 text-sm ${ent.uebernahme.stand === 'live' || ent.uebernahme.stand === 'auf-github' ? 'bg-emerald-500/10 text-emerald-300' : ent.uebernahme.stand === 'laeuft' ? 'bg-sky-500/10 text-sky-300' : 'bg-amber-500/10 text-amber-300'}`}>
            {ent.uebernahme.text}
          </p>
        )}
        {knoepfe && (
          <div className="mt-6">
            {notizFuer === x.id ? (
              <div className="grid gap-3">
                <textarea value={notiz} onChange={(e) => setNotiz(e.target.value)} rows={4} autoFocus
                  placeholder={t('Was soll der Chef anders machen?')}
                  className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-base text-slate-100 outline-none focus:border-sky-500" />
                <div className="flex flex-wrap gap-3">
                  <button type="button" disabled={!notiz.trim() || sendet === x.id} onClick={() => senden({ id: x.id, entscheidung: 'aendern', notiz }, x.id)}
                    className="rounded-full bg-sky-500 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-sky-400 disabled:opacity-50"><T>Notiz an den Chef schicken</T></button>
                  <button type="button" onClick={() => { setNotizFuer(null); setNotiz(''); }}
                    className="rounded-full border border-zinc-700 px-6 py-2.5 text-sm font-semibold text-slate-300 hover:border-zinc-500"><T>Abbrechen</T></button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                <button type="button" disabled={sendet === x.id} onClick={() => senden({ id: x.id, entscheidung: 'ja' }, x.id)}
                  className="rounded-full bg-sky-500 px-7 py-2.5 text-base font-bold text-white shadow-sm transition hover:bg-sky-400 disabled:opacity-50"><T>Ja, online stellen</T></button>
                <button type="button" onClick={() => { setNotizFuer(x.id); setNotiz(''); }}
                  className="rounded-full border border-zinc-600 px-7 py-2.5 text-base font-semibold text-slate-200 transition hover:border-sky-500 hover:text-sky-400"><T>Ändern</T></button>
                <button type="button" disabled={sendet === x.id} onClick={() => senden({ id: x.id, entscheidung: 'nein' }, x.id)}
                  className="rounded-full border border-zinc-700 px-7 py-2.5 text-base font-semibold text-slate-400 transition hover:border-red-500 hover:text-red-400 disabled:opacity-50"><T>Nein</T></button>
              </div>
            )}
          </div>
        )}
      </article>
    );
  };

  const Abschnitt = ({ titel, liste, knoepfe, leer }: { titel: string; liste: Eintrag[]; knoepfe: boolean; leer?: string }) => (
    (liste.length || leer) ? (
      <section className="mt-12">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-sky-500">{titel} <span className="text-slate-500">· {liste.length}</span></h2>
        <div className="mt-4 grid gap-5">
          {liste.length ? liste.map((x) => <Karte key={x.id} x={x} knoepfe={knoepfe} />) : <p className="text-base text-slate-400">{leer}</p>}
        </div>
      </section>
    ) : null
  );

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <section className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-10">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-sky-500/20 blur-[90px]" />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-500"><T>Der Chef</T></p>
              <h1 className="schrift-anzeige mt-2 text-4xl font-extrabold tracking-tight text-slate-100 sm:text-5xl">
                {daten?.pause ? <T>Macht Pause.</T> : <T>Arbeitet an der Seite.</T>}
              </h1>
              <p className="mt-3 max-w-xl text-base text-slate-400">
                <T>Alles hier siehst nur du. Online geht eine Verbesserung erst, wenn du auf „Ja“ drückst.</T>
              </p>
            </div>
            <button type="button" disabled={sendet === 'pause'} onClick={() => senden({ pause: !daten?.pause }, 'pause')}
              className={`rounded-full px-6 py-2.5 text-sm font-bold transition disabled:opacity-50 ${daten?.pause ? 'bg-sky-500 text-white hover:bg-sky-400' : 'border border-zinc-600 text-slate-200 hover:border-amber-500 hover:text-amber-400'}`}>
              {daten?.pause ? <T>Weiterarbeiten lassen</T> : <T>Pause</T>}
            </button>
          </div>
          <div className="relative mt-8 grid gap-4 sm:grid-cols-3">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500"><T>Letzte Runde</T></p><p className="mt-1 text-lg font-semibold text-slate-100">{wann(s?.letzteRunde)}</p></div>
            <div className="sm:col-span-2"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500"><T>Macht gerade</T></p><p className="mt-1 text-lg font-semibold text-slate-100">{s?.macheGerade || '—'}</p></div>
          </div>
          {!!s?.naechstes?.length && (
            <div className="relative mt-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500"><T>Als Nächstes</T></p>
              <ul className="mt-2 grid gap-1 text-base text-slate-300">{s.naechstes.slice(0, 6).map((n) => <li key={n}>· {n}</li>)}</ul>
            </div>
          )}
        </section>

        {(fehler || hinweis || daten?.holfehler) && (
          <p className="mt-6 rounded-2xl bg-amber-500/10 px-5 py-3 text-sm text-amber-300">{fehler || hinweis || t('Neuester Stand ließ sich gerade nicht holen - es gilt der letzte.')}</p>
        )}

        {gruppen.offen.length > 1 && (
          <div className="mt-10 flex flex-wrap items-center gap-4 rounded-3xl border border-sky-500/30 bg-sky-500/10 px-6 py-5">
            <p className="text-base text-slate-200"><span className="font-bold">{gruppen.offen.length}</span> <T>Änderungen warten.</T></p>
            <button type="button" disabled={sendet === 'alle'}
              onClick={() => { if (window.confirm(t('Alle wartenden Änderungen online stellen?'))) void senden({ ids: gruppen.offen.map((x) => x.id) }, 'alle'); }}
              className="rounded-full bg-sky-500 px-7 py-2.5 text-base font-bold text-white shadow-sm transition hover:bg-sky-400 disabled:opacity-50"><T>Alle annehmen</T></button>
            <span className="text-sm text-slate-400"><T>Einzelne vorher mit „Ändern“ oder „Nein“ aussortieren - dann fallen sie hier raus.</T></span>
          </div>
        )}
        <Abschnitt titel={t('Wartet auf dich')} liste={gruppen.offen} knoepfe leer={t('Gerade nichts - der Chef arbeitet an den nächsten Verbesserungen.')} />
        <Abschnitt titel={t('Beim Chef in Arbeit')} liste={gruppen.inArbeit} knoepfe={false} />
        <Abschnitt titel={t('Vorschläge ohne Umbau')} liste={gruppen.vorschlaege} knoepfe={false} />
        <Abschnitt titel={t('Online')} liste={gruppen.live} knoepfe={false} />
        <Abschnitt titel={t('Abgelehnt')} liste={gruppen.abgelehnt} knoepfe={false} />
      </div>
    </main>
  );
}
