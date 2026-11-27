import { useEffect, useState, type ReactNode } from 'react';
import T from './T';
import { useSprache } from './SprachProvider';
import TeamFlagge from '../../components/TeamFlagge';
import { landNach } from '../../lib/laender';

/*
 * Woher die Besucher kommen - unter den Nutzungszahlen im Dashboard (Betreiber, 18.11.2026: "woher - Laender, und mehr").
 *
 * Nur Summen (lib/besuchDetails, /api/statistik/besucher): Land, Geraet, Quelle, Seiten, meistbesuchte Profile. Prozente
 * bei Land und Geraet beziehen sich auf Besucher (Browser je Tag), bei den Quellen auf Sitzungen (erster Aufruf eines
 * Reiters), bei den Seiten auf Aufrufe - jeweils dazugeschrieben, weil die drei verschieden gross sind.
 */

interface Paar { besucher: number; aufrufe: number }
interface Daten {
  spanne: 'gestern' | '7' | '30';
  von: string; bis: string;
  gesamt: { besucher: number; aufrufe: number };
  laender: Array<Paar & { code: string }>;
  art: Array<Paar & { name: string }>;
  system: Array<Paar & { name: string }>;
  browser: Array<Paar & { name: string }>;
  quellen: Array<{ name: string; sitzungen: number }>;
  hosts: Array<{ name: string; sitzungen: number }>;
  utm: Array<{ name: string; sitzungen: number }>;
  seiten: Array<{ pfad: string; aufrufe: number }>;
  spieler: Array<{ id: string; aufrufe: number; name: string | null }>;
  orte: Array<Paar & { name: string }>;
  koepfe: Record<string, number>;
  seit: string | null;
  ortVerfuegbar: boolean;
}

const SPANNEN = [
  { wert: 'gestern', text: 'Gestern' },
  { wert: '7', text: '7 Tage' },
  { wert: '30', text: '30 Tage' },
] as const;

const ART_FARBE: Record<string, string> = { Handy: '#0ea5e9', Computer: '#34d399', Tablet: '#fbbf24' };

const prozent = (teil: number, ganz: number) => (ganz > 0 ? `${((teil / ganz) * 100).toFixed(teil / ganz < 0.1 ? 1 : 0)} %` : '—');
const kurz = (tag: string) => { const [, m, d] = tag.split('-'); return `${Number(d)}.${Number(m)}.`; };

/** Eine Zeile mit Balken: links die Bezeichnung, rechts Anteil und Zahl. */
function Zeile({ links, wert, ganz, zusatz, farbe = '#0ea5e9' }: {
  links: ReactNode; wert: number; ganz: number; zusatz?: string; farbe?: string;
}) {
  const anteil = ganz > 0 ? wert / ganz : 0;
  return (
    <li className="relative overflow-hidden rounded-md px-2 py-1">
      <span aria-hidden className="absolute inset-y-0 left-0 rounded-md opacity-15"
        style={{ width: `${Math.max(anteil * 100, wert > 0 ? 1 : 0)}%`, background: farbe }} />
      <span className="relative flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-2 text-white/85">{links}</span>
        <span className="shrink-0 tabular-nums text-white/55">
          <span className="font-semibold text-white/85">{prozent(wert, ganz)}</span>
          <span className="ml-1.5 text-white/40">{wert}{zusatz ? ` ${zusatz}` : ''}</span>
        </span>
      </span>
    </li>
  );
}

function Kasten({ titel, hinweis, children }: { titel: string; hinweis?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-white/85"><T>{titel}</T></h3>
        {hinweis && <span className="text-[11px] text-white/40"><T>{hinweis}</T></span>}
      </div>
      {children}
    </div>
  );
}

