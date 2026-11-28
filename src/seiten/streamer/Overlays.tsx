import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bild, Laedt, Marke } from '../../ds/Bausteine';
import { useWer } from '../../teile/Anmeldung';
import { ARTEN, FREIE_ARTEN, darfArt, overlayAdresse } from './ov/OverlayGeruest';
import { KopierFeld, ObsSchritte, obsGroesse, type OverlayGroesse } from './ov/Bausteine';
import { customParamUrl, STANDARD as CUSTOM_STANDARD } from './ov/custom/Baukasten';
import { REIHENFOLGE, probeVon, useProbeDaten } from './ov/proben';
import HubLink from './ov/Link';
import { OV } from './ov/ort';
import { useZugang } from './ov/zugang';
import { ProbeBuehne, StufenMarke, Zeichen, useMeineOverlays } from './Teile';

/*
 * Overlays - neu gebaut auf dem Design-System 3.0 (28.11.2026). Betreiber: "grosse Live-Vorschau als Buehne, Einstellungen angedockt,
 * Schritte waehlen -> anpassen -> OBS-Adresse kopieren".
 *
 *   links    1 Choose  - jede Art als Karte mit ihrer laufenden Mini-Vorschau, darunter Globals 2026 und die privaten Partner-Kacheln
 *   Mitte    die Buehne - die echte Overlay-Datei (thecomphub.com/overlay/..., im Hub ueber den Proxy) mit Beispielwerten, gross; darunter
 *            was es zeigt, wann man es nimmt, woher die Zahlen kommen
 *   rechts   2 Adjust  - in den Baukasten (neu anlegen, eigene Overlays, Steuerseite)
 *            3 Copy    - die OBS-Adressen der eigenen Overlays dieser Art (https://www.thecomphub.com/overlay/...?id=...), die OBS-Schritte
 * Kostenlos: Cup timer, Offspawn (und der versteckte eigene Text); alles mit Live-Cupdaten fuer VIPs (darfArt in ov/OverlayGeruest).
 * Die Wahl steht in der Adresse (#timer ...), damit alte Sprungmarken weiter treffen.
 */

type Art = (typeof ARTEN)[number];

/** Private Partner-Kacheln: der Server schickt nur die, die diese Person sehen darf (app/api/partner-kacheln). */
interface PartnerKachel { id: string; titel: string; text: string; href: string; logo: string; farbe: string; knopf: string }
function usePartner() {
  const [kacheln, setKacheln] = useState<PartnerKachel[]>([]);
  useEffect(() => {
    let weg = false;
    fetch('/api/partner-kacheln', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!weg && Array.isArray(j?.kacheln)) setKacheln(j.kacheln as PartnerKachel[]); }).catch(() => {});
    return () => { weg = true; };
  }, []);
  return kacheln;
}

