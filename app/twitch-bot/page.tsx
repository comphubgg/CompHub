'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import T from '@/app/components/T';
import LadeSchirm from '@/app/components/LadeSchirm';
import VipVorhang from '@/app/overlays/VipVorhang';
import { useZugang } from '@/app/lib/zugang';
import { useT } from '@/app/components/SprachProvider';

/*
 * Das Dashboard des CompHub-Twitch-Bots (lib/twitchBot, /api/twitch-bot). Wie Fossabot: Befehle ("!webseite" -> eigene Antwort) und Regeln (Woerter ->
 * Nachricht loeschen, Timeout oder Bann). Laeuft ueber Twitch-Webhooks, rund um die Uhr, ohne den PC daheim.
 */

interface Befehl { name: string; antwort: string; cooldownSek: number; nurMods: boolean }
interface Regel { woerter: string[] | string; aktion: 'loeschen' | 'timeout' | 'bann'; dauerSek: number; grund: string }
interface Antwort {
  ok: boolean; error?: string; admin: boolean; bot: { login: string } | null;
  kanaele: Array<{ id: string; login: string; name: string }>;
  einstellung: { id: string; login: string; an: boolean; befehle: Befehl[]; regeln: Regel[] } | null;
  moderator: boolean | null;
}

const karte = 'rounded-xl border border-zinc-800 bg-zinc-900/40 p-5';
const feld = 'rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-500';