export default function Besucherherkunft() {
  const { sprache, t } = useSprache();
  const [spanne, setSpanne] = useState<string>('7');
  const [daten, setDaten] = useState<Daten | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState('');
  const [alleLaender, setAlleLaender] = useState(false);

  useEffect(() => {
    let ab = false;
    void (async () => {
      try {
        const r = await fetch(`/api/statistik/besucher?spanne=${spanne}`, { cache: 'no-store' });
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as Daten;
        // Ohne Rechte kommt 200 mit {fehler} - dann nicht zeichnen
        if (!j?.gesamt || !Array.isArray(j.laender)) throw new Error('keine Daten');
        if (!ab) { setDaten(j); setFehler(''); }
      } catch {
        if (!ab) setFehler(t('Die Zahlen ließen sich nicht laden.'));
      } finally {
        if (!ab) setLaedt(false);
      }
    })();
    return () => { ab = true; };
  }, [spanne, t]);

  const landName = (code: string) => {
    if (code === '??') return t('Unbekannt');
    const l = landNach(code);
    return l ? (sprache === 'de' ? l.de : l.en) : code;
  };

  const summe = <K extends string>(liste: Array<Record<K, number>>, k: K) => liste.reduce((a, x) => a + (x[k] || 0), 0);
  const besucherLaender = daten ? summe(daten.laender, 'besucher') : 0;
  const besucherArt = daten ? summe(daten.art, 'besucher') : 0;
  const sitzungen = daten ? summe(daten.quellen, 'sitzungen') : 0;
  const aufrufeSeiten = daten ? summe(daten.seiten, 'aufrufe') : 0;
  const aufrufeLaender = daten ? summe(daten.laender, 'aufrufe') : 0;
  const leer = daten && aufrufeLaender === 0;

  return (
    <section className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-white"><T>Besucher</T></h2>
          <span className="text-xs text-white/40"><T>woher sie kommen · nur Summen, keine Einzelbesuche</T></span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {SPANNEN.map((s) => (
            <button key={s.wert} type="button" onClick={() => { if (s.wert !== spanne) { setLaedt(true); setSpanne(s.wert); } }} aria-pressed={spanne === s.wert}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                spanne === s.wert ? 'bg-sky-500/15 text-sky-400' : 'border border-white/10 text-white/40 hover:text-white/70'}`}>
              <T>{s.text}</T>
            </button>
          ))}
        </div>
      </div>

      {fehler && <p className="mt-3 text-sm text-rose-400">{fehler}</p>}
      {laedt && !daten && <p className="mt-3 text-sm text-white/40"><T>Wird geladen …</T></p>}

      {daten && (
        <>
          <p className="mt-2 text-xs text-white/40">
            {daten.von === daten.bis ? kurz(daten.von) : `${kurz(daten.von)} – ${kurz(daten.bis)}`}
            {' · '}{daten.gesamt.besucher} <T>Besucher</T> · {daten.gesamt.aufrufe} <T>Aufrufe</T> · {sitzungen} <T>Sitzungen mit Quelle</T>
            {daten.seit && daten.seit > daten.von && (
              <span className="text-amber-500/80"> · <T>Aufschlüsselung erfasst seit</T> {kurz(daten.seit)}</span>
            )}
          </p>

          {leer ? (
            <p className="mt-3 text-sm text-white/40"><T>Für diesen Zeitraum liegt noch keine Aufschlüsselung vor.</T></p>
          ) : (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <Kasten titel="Länder" hinweis="Anteil der Besucher">
                <ul className="space-y-0.5">
                  {(alleLaender ? daten.laender : daten.laender.slice(0, 12)).map((l) => (
                    <Zeile key={l.code} wert={l.besucher} ganz={besucherLaender} zusatz={`· ${l.aufrufe} ${t('Aufr.')}`}
                      links={<>
                        <TeamFlagge groesse={16} laender={[l.code === '??' ? undefined : l.code]} />
                        <span className="truncate">{landName(l.code)}</span>
                        {l.code !== '??' && <span className="text-[10px] text-white/40">{l.code}</span>}
                      </>} />
                  ))}
                </ul>
                {daten.laender.length > 12 && (
                  <button type="button" onClick={() => setAlleLaender((a) => !a)}
                    className="mt-1.5 text-[11px] font-semibold text-sky-400 hover:text-sky-300">
                    {alleLaender ? <T>Weniger zeigen</T> : <>{t('Alle zeigen')} ({daten.laender.length})</>}
                  </button>
                )}
              </Kasten>

              <Kasten titel="Geräte" hinweis="Anteil der Besucher">
                <div className="flex h-3 overflow-hidden rounded-full bg-white/[0.07]" aria-hidden>
                  {daten.art.map((a) => (
                    <div key={a.name} style={{ width: `${besucherArt ? (a.besucher / besucherArt) * 100 : 0}%`, background: ART_FARBE[a.name] ?? '#64748b' }} />
                  ))}
                </div>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {daten.art.map((a) => (
                    <li key={a.name} className="flex items-center gap-1.5 text-white/70">
                      <span className="inline-block h-2 w-2 rounded-sm" style={{ background: ART_FARBE[a.name] ?? '#64748b' }} />
                      <T>{a.name}</T> <span className="font-semibold text-white">{prozent(a.besucher, besucherArt)}</span>
                      <span className="text-white/40">{a.besucher}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-white/40"><T>System</T></p>
                    <ul className="space-y-0.5">
                      {daten.system.slice(0, 6).map((s) => (
                        <Zeile key={s.name} wert={s.besucher} ganz={besucherArt} farbe="#34d399" links={<span className="truncate">{s.name}</span>} />
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-white/40"><T>Browser</T></p>
                    <ul className="space-y-0.5">
                      {daten.browser.slice(0, 6).map((s) => (
                        <Zeile key={s.name} wert={s.besucher} ganz={besucherArt} farbe="#a78bfa" links={<span className="truncate">{s.name}</span>} />
                      ))}
                    </ul>
                  </div>
                </div>
              </Kasten>

              <Kasten titel="Quellen" hinweis="Anteil der Sitzungen">
                {daten.quellen.length === 0 ? (
                  <p className="text-xs text-white/40"><T>Noch keine Sitzung mit Quelle gezählt.</T></p>
                ) : (
                  <ul className="space-y-0.5">
                    {daten.quellen.map((q) => (
                      <Zeile key={q.name} wert={q.sitzungen} ganz={sitzungen} farbe="#f472b6" links={<span className="truncate"><T>{q.name}</T></span>} />
                    ))}
                  </ul>
                )}
                {daten.hosts.length > 0 && (
                  <p className="mt-2 text-[11px] leading-relaxed text-white/40">
                    <T>Hinter „Andere“</T>: {daten.hosts.map((h) => `${h.name} (${h.sitzungen})`).join(', ')}
                  </p>
                )}
                {daten.utm.length > 0 && (
                  <p className="mt-1 text-[11px] leading-relaxed text-white/40">
                    utm_source: {daten.utm.map((h) => `${h.name} (${h.sitzungen})`).join(', ')}
                  </p>
                )}
              </Kasten>

              <Kasten titel="Top-Seiten" hinweis="Anteil der Aufrufe">
                <ul className="space-y-0.5">
                  {daten.seiten.slice(0, 15).map((s) => (
                    <Zeile key={s.pfad} wert={s.aufrufe} ganz={aufrufeSeiten} farbe="#38bdf8"
                      links={<code className="truncate font-mono text-[11px]">{s.pfad}</code>} />
                  ))}
                </ul>
              </Kasten>

              <Kasten titel="Meistbesuchte Spielerprofile" hinweis="Aufrufe">
                {daten.spieler.length === 0 ? (
                  <p className="text-xs text-white/40"><T>Noch kein Profil aufgerufen.</T></p>
                ) : (
                  <ol className="space-y-0.5">
                    {daten.spieler.map((s, i) => (
                      <li key={s.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs hover:bg-white/[0.08]">
                        <a href={`/statistics?spieler=${s.id}`} className="flex min-w-0 items-center gap-2 text-white/85 hover:text-sky-400">
                          <span className="w-5 shrink-0 text-right tabular-nums text-white/40">{i + 1}.</span>
                          <span className="truncate">{s.name ?? <span className="font-mono text-[10px] text-white/40">{s.id.slice(0, 12)}…</span>}</span>
                        </a>
                        <span className="shrink-0 tabular-nums text-white/55">{s.aufrufe}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </Kasten>

              <Kasten titel="Städte" hinweis={daten.ortVerfuegbar ? 'Anteil der Besucher' : undefined}>
                {daten.ortVerfuegbar ? (
                  <ul className="space-y-0.5">
                    {daten.orte.slice(0, 12).map((o) => (
                      <Zeile key={o.name} wert={o.besucher} ganz={summe(daten.orte, 'besucher')} farbe="#fbbf24"
                        links={<span className="truncate">{o.name}</span>} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs leading-relaxed text-white/40">
                    <T>Cloudflare schickt keine Stadt mit (kein cf-ipcity-Kopf in den gezählten Aufrufen). Einschalten im Cloudflare-Dashboard: Rules → Transform Rules → Managed Transforms → „Add visitor location headers“.</T>
                  </p>
                )}
              </Kasten>
            </div>
          )}

          <p className="mt-3 border-t border-white/5 pt-3 text-[11px] leading-relaxed text-white/30">
            <T>Länder und Geräte zählen Besucher (Browser je Tag), Quellen zählen Sitzungen (der erste Aufruf eines Tabs), Seiten zählen Aufrufe. Gespeichert werden nur Summen je Tag, 90 Tage lang - keine IP, keine Kennung.</T>
          </p>
        </>
      )}
    </section>
  );
}