/** Ein Schritt im Kopf: Nummer, Wort, erledigt/aktiv. */
function Schritt({ n, titel, stand }: { n: number; titel: string; stand: 'fertig' | 'jetzt' | 'spaeter' }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${stand === 'fertig' ? 'bg-akz text-[#04050a]' : stand === 'jetzt' ? 'bg-akz/15 text-akz ring-1 ring-akz/50' : 'bg-white/[0.05] text-white/45'}`}>
        {stand === 'fertig' ? <Zeichen name="haken" className="h-3.5 w-3.5" /> : n}
      </span>
      <span className={`text-sm font-semibold ${stand === 'spaeter' ? 'text-white/45' : 'text-white'}`}>{titel}</span>
    </li>
  );
}

/** Kopf einer angedockten Tafel: Schritt-Nummer und Wort. */
function TafelKopf({ n, titel, rechts }: { n: number; titel: string; rechts?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-akz/15 text-[11px] font-bold text-akz">{n}</span>
      <h2 className="titel text-2xl">{titel}</h2>
      {rechts && <span className="ml-auto">{rechts}</span>}
    </div>
  );
}

export default function Overlays() {
  const zugang = useZugang();
  const { oeffnen } = useWer();
  const daten = useProbeDaten();
  const [start] = useState(() => Date.now() + 2 * 3_600_000 + 14 * 60_000);
  const meine = useMeineOverlays(zugang.nutzer);
  const partner = usePartner();
  const [groessen, setGroessen] = useState<Record<string, OverlayGroesse>>({});

  const arten = useMemo(() => REIHENFOLGE.map((k) => ARTEN.find((a) => a.schluessel === k)).filter((a): a is Art => Boolean(a && !a.versteckt)), []);
  const [wahl, setWahl] = useState<string>(() => {
    const h = typeof window === 'undefined' ? '' : window.location.hash.slice(1);
    return REIHENFOLGE.includes(h) ? h : 'timer';
  });
  const waehlen = (k: string) => { setWahl(k); try { window.history.replaceState(null, '', `#${k}`); } catch { /* egal */ } };

  if (zugang.laedt) return <Laedt text="Checking your access" />;

  const a = arten.find((x) => x.schluessel === wahl) ?? arten[0];
  const frei = darfArt(zugang, a.schluessel);
  const istCustom = a.schluessel === 'custom';
  const eigene = (meine ?? []).filter((o) => o.typ === a.schluessel);
  const obs = obsGroesse(groessen[a.schluessel] ?? null);
  const probe = probeVon(a.schluessel, daten, start);
  const neuPfad = a.ohneCup ? a.pfad : `${a.pfad}?neu=1`;
  const hatAdresse = frei && (eigene.length > 0 || istCustom);

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------ Kopf: Titel und die drei Schritte */}
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <motion.div initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45 }} className="min-w-0">
          <p className="ueber">Create · OBS browser source</p>
          <h1 className="titel mt-1 text-6xl lg:text-7xl">Overlays</h1>
        </motion.div>
        <ol className="flex flex-wrap items-center gap-x-6 gap-y-3" aria-label="Steps">
          <Schritt n={1} titel="Choose an overlay" stand="fertig" />
          <span className="hidden h-px w-8 bg-white/15 sm:block" />
          <Schritt n={2} titel="Adjust it" stand={eigene.length ? 'fertig' : 'jetzt'} />
          <span className="hidden h-px w-8 bg-white/15 sm:block" />
          <Schritt n={3} titel="Copy the OBS URL" stand={hatAdresse ? 'jetzt' : 'spaeter'} />
        </ol>
      </header>

      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)] 2xl:grid-cols-[18rem_minmax(0,1fr)_24rem]">
        {/* ------------------------------------------------ 1 Choose */}
        <aside className="fl-fest p-3 lg:sticky lg:top-[7.5rem] lg:max-h-[calc(100dvh-9rem)] lg:self-start lg:overflow-y-auto">
          <p className="px-1 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">1 · Choose</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
            {arten.map((x) => {
              const an = x.schluessel === a.schluessel;
              const zu = !darfArt(zugang, x.schluessel);
              return (
                <button key={x.schluessel} type="button" onClick={() => waehlen(x.schluessel)} aria-pressed={an}
                  className={`group overflow-hidden rounded-2xl border text-left transition ${an ? 'border-akz/50 bg-akz/[0.08]' : 'border-white/[0.06] bg-black/20 hover:border-white/15'}`}>
                  <ProbeBuehne probe={probeVon(x.schluessel, daten, start)} titel={x.titel} maxMass={0.9} className="aspect-video" />
                  <span className="flex items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm font-bold ${an ? 'text-white' : 'text-white/80'}`}>{x.titel}</span>
                      <span className="block truncate text-[11px] text-white/45">{x.kurz}</span>
                    </span>
                    {!FREIE_ARTEN.includes(x.schluessel) && <StufenMarke vip zu={zu} />}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Globals 2026 und Partner: eigene Seiten */}
          <Link to="/streamer/overlays/globals" id="globals" className="group mt-3 block overflow-hidden rounded-2xl border border-white/[0.06] bg-black/20 transition hover:border-white/15">
            <span className="relative block aspect-video overflow-hidden">
              <Bild src="/cups/fncs-global-championship-2026-hd.jpg" alt="FNCS Global Championship 2026" className="absolute inset-0 h-full w-full transition duration-700 group-hover:scale-105" />
              <span className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
              <span className="absolute bottom-2 left-3 right-3 flex items-end justify-between gap-2">
                <span className="titel text-2xl">Globals 2026</span>
                <StufenMarke vip zu={!zugang.vip} />
              </span>
            </span>
            <span className="block px-3 py-2 text-[11px] text-white/45">Leaderboard, player banner and a free overlay in the Global Championship look</span>
          </Link>
          {partner.map((k) => (
            <HubLink key={k.id} href={k.href} className="mt-3 flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-black/20 p-3 transition hover:border-white/15">
              <img src={k.logo} alt="" className="h-9 w-auto shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold" style={{ color: k.farbe }}>{k.titel}</span>
                <span className="block truncate text-[11px] text-white/45">{k.text}</span>
              </span>
              <Zeichen name="pfeil" className="h-4 w-4 text-white/40" />
            </HubLink>
          ))}
        </aside>

        {/* ------------------------------------------------ Buehne */}
        <section className="min-w-0 space-y-4">
          <div className="fl-fest overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-5 py-3">
              <h2 className="titel text-3xl">{a.titel}</h2>
              <StufenMarke vip={!FREIE_ARTEN.includes(a.schluessel)} zu={!frei} />
              <span className="text-sm text-white/50">{a.kurz}</span>
              <span className="ml-auto flex items-center gap-3 text-[11px] text-white/45">
                <span className="hidden font-mono uppercase tracking-[0.18em] sm:inline">Live preview · sample values</span>
                <span className="zahl rounded-md bg-white/[0.05] px-2 py-1 font-mono text-white/70">OBS {obs.b} × {obs.h}</span>
              </span>
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={a.schluessel} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                <ProbeBuehne probe={probe} titel={a.titel} maxMass={2.4} className="aspect-video w-full"
                  onGroesse={(g) => setGroessen((alt) => (alt[a.schluessel]?.w === g.w && alt[a.schluessel]?.h === g.h && alt[a.schluessel]?.x === g.x ? alt : { ...alt, [a.schluessel]: g }))}>
                  {!frei && (
                    <div className="absolute inset-0 grid place-items-center bg-grund/55 backdrop-blur-[2px]">
                      <div className="text-center">
                        <Marke ton="gold">VIP</Marke>
                        <p className="mt-3 text-sm text-white/75">Live cup data on your stream</p>
                        <button type="button" onClick={() => oeffnen('schluessel')} className="knopf mt-3">Unlock with an access key</button>
                      </div>
                    </div>
                  )}
                </ProbeBuehne>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Was, wann, woher - eine Zeile unter der Buehne */}
          <dl className="grid gap-3 sm:grid-cols-3">
            {[['What it shows', a.zeigt], ['When to use it', a.wann], ['Where the data comes from', a.quelle]].map(([t, v]) => (
              <div key={t} className="fl-fest p-4">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">{t}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-white/70">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ------------------------------------------------ 2 Adjust + 3 Copy, angedockt */}
        <aside className="space-y-4 lg:col-span-2 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 2xl:sticky 2xl:top-[7.5rem] 2xl:col-span-1 2xl:block 2xl:space-y-4 2xl:self-start">
          <div className="fl-fest p-5">
            <TafelKopf n={2} titel="Adjust" />
            {frei ? (
              <>
                <p className="text-sm leading-relaxed text-white/55">
                  {istCustom ? 'Teams, colours, fonts, flags and position – the score is changed live from the control page.' : a.ohneCup ? 'Names, score, colours and look – the preview updates while you type.' : 'Pick the cup day, then the look – the preview updates while you change it.'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to={neuPfad} className="knopf-prim">{istCustom ? 'Open configurator' : 'Create overlay'} <span aria-hidden>→</span></Link>
                  {istCustom
                    ? <Link to="/streamer/overlays/custom/control" className="knopf">Control panel</Link>
                    : <Link to={a.pfad} className="knopf">My {a.titel} overlays</Link>}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-white/55">{a.titel} runs on live cup data and is part of VIP. With a free account you get the cup timer and the offspawn score.</p>
                <button type="button" onClick={() => oeffnen('schluessel')} className="knopf-prim mt-4">Enter access key</button>
              </>
            )}
          </div>

          <div className="fl-fest p-5">
            <TafelKopf n={3} titel="Copy to OBS" rechts={<span className="zahl font-mono text-[11px] text-white/45">{obs.b} × {obs.h}</span>} />
            {frei && eigene.length > 0 && (
              <div className="space-y-2.5">
                {eigene.slice(0, 4).map((o) => (
                  <div key={o.id}>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white/80">{o.name}</span>
                      <Link to={`${a.pfad}?id=${encodeURIComponent(o.id)}&bauen=1`} reloadDocument className="text-[11px] font-semibold text-akz hover:brightness-125">Edit</Link>
                    </div>
                    <KopierFeld wert={overlayAdresse(o.typ, o.id)} klein />
                  </div>
                ))}
                {eigene.length > 4 && <Link to={a.pfad} className="knopf-leer text-xs">+{eigene.length - 4} more</Link>}
              </div>
            )}
            {frei && istCustom && (
              <div className={eigene.length ? 'mt-4' : ''}>
                <p className="mb-1 text-xs font-semibold text-white/70">Try it right now – default look</p>
                <KopierFeld wert={customParamUrl(CUSTOM_STANDARD, OV)} klein />
              </div>
            )}
            {frei && !eigene.length && !istCustom && (
              <p className="rounded-xl border border-dashed border-white/10 px-4 py-4 text-center text-xs text-white/45">Create a {a.titel.toLowerCase()} first – its OBS URL shows up here. The URL never changes: what you adjust later is on stream within seconds.</p>
            )}
            {!frei && <p className="text-xs text-white/45">Unlock VIP to get an OBS URL for this overlay.</p>}
            <div className="mt-4 border-t border-white/[0.06] pt-4"><ObsSchritte breite={obs.b} hoehe={obs.h} kompakt /></div>
          </div>

          <div className="fl-fest p-5 text-xs leading-relaxed text-white/55 lg:col-span-2 2xl:col-span-1">
            <p><b className="text-white/80">Crisp at 1080p.</b> Never stretch the source in OBS – use the overlay's own size setting. Blurry text almost always means the source was scaled.</p>
            <p className="mt-2"><b className="text-white/80">Transparent by default.</b> Leave the custom CSS field in OBS empty.</p>
            <p className="mt-2"><b className="text-white/80">Every overlay you saved</b> is in your archive – <Link to="/streamer/vip#archiv" className="text-akz hover:brightness-125">VIP → My archive</Link>.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