export default function TwitchBot() {
  const t = useT();
  const zugang = useZugang();
  const [d, setD] = useState<Antwort | null>(null);
  const [kanal, setKanal] = useState('');
  const [befehle, setBefehle] = useState<Befehl[]>([]);
  const [regeln, setRegeln] = useState<Regel[]>([]);
  const [fehler, setFehler] = useState('');
  const [hinweis, setHinweis] = useState('');
  const [arbeitet, setArbeitet] = useState(false);
  const darf = zugang.admin || (zugang.vip && zugang.rechte.includes('twitchbot'));

  const laden = useCallback(() => {
    fetch(`/api/twitch-bot${kanal ? `?kanal=${encodeURIComponent(kanal)}` : ''}`, { cache: 'no-store' }).then((r) => r.json())
      .then((j: Antwort) => {
        if (!j?.ok) { setFehler(j?.error ? t(j.error) : t('Nicht ladbar')); return; }
        setD(j); setFehler('');
        setBefehle(j.einstellung?.befehle ?? []);
        setRegeln((j.einstellung?.regeln ?? []).map((r) => ({ ...r, woerter: Array.isArray(r.woerter) ? r.woerter.join(', ') : r.woerter })));
      })
      .catch(() => setFehler(t('Nicht ladbar')));
  }, [kanal]);
  useEffect(() => { if (darf) laden(); }, [darf, laden]);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('bot') === 'verbunden') setHinweis(t('Bot-Konto verbunden.'));
    if (p.get('fehler')) setFehler(t('Das Bot-Konto ließ sich nicht verbinden.'));
  }, []);

  const senden = async (body: Record<string, unknown>, erfolg: string) => {
    setArbeitet(true); setHinweis('');
    try {
      const j = await fetch('/api/twitch-bot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
      if (!j?.ok) setFehler(j?.error ? t(j.error) : t('Das hat nicht geklappt.'));
      else { setFehler(''); setHinweis(erfolg); laden(); }
    } catch { setFehler(t('Das hat nicht geklappt.')); }
    setArbeitet(false);
  };

  if (zugang.laedt) return <LadeSchirm />;
  if (!darf && zugang.vip) return <VipVorhang titel="Der Twitch-Bot ist für dein Konto noch nicht freigeschaltet." text="CompHub schaltet es je VIP frei - schreib uns kurz auf Discord." />;
  if (!darf) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 text-center text-slate-100">
        <div className="max-w-md">
          <h1 className="text-xl font-bold"><T>Nur für VIPs</T></h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500"><T>Den CompHub-Bot gibt es für VIPs, deren Kanal CompHub freigeschaltet hat.</T></p>
          <Link href="/sign-in" className="mt-6 inline-block rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400"><T>Zur Anmeldung</T></Link>
        </div>
      </main>
    );
  }

  const e = d?.einstellung ?? null;
  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-[1100px] px-4 py-6">
        <section className="relative mb-5 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
          <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-violet-500/25 blur-3xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-400">Twitch</p>
              <h1 className="mt-1 text-3xl font-extrabold text-white sm:text-4xl">CompHub Bot</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-400"><T>Befehle wie !webseite mit deiner eigenen Antwort und Regeln gegen Beleidigungen - rund um die Uhr, auch wenn dein PC aus ist.</T></p>
            </div>
            {d && d.kanaele.length > 1 && (
              <select value={e?.id ?? ''} onChange={(ev) => setKanal(ev.target.value)} className={feld}>
                {d.kanaele.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            )}
          </div>
        </section>

        {fehler && <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{fehler}</p>}
        {hinweis && <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-300">{hinweis}</p>}

        {d?.admin && (
          <section className={`${karte} mb-5`}>
            <h2 className="text-sm font-semibold"><T>Bot-Konto (Admin)</T></h2>
            <p className="mt-1 text-xs text-slate-500">
              {d.bot ? <><T>Verbunden als</T> <b className="text-slate-200">{d.bot.login}</b>.</> : <T>Noch nicht verbunden. Melde dich bei Twitch mit dem Bot-Konto an (nicht mit deinem eigenen Kanal).</T>}
            </p>
            <a href="/api/twitch-bot/verbinden" className="mt-3 inline-block rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400">
              {d.bot ? <T>Neu verbinden</T> : <T>Bot-Konto verbinden</T>}
            </a>
          </section>
        )}

        {d && !d.kanaele.length && (
          <p className={`${karte} text-sm text-slate-400`}><T>Für dein Konto ist noch kein Twitch-Kanal freigeschaltet. Der Admin trägt ihn unter Twitch-Statistik ein.</T></p>
        )}

        {e && (
          <>
            <section className={`${karte} mb-5`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{e.login}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {d?.moderator === false && d.bot
                      ? <span className="text-amber-300"><T>Der Bot ist in deinem Kanal noch kein Moderator. Schreib in deinen Chat:</T> <code className="rounded bg-zinc-950 px-1.5 py-0.5">/mod {d.bot.login}</code></span>
                      : e.an ? <T>Der Bot ist an und hört in deinem Chat mit.</T> : <T>Der Bot ist aus.</T>}
                  </p>
                </div>
                <button type="button" disabled={arbeitet || !d?.bot} onClick={() => void senden({ aktion: 'an', kanal: e.id, an: !e.an }, e.an ? t('Bot ausgeschaltet.') : t('Bot eingeschaltet.'))}
                  className={`rounded-full px-5 py-2 text-sm font-bold transition disabled:opacity-40 ${e.an ? 'bg-emerald-500 text-white hover:bg-emerald-400' : 'border border-zinc-700 text-slate-300 hover:border-violet-500'}`}>
                  {e.an ? <T>An</T> : <T>Aus</T>}
                </button>
              </div>
            </section>

            {/* ------------------------------------------- Befehle */}
            <section className={`${karte} mb-5`}>
              <h2 className="text-sm font-semibold"><T>Befehle</T></h2>
              <p className="mt-1 text-xs text-slate-500"><T>Schreibt jemand den Befehl in den Chat, antwortet der Bot mit deinem Text. Platzhalter:</T> <code>{'{user}'}</code> <T>(wer gefragt hat)</T>, <code>{'{args}'}</code> <T>(was nach dem Befehl steht)</T>.</p>
              <p className="mt-1 text-xs text-slate-500"><T>Ein Befehl beginnt mit !, $ oder ? - zum Beispiel !website oder $discord. Mit / geht es nicht, das gehört Twitch.</T></p>
              {befehle.length > 0 && (
                <div className="mt-4 hidden gap-2 px-3 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-slate-500 md:grid md:grid-cols-[160px_minmax(0,1fr)_120px_110px_70px]">
                  <span><T>Befehl</T></span><span><T>Antwort des Bots</T></span><span title={t('So viele Sekunden muss zwischen zwei Antworten auf denselben Befehl liegen.')}><T>Pause (Sek.)</T></span><span /><span />
                </div>
              )}
              <div className="mt-2 space-y-2">
                {befehle.map((b, i) => (
                  <div key={i} className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 md:grid-cols-[160px_minmax(0,1fr)_120px_110px_70px]">
                    <input value={b.name} onChange={(ev) => setBefehle(befehle.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))} placeholder="!webseite" className={feld} />
                    <input value={b.antwort} onChange={(ev) => setBefehle(befehle.map((x, j) => (j === i ? { ...x, antwort: ev.target.value } : x)))} placeholder={t('Antwort des Bots')} className={feld} />
                    <input type="number" min={0} max={3600} value={b.cooldownSek} onChange={(ev) => setBefehle(befehle.map((x, j) => (j === i ? { ...x, cooldownSek: Number(ev.target.value) } : x)))} title={t('Pause in Sekunden')} className={feld} />
                    <label className="flex items-center gap-1.5 text-xs text-slate-400"><input type="checkbox" checked={b.nurMods} className="accent-violet-500" onChange={(ev) => setBefehle(befehle.map((x, j) => (j === i ? { ...x, nurMods: ev.target.checked } : x)))} /><T>nur Mods</T></label>
                    <button type="button" onClick={() => setBefehle(befehle.filter((_, j) => j !== i))} className="text-xs text-slate-500 hover:text-rose-400"><T>Entfernen</T></button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setBefehle([...befehle, { name: '!', antwort: '', cooldownSek: 10, nurMods: false }])}
                className="mt-3 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-slate-300 transition hover:border-violet-500"><T>Befehl hinzufügen</T></button>
            </section>

            {/* ------------------------------------------- Regeln */}
            <section className={`${karte} mb-5`}>
              <h2 className="text-sm font-semibold"><T>Regeln</T></h2>
              <p className="mt-1 text-xs text-slate-500"><T>Steht eines der Wörter in einer Nachricht, greift der Bot ein. Moderatoren und dich selbst lässt er in Ruhe.</T> <T>Die Dauer gilt nur für den Timeout.</T></p>
              {regeln.length > 0 && (
                <div className="mt-4 hidden gap-2 px-3 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-slate-500 md:grid md:grid-cols-[minmax(0,1fr)_170px_120px_minmax(0,0.8fr)_70px]">
                  <span><T>Wörter</T></span><span><T>Was der Bot tut</T></span><span><T>Dauer (Sek.)</T></span><span><T>Grund</T></span><span />
                </div>
              )}
              <div className="mt-2 space-y-2">
                {regeln.map((r, i) => (
                  <div key={i} className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 md:grid-cols-[minmax(0,1fr)_170px_120px_minmax(0,0.8fr)_70px]">
                    <input value={Array.isArray(r.woerter) ? r.woerter.join(', ') : r.woerter} onChange={(ev) => setRegeln(regeln.map((x, j) => (j === i ? { ...x, woerter: ev.target.value } : x)))} placeholder={t('Wörter, mit Komma getrennt')} className={feld} />
                    <select value={r.aktion} onChange={(ev) => setRegeln(regeln.map((x, j) => (j === i ? { ...x, aktion: ev.target.value as Regel['aktion'] } : x)))} className={feld}>
                      <option value="loeschen">{t('Nachricht löschen')}</option>
                      <option value="timeout">{t('Timeout')}</option>
                      <option value="bann">{t('Bann')}</option>
                    </select>
                    <input type="number" min={1} disabled={r.aktion !== 'timeout'} value={r.dauerSek} onChange={(ev) => setRegeln(regeln.map((x, j) => (j === i ? { ...x, dauerSek: Number(ev.target.value) } : x)))} title={t('Dauer in Sekunden')} className={`${feld} disabled:opacity-40`} />
                    <input value={r.grund} onChange={(ev) => setRegeln(regeln.map((x, j) => (j === i ? { ...x, grund: ev.target.value } : x)))} placeholder={t('Grund (sieht der Nutzer)')} className={feld} />
                    <button type="button" onClick={() => setRegeln(regeln.filter((_, j) => j !== i))} className="text-xs text-slate-500 hover:text-rose-400"><T>Entfernen</T></button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setRegeln([...regeln, { woerter: '', aktion: 'timeout', dauerSek: 600, grund: '' }])}
                className="mt-3 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-slate-300 transition hover:border-violet-500"><T>Regel hinzufügen</T></button>
            </section>

            <button type="button" disabled={arbeitet}
              onClick={() => void senden({ aktion: 'speichern', kanal: e.id, befehle, regeln: regeln.map((r) => ({ ...r, woerter: String(r.woerter).split(',').map((w) => w.trim()).filter(Boolean) })) }, t('Gespeichert'))}
              className="rounded-lg bg-violet-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-violet-400 disabled:opacity-50">
              <T>Speichern</T>
            </button>
          </>
        )}
      </div>
    </main>
  );
}
