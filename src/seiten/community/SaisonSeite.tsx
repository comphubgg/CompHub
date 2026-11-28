import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Abschnitt, Bild, Flaeche, Marke, MedienKarte, dauer } from '../../ds/Bausteine';
import { KalenderKnopf, LinkKopieren, useJetzt } from './Bausteine';
import { holen, useTeile } from './kosmetik/daten';
import { Kachel } from './kosmetik/Raster';
import { useSaison } from './SeitenSaison';

/*
 * Season (Design 3.0, neu komponiert 28.11.2026). Die EINE Frage der Seite: "Wie lange noch?" - deshalb ist die Uhr die Buehne:
 *   1. Buehne ueber die volle Breite: Key Art der Saison (fortnite-api.com, Ladebildschirm/KeyArt der hoechsten Saison) rechts auslaufend,
 *      links Saisonname, die Uhr in Bebas (Tage in der Bereichsfarbe), darunter die drei Zeitpunkte und "Add to calendar".
 *   2. Band darunter: Restzeit in Zahlen (Tage, Wochenenden, Stunden) + Saisonfortschritt (wenn der Start bekannt ist) | was mit der Saison endet (Modi).
 *   3. Neu in dieser Saison (Kosmetik der Saison, echte Bilder) und Epics News dazu.
 *   4. Saison-Verlauf als Tabelle (aus saison.json), sonst eine Zeile.
 * Daten: useSaison() aus SeitenSaison.tsx (fest + /hub-daten/saison.json), Kosmetik und News von fortnite-api.com.
 */

const zeit = (t: number) => new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
interface Motd { id: string; title: string; body: string; image?: string; tileImage?: string; hidden?: boolean }

/** Eine Stelle der Uhr: Zahl in Bebas, rollt beim Wechsel. */
function Stelle({ wert, name, akzent }: { wert: number; name: string; akzent?: boolean }) {
  const text = String(wert).padStart(2, '0');
  return (
    <div className="min-w-0">
      <div className={`titel flex text-[46px] leading-none sm:text-[104px] xl:text-[136px] ${akzent ? '!text-akz drop-shadow-[0_0_40px_rgb(var(--akz)/0.45)]' : ''}`}>
        {text.split('').map((z, i) => (
          <span key={i} className="relative inline-block overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={z} initial={{ y: '-90%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '90%', opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="inline-block">{z}</motion.span>
            </AnimatePresence>
          </span>
        ))}
      </div>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">{name}</p>
    </div>
  );
}
function Uhr({ rest }: { rest: number }) {
  const s = Math.max(0, Math.floor(rest / 1000));
  const teile: Array<[number, string]> = [[Math.floor(s / 86400), 'Days'], [Math.floor((s % 86400) / 3600), 'Hours'], [Math.floor((s % 3600) / 60), 'Minutes'], [s % 60, 'Seconds']];
  return (
    <div className="flex items-start gap-4 sm:gap-6 xl:gap-8">
      {teile.map(([w, n], i) => <Stelle key={n} wert={w} name={n} akzent={i === 0} />)}
    </div>
  );
}

/** Samstage zwischen jetzt und Ende - "Wochenenden" zum Spielen (gerechnet, nicht erfunden). */
function wochenenden(von: number, bis: number) {
  let n = 0; const d = new Date(von); d.setHours(12, 0, 0, 0);
  for (; d.getTime() < bis; d.setDate(d.getDate() + 1)) if (d.getDay() === 6) n++;
  return n;
}

