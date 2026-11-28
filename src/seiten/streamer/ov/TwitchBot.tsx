import { OV } from './ort';
import Link from './Link';
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Kennzahl, Leer } from '../../../ds/Bausteine';
import { Zeichen } from '../Teile';
import T from './T';
import LadeSchirm from './LadeSchirm';
import NurVip from './NurVip';
import { useZugang } from './zugang';
import { useT } from './sprache';

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

const feld = 'eingabe !rounded-lg !px-3 !py-2';
const AKTIONEN: Array<{ k: Regel['aktion']; titel: string }> = [{ k: 'loeschen', titel: 'Delete' }, { k: 'timeout', titel: 'Timeout' }, { k: 'bann', titel: 'Ban' }];

/** Kopf einer Tafel: Titel in Bebas, Zahl, rechts ein Knopf. */
function TafelKopf({ titel, zahl, text, rechts }: { titel: string; zahl?: number; text?: React.ReactNode; rechts?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="titel flex items-baseline gap-2 text-3xl">{titel}{zahl !== undefined && <span className="zahl text-lg text-white/35">{zahl}</span>}</h2>
        {text && <p className="mt-1 max-w-3xl text-xs leading-relaxed text-white/45">{text}</p>}
      </div>
      {rechts}
    </div>
  );
}

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
  if (!darf && zugang.vip) return <NurVip titel="The Twitch bot isn’t switched on for your account yet" text="CompHub switches it on per VIP – write us a quick message on Discord." />;
  if (!darf) return <NurVip text="The CompHub bot is for VIPs whose channel CompHub has switched on." />;

  const e = d?.einstellung ?? null;
  // Die Chat-Vorschau: so antwortet der Bot auf jeden Befehl - {user} und {args} mit Beispielwerten ersetzt, nichts davon geht nach Twitch.
  const chat = befehle.filter((b) => b.name.length > 1 && b.antwort.trim()).slice(0, 6).map((b) => ({
    frage: `${b.name}${b.antwort.includes('{args}') ? ' bugha' : ''}`,
    antwort: b.antwort.replace(/\{user\}/g, '@viewer').replace(/\{args\}/g, 'bugha'),
    mods: b.nurMods,
  }));
  const speichern = () => void senden({ aktion: 'speichern', kanal: e?.id, befehle, regeln: regeln.map((r) => ({ ...r, woerter: String(r.woerter).split(',').map((w) => w.trim()).filter(Boolean) })) }, t('Gespeichert'));
  const status = !e ? null : d?.moderator === false && d.bot ? 'mod' : e.an ? 'an' : 'aus';

  return (
    <div className="space-y-5 text-white">
      {/* ------------------------------------------- Kopf: Titel links, Kanal und Zahlen rechts */}
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <motion.div initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45 }} className="min-w-0">
          <p className="ueber">Twitch · Chat bot</p>
          <h1 className="titel mt-1 text-6xl lg:text-7xl">CompHub bot</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-white/55"><T>Befehle wie !webseite mit deiner eigenen Antwort und Regeln gegen Beleidigungen - rund um die Uhr, auch wenn dein PC aus ist.</T></p>
        </motion.div>
        {e && (
          <div className="flex gap-8 sm:gap-10">
            <Kennzahl label="Commands" wert={befehle.length} />
            <Kennzahl label="Rules" wert={regeln.length} />
            <Kennzahl label="Status" wert={status === 'an' ? 'On' : status === 'mod' ? 'Not mod' : 'Off'} ton={status === 'an' ? 'gruen' : 'rot'} />
          </div>
        )}
      </header>

      {fehler && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{fehler}</p>}
      {hinweis && <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-300">{hinweis}</p>}
      {d && !d.kanaele.length && <Leer text={<T>Für dein Konto ist noch kein Twitch-Kanal freigeschaltet. Der Admin trägt ihn unter Twitch-Statistik ein.</T>} />}

      <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
        {/* ------------------------------------------- links: Kanal, Schalter, Speichern, Chat-Vorschau */}
        <aside className="space-y-4 lg:sticky lg:top-[7.5rem] lg:self-start">
          {e && (
            <section className="fl-fest overflow-hidden">
              <div className="flex items-center gap-3 border-b border-white/[0.06] p-5">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${status === 'an' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.06] text-white/50'}`}><Zeichen name="bot" className="h-6 w-6" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Channel</p>
                  {d && d.kanaele.length > 1 ? (
                    <select value={e.id} onChange={(ev) => setKanal(ev.target.value)} className="eingabe mt-1 w-full !py-1.5">
                      {d.kanaele.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                    </select>
                  ) : <a href={`https://twitch.tv/${e.login}`} target="_blank" rel="noreferrer" className="block truncate text-lg font-bold hover:text-akz">{e.login}</a>}
                </div>
              </div>
              <div className="space-y-3 p-5">
                <button type="button" disabled={arbeitet || !d?.bot} onClick={() => void senden({ aktion: 'an', kanal: e.id, an: !e.an }, e.an ? t('Bot ausgeschaltet.') : t('Bot eingeschaltet.'))}
                  className="flex w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-black/30 px-4 py-3 text-left transition hover:border-white/15 disabled:opacity-40">
                  <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${e.an ? 'bg-emerald-500' : 'bg-white/15'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${e.an ? 'left-6' : 'left-1'}`} /></span>
                  <span className="text-sm font-bold">{e.an ? <T>An</T> : <T>Aus</T>}</span>
                  <span className="ml-auto text-[11px] text-white/45">{e.an ? 'click to switch off' : 'click to switch on'}</span>
                </button>
                <p className="text-xs leading-relaxed text-white/50">
                  {status === 'mod' && d?.bot
                    ? <span className="text-amber-300"><T>Der Bot ist in deinem Kanal noch kein Moderator. Schreib in deinen Chat:</T> <code className="rounded bg-black/40 px-1.5 py-0.5">/mod {d.bot.login}</code></span>
                    : e.an ? <T>Der Bot ist an und hört in deinem Chat mit.</T> : <T>Der Bot ist aus.</T>}
                </p>
                <button type="button" disabled={arbeitet} onClick={speichern} className="knopf-prim w-full"><T>Speichern</T></button>
              </div>
            </section>
          )}

          {e && (
            <section className="fl-fest p-5">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Chat preview</p>
              {chat.length ? (
                <ul className="space-y-3 text-[13px] leading-snug">
                  {chat.map((c, i) => (
                    <li key={i} className="space-y-1">
                      <p><span className="font-bold text-sky-300">viewer</span><span className="text-white/40">: </span><span className="text-white/85">{c.frage}</span>{c.mods && <span className="ml-1.5 text-[10px] text-white/35">(mods only)</span>}</p>
                      <p><span className="font-bold text-akz">{d?.bot?.login ?? 'CompHubBot'}</span><span className="text-white/40">: </span><span className="text-white/70">{c.antwort}</span></p>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-white/40">Add a command – its reply shows up here as it will look in your chat.</p>}
            </section>
          )}

          {d?.admin && (
            <section className="fl-fest p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40"><T>Bot-Konto (Admin)</T></p>
              <p className="mt-1.5 text-xs text-white/50">
                {d.bot ? <><T>Verbunden als</T> <b className="text-white/85">{d.bot.login}</b>.</> : <T>Noch nicht verbunden. Melde dich bei Twitch mit dem Bot-Konto an (nicht mit deinem eigenen Kanal).</T>}
              </p>
              <a href={`${OV}/api/twitch-bot/verbinden`} target="_blank" rel="noreferrer" className="knopf mt-3">
                {d.bot ? <T>Neu verbinden</T> : <T>Bot-Konto verbinden</T>}
              </a>
            </section>
          )}
        </aside>

        {/* ------------------------------------------- rechts: Befehle und Regeln */}
        {e && (
          <div className="min-w-0 space-y-5">
            <section className="fl-fest p-5 sm:p-6">
              <TafelKopf titel="Commands" zahl={befehle.length}
                text={<><T>Schreibt jemand den Befehl in den Chat, antwortet der Bot mit deinem Text. Platzhalter:</T> <code className="text-white/70">{'{user}'}</code> <T>(wer gefragt hat)</T>, <code className="text-white/70">{'{args}'}</code> <T>(was nach dem Befehl steht)</T>. <T>Ein Befehl beginnt mit !, $ oder ? - zum Beispiel !website oder $discord. Mit / geht es nicht, das gehört Twitch.</T></>}
                rechts={<button type="button" onClick={() => setBefehle([...befehle, { name: '!', antwort: '', cooldownSek: 10, nurMods: false }])} className="knopf"><Zeichen name="plus" className="h-4 w-4" /><T>Befehl hinzufügen</T></button>} />
              {befehle.length > 0 && (
                <div className="hidden gap-2 px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40 md:grid md:grid-cols-[150px_minmax(0,1fr)_100px_110px_36px]">
                  <span><T>Befehl</T></span><span><T>Antwort des Bots</T></span><span title={t('So viele Sekunden muss zwischen zwei Antworten auf denselben Befehl liegen.')}><T>Pause (Sek.)</T></span><span /><span />
                </div>
              )}
              <div className="space-y-2">
                {befehle.map((b, i) => (
                  <div key={i} className="grid items-center gap-2 rounded-xl border border-white/[0.06] bg-black/25 p-2.5 md:grid-cols-[150px_minmax(0,1fr)_100px_110px_36px]">
                    <input value={b.name} onChange={(ev) => setBefehle(befehle.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))} placeholder="!webseite" className={`${feld} font-mono font-semibold text-akz`} />
                    <input value={b.antwort} onChange={(ev) => setBefehle(befehle.map((x, j) => (j === i ? { ...x, antwort: ev.target.value } : x)))} placeholder={t('Antwort des Bots')} className={feld} />
                    <input type="number" min={0} max={3600} value={b.cooldownSek} onChange={(ev) => setBefehle(befehle.map((x, j) => (j === i ? { ...x, cooldownSek: Number(ev.target.value) } : x)))} title={t('Pause in Sekunden')} className={`${feld} zahl`} />
                    <label className="flex items-center gap-1.5 text-xs text-white/55"><input type="checkbox" checked={b.nurMods} className="accent-[rgb(var(--akz))]" onChange={(ev) => setBefehle(befehle.map((x, j) => (j === i ? { ...x, nurMods: ev.target.checked } : x)))} /><T>nur Mods</T></label>
                    <button type="button" title={t('Entfernen')} aria-label={t('Entfernen')} onClick={() => setBefehle(befehle.filter((_, j) => j !== i))} className="grid h-8 w-8 place-items-center rounded-lg text-white/40 transition hover:bg-rose-500/10 hover:text-rose-300">✕</button>
                  </div>
                ))}
                {!befehle.length && <Leer text="No commands yet – add the first one, e.g. !website." />}
              </div>
            </section>

            <section className="fl-fest p-5 sm:p-6">
              <TafelKopf titel="Rules" zahl={regeln.length}
                text={<><T>Steht eines der Wörter in einer Nachricht, greift der Bot ein. Moderatoren und dich selbst lässt er in Ruhe.</T> <T>Die Dauer gilt nur für den Timeout.</T></>}
                rechts={<button type="button" onClick={() => setRegeln([...regeln, { woerter: '', aktion: 'timeout', dauerSek: 600, grund: '' }])} className="knopf"><Zeichen name="plus" className="h-4 w-4" /><T>Regel hinzufügen</T></button>} />
              <div className="space-y-2">
                {regeln.map((r, i) => (
                  <div key={i} className="grid items-center gap-2 rounded-xl border border-white/[0.06] bg-black/25 p-2.5 md:grid-cols-[minmax(0,1fr)_auto_100px_minmax(0,0.8fr)_36px]">
                    <input value={Array.isArray(r.woerter) ? r.woerter.join(', ') : r.woerter} onChange={(ev) => setRegeln(regeln.map((x, j) => (j === i ? { ...x, woerter: ev.target.value } : x)))} placeholder={t('Wörter, mit Komma getrennt')} className={feld} />
                    <div className="inline-flex rounded-lg border border-white/10 bg-black/40 p-0.5" role="radiogroup" aria-label={t('Was der Bot tut')}>
                      {AKTIONEN.map((x) => (
                        <button key={x.k} type="button" onClick={() => setRegeln(regeln.map((y, j) => (j === i ? { ...y, aktion: x.k } : y)))}
                          className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${r.aktion === x.k ? (x.k === 'bann' ? 'bg-rose-500 text-white' : 'bg-akz text-[#04050a]') : 'text-white/55 hover:text-white'}`}>{x.titel}</button>
                      ))}
                    </div>
                    <input type="number" min={1} disabled={r.aktion !== 'timeout'} value={r.dauerSek} onChange={(ev) => setRegeln(regeln.map((x, j) => (j === i ? { ...x, dauerSek: Number(ev.target.value) } : x)))} title={t('Dauer in Sekunden')} className={`${feld} zahl disabled:opacity-30`} />
                    <input value={r.grund} onChange={(ev) => setRegeln(regeln.map((x, j) => (j === i ? { ...x, grund: ev.target.value } : x)))} placeholder={t('Grund (sieht der Nutzer)')} className={feld} />
                    <button type="button" title={t('Entfernen')} aria-label={t('Entfernen')} onClick={() => setRegeln(regeln.filter((_, j) => j !== i))} className="grid h-8 w-8 place-items-center rounded-lg text-white/40 transition hover:bg-rose-500/10 hover:text-rose-300">✕</button>
                  </div>
                ))}
                {!regeln.length && <Leer text="No rules yet – e.g. time out messages with insults for 10 minutes." />}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