export default function SaisonSeite() {
  const { s, ausDatei } = useSaison();
  const jetzt = useJetzt();
  const ende = Date.parse(s.end);
  const ev = s.liveEvent;
  const ziel = ev ? Date.parse(ev.start) : ende;
  const start = s.start ? Date.parse(s.start) : null;
  const fortschritt = start ? Math.min(100, Math.max(0, ((jetzt - start) / (ende - start)) * 100)) : null;

  // Key Art und Kosmetik der laufenden Saison (hoechste Saison-Nummer in den Daten)
  const { teile, laedt } = useTeile(['br']);
  const saison = useMemo(() => {
    const nr = Math.max(0, ...teile.map((t) => t.saisonNr ?? 0));
    const dieSaison = teile.filter((t) => t.saisonNr === nr);
    const keyArt = dieSaison.find((t) => /KeyArt/i.test(t.id) && t.bildBreit) ?? dieSaison.find((t) => t.typ === 'loadingscreen' && t.bildBreit);
    const outfits = dieSaison.filter((t) => t.id !== keyArt?.id && t.bild && ['outfit', 'backpack', 'pickaxe', 'glider', 'emote', 'wrap', 'sidekick'].includes(t.typ))
      .sort((a, b) => Number(b.typ === 'outfit') - Number(a.typ === 'outfit') || (b.hinzu ?? '').localeCompare(a.hinzu ?? ''));
    return { nr, anzahl: dieSaison.length, keyArt, auswahl: outfits.slice(0, 16), outfits: dieSaison.filter((t) => t.typ === 'outfit').length };
  }, [teile]);
  const [news, setNews] = useState<Motd[]>([]);
  useEffect(() => { holen<{ motds?: Motd[] }>('/v2/news/br').then((d) => setNews((d?.motds ?? []).filter((m) => !m.hidden && (m.image || m.tileImage)))).catch(() => {}); }, []);

  const tage = Math.max(0, Math.floor((ende - jetzt) / 864e5));
  const stunden = Math.max(0, Math.floor((ende - jetzt) / 36e5));
  const we = wochenenden(jetzt, ende);

  return (
    <div className="space-y-8">
      {/* 1 - Buehne: die Uhr */}
      <header className="fl-fest relative isolate overflow-hidden">
        {saison.keyArt?.bildBreit
          ? <motion.div initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }} className="absolute inset-y-0 right-0 -z-10 w-full lg:w-[72%]" style={{ maskImage: 'linear-gradient(90deg, transparent, #000 35%)', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 35%)' }}>
              <Bild src={saison.keyArt.bildBreit} className="h-full w-full" lage="center" />
            </motion.div>
          : <div className="absolute inset-0 -z-10 bg-[radial-gradient(80%_120%_at_85%_10%,rgb(var(--akz)/0.22),transparent_60%)]" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-fl via-fl/85 to-fl/5" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-fl via-fl/20 to-transparent" />
        <div className="px-5 pb-7 pt-10 sm:px-8 lg:px-12 lg:pb-10 lg:pt-16">
          <div className="flex flex-wrap items-center gap-2">
            <Marke ton={ev ? 'rot' : 'akz'} puls={!!ev}>{ev ? 'Live event' : 'Season ends'}</Marke>
            <Marke>{s.sub ? `${s.sub} · ` : ''}Season {s.season}</Marke>
          </div>
          <motion.h1 initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }} className="titel mt-4 text-6xl sm:text-7xl lg:text-8xl">{ev ? ev.name : s.name}</motion.h1>
          <p className="mt-2 text-[15px] font-semibold text-white/60">{ev ? `${s.name} finale – starts in` : 'ends in'}</p>
          <div className="mt-4"><Uhr rest={ziel - jetzt} /></div>
          <div className="mt-8 flex flex-wrap items-end gap-x-10 gap-y-4">
            {ev?.doorsOpen && <Zeitpunkt titel="Doors open" wert={zeit(Date.parse(ev.doorsOpen))} />}
            {ev && <Zeitpunkt titel="Event starts" wert={zeit(Date.parse(ev.start))} />}
            <Zeitpunkt titel="Season ends" wert={zeit(ende)} unter={s.endConfirmed ? undefined : 'Time not confirmed by Epic'} />
            <div className="flex flex-wrap gap-2">
              <KalenderKnopf titel={ev ? `Fortnite live event: ${ev.name}` : `Fortnite ${s.name} ends`} start={ev ? Date.parse(ev.doorsOpen ?? ev.start) : ende} />
              <LinkKopieren />
            </div>
          </div>
        </div>
      </header>

      {/* 2 - Restzeit in Zahlen | was mit der Saison endet */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Flaeche fest className="p-6" verz={0.05}>
          <p className="ueber">Time left</p>
          <div className="mt-3 grid grid-cols-3 gap-4">
            {([[tage, tage === 1 ? 'day' : 'days'], [we, we === 1 ? 'weekend' : 'weekends'], [stunden, 'hours']] as const).map(([w, t]) => (
              <div key={t}><p className="titel zahl text-5xl sm:text-6xl">{w.toLocaleString('en')}</p><p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">{t}</p></div>
            ))}
          </div>
          {fortschritt !== null ? (
            <div className="mt-6">
              <div className="flex justify-between text-xs text-white/50"><span>{new Date(start!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span><span className="font-bold text-white">{fortschritt.toFixed(0)} % done</span><span>{new Date(ende).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></div>
              <div className="relative mt-2 h-3 overflow-hidden rounded-full bg-white/[0.07]">
                <motion.div className="h-full rounded-full bg-akz shadow-[0_0_20px_rgb(var(--akz)/0.6)]" initial={{ width: 0 }} animate={{ width: `${fortschritt}%` }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} />
              </div>
            </div>
          ) : (
            <p className="mt-5 text-xs text-white/40">Plan the rest of the season: <Link to="/community/xp" className="font-semibold text-akz hover:text-white">XP per day for your level goal →</Link></p>
          )}
        </Flaeche>
        <Flaeche fest className="p-6" verz={0.1}>
          <p className="ueber">Ends with the season</p>
          {s.modes?.length ? (
            <ul className="mt-3 divide-y divide-white/[0.06]">
              {s.modes.map((m) => (
                <li key={m.mode} className="flex items-baseline justify-between gap-3 py-2.5">
                  <span className="font-bold text-white">{m.title}</span>
                  <span className="zahl text-sm font-semibold text-akz">{Date.parse(m.end) > jetzt ? dauer(Date.parse(m.end) - jetzt) : 'ended'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="mt-3 space-y-2.5 text-sm">
              <li className="flex items-baseline justify-between gap-3"><span className="font-bold text-white">Battle Pass {s.season}</span><span className="zahl font-semibold text-akz">{dauer(ende - jetzt)}</span></li>
              <li className="flex items-baseline justify-between gap-3"><span className="font-bold text-white">Season quests</span><span className="zahl font-semibold text-akz">{dauer(ende - jetzt)}</span></li>
              <li className="pt-1 text-xs text-white/40">End times per mode (OG, LEGO, Festival) show here once Epic confirms them.</li>
            </ul>
          )}
        </Flaeche>
      </div>

      {/* 3 - Neu in dieser Saison */}
      {(laedt || saison.auswahl.length > 0) && (
        <Abschnitt ueber={saison.nr ? `Season ${saison.nr} in the files` : 'This season'} titel="New this season" zu="/community/cosmetics" zuText="All cosmetics">
          {saison.anzahl > 0 && <p className="-mt-2 mb-4 text-sm text-white/50"><b className="text-white">{saison.anzahl.toLocaleString('en')}</b> new cosmetics, <b className="text-white">{saison.outfits}</b> of them outfits.</p>}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 max-sm:[&>*:nth-child(n+13)]:hidden">
            {laedt && !saison.auswahl.length
              ? Array.from({ length: 8 }, (_, i) => <div key={i} className="fl-fest aspect-[3/4] animate-pulse !rounded-2xl" />)
              : saison.auswahl.map((t, i) => <Kachel key={t.id} t={t} index={i} />)}
          </div>
        </Abschnitt>
      )}

      {news.length > 0 && (
        <Abschnitt ueber="Epic news" titel="On the island right now" zu="/community/news" zuText="All news">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {news.slice(0, 4).map((m, i) => (
              <MedienKarte key={m.id} bild={m.image || m.tileImage} titel={m.title} verz={i * 0.05}><p className="mt-1 line-clamp-2 text-xs text-white/50">{m.body}</p></MedienKarte>
            ))}
          </div>
        </Abschnitt>
      )}

      {/* 4 - Verlauf */}
      {s.history?.length ? (
        <Abschnitt ueber="History" titel="Every season">
          <Flaeche fest className="overflow-x-auto">
            <table className="tabelle min-w-[560px]">
              <thead><tr><th className="!pl-6">Season</th><th>Start</th><th>End</th><th className="!pr-6 text-right">Days</th></tr></thead>
              <tbody>{s.history.map((h) => (
                <tr key={`${h.chapter}-${h.season}`}>
                  <td className="!pl-6 font-semibold text-white">Chapter {h.chapter} · {h.season} <span className="text-white/45">{h.name}</span>{h.battlePass ? <span className="ml-2"><Marke ton="akz">Battle Pass</Marke></span> : null}</td>
                  <td className="text-white/60">{new Date(h.start).toLocaleDateString('en-GB')}</td><td className="text-white/60">{new Date(h.end).toLocaleDateString('en-GB')}</td>
                  <td className="zahl !pr-6 text-right text-white">{Math.round((Date.parse(h.end) - Date.parse(h.start)) / 864e5)}</td>
                </tr>
              ))}</tbody>
            </table>
          </Flaeche>
        </Abschnitt>
      ) : (
        <p className="text-xs text-white/35">{ausDatei ? 'Season history isn’t in the season file yet.' : 'Season end uses Epic’s usual maintenance time until it’s confirmed. Live-event times and the season history appear here as soon as they’re announced.'}</p>
      )}
    </div>
  );
}

function Zeitpunkt({ titel, wert, unter }: { titel: string; wert: string; unter?: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">{titel}</p>
      <p className="mt-0.5 font-bold text-white">{wert}</p>
      {unter && <p className="text-[11px] text-white/40">{unter}</p>}
    </div>
  );
}
