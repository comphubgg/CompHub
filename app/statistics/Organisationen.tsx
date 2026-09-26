'use client';

/*
 * Der Reiter "Organizations" der Statistik (Daten: app/api/orgs, lib/orgs).
 *
 * Der Betreiber (26.9.2026): die Organisationen im Werkzeug, ein Klick auf
 * einen Spieler fuehrt in sein Profil, je Spieler, was er fuer die Org
 * gewonnen hat - dieses Jahr, ab seinem Beitritt ("Part of ... since ...").
 * Zur ersten Fassung: "zu simpel ... mehr ueber die E-Sports ziehen ...
 * direkt Logo, am besten Socials vom E-Sports-Team, so drei nebeneinander,
 * direkt unter dem Logo ... darunter alle Spieler mit den Earnings".
 *
 * Also: die Uebersicht mit den drei staerksten Orgs vorn, darunter alle als
 * Karten mit Land; eine Org als eigene Seite - Logo gross in der Mitte vor
 * seinem eigenen, verwischten Abbild, darunter die Kanaele, die Zahlen und
 * der Kader als Spielerkarten mit Foto.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import T from '@/app/components/T';
import LadeSchirm from '@/app/components/LadeSchirm';
import TeamFlagge from '@/components/TeamFlagge';
import { useSprache, useT } from '@/app/components/SprachProvider';
import { ortVon } from '@/app/lib/ort';
import { regionFarbe, REGIONEN_REIHE } from '@/lib/regionFarbe';

interface OrgSpielerAnzeige {
  epicId: string | null; name: string; land: string | null; bild: string | null;
  seit: string | null; betrag: number | null; turniere: number | null;
}
interface OrgAnzeige {
  id: string; name: string; logo: string | null; website: string | null; x: string | null;
  youtube?: string | null; twitch?: string | null; instagram?: string | null; tiktok?: string | null;
  land?: string | null; region: string | null; gesamt: number | null;
  spieler: OrgSpielerAnzeige[];
  extras: Array<{ titel: string; betrag: number; datum: string | null }>;
}
interface Antwort { jahr: number; stand: number | null; orgs: OrgAnzeige[] }

/* ------------------------------------------------------------ Zeichen */

/** Die Kanaele einer Org - Adresse, Name und Zeichen. */
function kanaele(o: OrgAnzeige): Array<{ art: string; url: string; titel: string; zeichen: ReactNode }> {
  const raus: Array<{ art: string; url: string; titel: string; zeichen: ReactNode }> = [];
  const voll = (p: string) => <path d={p} fill="currentColor" />;
  if (o.x) raus.push({ art: 'x', url: `https://x.com/${o.x}`, titel: `@${o.x}`,
    zeichen: voll('M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.13H5.12z') });
  if (o.website) raus.push({ art: 'web', url: o.website, titel: o.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''),
    zeichen: <g fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" /></g> });
  if (o.youtube) raus.push({ art: 'youtube',
    url: /^UC[\w-]{22}$/.test(o.youtube) ? `https://www.youtube.com/channel/${o.youtube}` : `https://www.youtube.com/@${o.youtube}`,
    titel: 'YouTube',
    zeichen: voll('M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.3 3.6z') });
  if (o.twitch) raus.push({ art: 'twitch', url: `https://www.twitch.tv/${o.twitch}`, titel: 'Twitch',
    zeichen: voll('M11.57 4.71h1.72v5.15h-1.72zm4.72 0H18v5.15h-1.71zM6 0 1.71 4.29v15.42h5.15V24l4.28-4.29h3.43L22.29 12V0zm14.57 11.14-3.43 3.43h-3.43l-3 3v-3H6.86V1.71h13.71z') });
  if (o.instagram) raus.push({ art: 'instagram', url: `https://www.instagram.com/${o.instagram}`, titel: 'Instagram',
    zeichen: <g fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" /></g> });
  if (o.tiktok) raus.push({ art: 'tiktok', url: `https://www.tiktok.com/@${o.tiktok}`, titel: 'TikTok',
    zeichen: voll('M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z') });
  return raus;
}

/** Zwei, drei Buchstaben, wo noch kein Logo hinterlegt ist. */
function kuerzel(name: string) {
  const w = name.replace(/\b(Esports?|E-sports?|Gaming|Clan|Club|Team)\b/gi, '').trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w.map((x) => x[0]).join('') : (w[0] ?? name).slice(0, 3)).slice(0, 3).toUpperCase();
}

function Logo({ org, groesse, runder = false }: { org: OrgAnzeige; groesse: number; runder?: boolean }) {
  const [kaputt, setKaputt] = useState(false);
  const stil = { width: groesse, height: groesse };
  const form = runder ? 'rounded-3xl' : 'rounded-xl';
  if (!org.logo || kaputt) {
    return (
      <span style={{ ...stil, fontSize: groesse / 3.2 }} aria-hidden="true"
        className={`flex shrink-0 items-center justify-center ${form} border border-zinc-700 bg-zinc-900
                    font-black tracking-wide text-slate-400`}>
        {kuerzel(org.name)}
      </span>
    );
  }
  // Der Rand in Pixeln aus der Groesse - ein Prozentwert bezoege sich auf
  // die Breite der ganzen Karte, und im breiten Kopf blieb vom Logo ein Punkt.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={org.logo} alt="" style={{ ...stil, padding: Math.round(groesse * 0.06) }} onError={() => setKaputt(true)}
      className={`shrink-0 ${form} bg-zinc-900 object-contain shadow-lg shadow-black/40`} />
  );
}

/** Das Logo, gross und verwischt, als Grund hinter einer Karte. */
function Schein({ logo, staerke = 'opacity-[0.16]' }: { logo: string | null; staerke?: string }) {
  if (!logo) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo} alt="" aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full scale-150 object-cover blur-3xl ${staerke}`} />
  );
}

export default function Organisationen({ aufSpieler }: {
  /** Ein Profil oeffnen - dasselbe Fenster wie ueberall in der Statistik. */
  aufSpieler: (epicId: string, name: string) => void;
}) {
  const t = useT();
  const { sprache } = useSprache();
  const ort = ortVon(sprache);
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [fehler, setFehler] = useState('');
  const [region, setRegion] = useState<string>('alle');
  const [suche, setSuche] = useState('');
  const [offen, setOffen] = useState<string | null>(null);

  useEffect(() => {
    let weg = false;
    fetch('/api/orgs', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (weg) return;
        if (!r.ok || !j?.orgs) { setFehler(j?.fehler ?? t('Die Organisationen ließen sich gerade nicht laden.')); return; }
        setDaten(j as Antwort);
      })
      .catch(() => { if (!weg) setFehler(t('Die Organisationen ließen sich gerade nicht laden.')); });
    return () => { weg = true; };
  }, [t]);

  const geld = useMemo(() => new Intl.NumberFormat(ort, {
    style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0,
  }), [ort]);
  const landName = useMemo(() => {
    let dn: Intl.DisplayNames | null = null;
    try { dn = new Intl.DisplayNames([ort], { type: 'region' }); } catch { dn = null; }
    return (c?: string | null) => (c && dn ? dn.of(c) ?? c : c ?? '');
  }, [ort]);
  const tag = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(ort, {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  const regionen = useMemo(() => {
    const da = new Set((daten?.orgs ?? []).map((o) => o.region).filter(Boolean) as string[]);
    return REGIONEN_REIHE.filter((r) => da.has(r));
  }, [daten]);
  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return (daten?.orgs ?? [])
      .filter((o) => region === 'alle' || o.region === region)
      .filter((o) => !q || o.name.toLowerCase().includes(q));
  }, [daten, region, suche]);

  if (fehler) {
    return (
      <div className="rounded-2xl border border-amber-800/60 bg-amber-950/20 px-5 py-4 text-sm text-amber-200">
        {fehler}
      </div>
    );
  }
  if (!daten) return <LadeSchirm />;

  const org = offen ? daten.orgs.find((o) => o.id === offen) ?? null : null;
  const standText = daten.stand
    ? `${t('Stand')} ${new Date(daten.stand).toLocaleString(ort, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
    : t('Wird innerhalb der nächsten Stunde gerechnet');
  const betragText = (o: OrgAnzeige) => (o.gesamt === null ? '—' : geld.format(o.gesamt));

  /* ---------------------------------------------------- Eine Org offen */
  if (org) {
    const kanal = kanaele(org);
    const turniere = org.spieler.reduce((a, s) => a + (s.turniere ?? 0), 0);
    return (
      <div className="space-y-8">
        <button type="button" onClick={() => setOffen(null)}
          className="text-sm text-slate-400 transition hover:text-sky-400">
          ← <T>Alle Organisationen</T>
        </button>

        {/* ------------------------------------------------- Der Kopf */}
        <section className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950">
          <Schein logo={org.logo} />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-zinc-950/40 to-zinc-950" />
          <div className="relative flex flex-col items-center px-6 pb-8 pt-12 text-center">
            <Logo org={org} groesse={148} runder />
            <h1 className="mt-6 text-4xl font-black tracking-tight text-slate-50 sm:text-5xl">{org.name}</h1>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2.5 text-sm text-slate-300">
              {org.land && <TeamFlagge groesse={20} laender={[org.land]} />}
              {org.land && <span>{landName(org.land)}</span>}
              {org.region && (
                <span className={`rounded-md border px-2 py-0.5 text-xs font-bold ${regionFarbe(org.region).marke}`}>
                  {org.region}
                </span>
              )}
            </div>
            {kanal.length > 0 && (
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {kanal.map((k) => (
                  <a key={k.art} href={k.url} target="_blank" rel="noopener noreferrer" title={k.titel}
                    aria-label={k.titel}
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900/80
                               text-slate-200 backdrop-blur transition hover:-translate-y-0.5 hover:border-sky-500 hover:text-sky-400">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">{k.zeichen}</svg>
                  </a>
                ))}
              </div>
            )}
          </div>
          <div className="relative grid grid-cols-3 border-t border-zinc-800/80 bg-zinc-950/70 backdrop-blur">
            {([
              [<><T>Für die Organisation gewonnen</T> · {daten.jahr}</>, betragText(org)],
              [<T key="s">Spieler</T>, String(org.spieler.length)],
              [<T key="b">Bezahlte Turniere</T>, org.gesamt === null ? '—' : String(turniere)],
            ] as Array<[ReactNode, string]>).map(([titel, wert], i) => (
              <div key={i} className={`px-4 py-5 text-center ${i ? 'border-l border-zinc-800/80' : ''}`}>
                <div className="text-2xl font-black tabular-nums text-slate-50 sm:text-3xl">{wert}</div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{titel}</div>
              </div>
            ))}
          </div>
        </section>

        {/* --------------------------------------------------- Der Kader */}
        <section>
          <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-sky-400"><T>Kader</T></h2>
          {!org.spieler.length ? (
            <p className="rounded-2xl border border-zinc-800 px-5 py-6 text-sm text-slate-400">
              <T>Für diese Organisation sind noch keine Spieler eingetragen.</T>
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {org.spieler.map((s, i) => {
                const klickbar = !!s.epicId;
                const karte = (
                  <>
                    <div className="relative aspect-[4/5] overflow-hidden bg-gradient-to-b from-zinc-800 to-zinc-950">
                      {s.bild ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.bild} alt="" className="h-full w-full object-cover object-top transition duration-300 group-hover:scale-105" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-6xl font-black text-zinc-700">
                          {s.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950 via-zinc-950/85 to-transparent px-4 pb-3 pt-12">
                        <div className="flex items-center gap-2">
                          {s.land && <TeamFlagge groesse={18} laender={[s.land]} />}
                          <span className={`truncate text-lg font-extrabold ${klickbar ? 'text-slate-50' : 'text-slate-400'}`}>{s.name}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-slate-400">
                          {s.seit ? <>{t('Teil von')} {org.name} {t('seit')} {tag(s.seit)}</>
                            : !klickbar ? <T>Kein Konto verknüpft</T> : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-end justify-between gap-2 border-t border-zinc-800 px-4 py-3">
                      <span className="text-[11px] uppercase tracking-wider text-slate-500">
                        {daten.jahr}
                        {!!s.turniere && <> · {s.turniere} {s.turniere === 1 ? t('bezahltes Turnier') : t('bezahlte Turniere')}</>}
                      </span>
                      <span className="text-lg font-bold tabular-nums text-slate-50"
                        title={s.betrag === null ? t('Wird innerhalb der nächsten Stunde gerechnet') : undefined}>
                        {s.betrag === null ? '—' : geld.format(s.betrag)}
                      </span>
                    </div>
                  </>
                );
                const stil = 'group overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 text-left transition';
                return klickbar ? (
                  <button key={`${s.epicId}-${i}`} type="button" onClick={() => aufSpieler(s.epicId!, s.name)}
                    title={t('Profil öffnen')} className={`${stil} hover:-translate-y-0.5 hover:border-sky-500/70`}>
                    {karte}
                  </button>
                ) : (
                  <div key={`${s.name}-${i}`} className={stil}>{karte}</div>
                );
              })}
            </div>
          )}
        </section>

        {org.extras.length > 0 && (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-sky-400">
              <T>Weitere Einnahmen der Organisation</T>
            </h2>
            {org.extras.map((e, i) => (
              <div key={i} className="flex items-center justify-between gap-4 py-1.5 text-base">
                <span className="text-slate-200">{e.titel}{e.datum && <span className="ml-2 text-sm text-slate-500">{tag(e.datum)}</span>}</span>
                <span className="font-bold tabular-nums text-slate-50">{geld.format(e.betrag)}</span>
              </div>
            ))}
          </section>
        )}

        <p className="text-xs text-slate-500">
          <T>Preisgeld aus Epics Ergebnissen und Auszahlungstabellen und von den LAN-Events, je Spieler ab dem Tag seines Beitritts.</T> · {standText}
        </p>
      </div>
    );
  }

  /* ---------------------------------------------------------- Die Liste */
  const oeffne = (id: string) => { setOffen(id); window.scrollTo({ top: 0 }); };
  const mitGeld = sichtbar.filter((o) => (o.gesamt ?? 0) > 0);
  const podest = !suche.trim() ? mitGeld.slice(0, 3) : [];
  const rest = sichtbar.filter((o) => !podest.includes(o));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400">Esports · {daten.jahr}</div>
          <h2 className="mt-1 text-3xl font-black tracking-tight text-slate-50"><T>Organisationen</T></h2>
          <p className="mt-1 text-sm text-slate-400">
            <T>Preisgeld für die Organisation, gezählt ab dem Beitritt jedes Spielers</T>
          </p>
        </div>
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Organisation suchen …')}
          className="w-full max-w-xs rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-slate-100
                     outline-none placeholder:text-slate-600 focus:border-sky-500" />
      </header>

      {regionen.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {['alle', ...regionen].map((r) => (
            <button key={r} type="button" onClick={() => setRegion(r)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${r === 'alle'
                ? (region === r ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                  : 'border-zinc-800 text-slate-400 hover:border-zinc-600 hover:text-slate-200')
                : (region === r ? regionFarbe(r).marke : `${regionFarbe(r).ruhig} hover:brightness-125`)}`}>
              {r === 'alle' ? t('Alle') : r}
            </button>
          ))}
        </div>
      )}

      {/* ------------------------------------------------- Das Podest */}
      {podest.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {podest.map((o, i) => (
            <button key={o.id} type="button" onClick={() => oeffne(o.id)}
              className="group relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 p-6 text-left transition
                         hover:-translate-y-0.5 hover:border-sky-500/70">
              <Schein logo={o.logo} staerke="opacity-[0.22]" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent" />
              <div className="relative flex items-start justify-between">
                <Logo org={o} groesse={96} runder />
                <span className={`text-4xl font-black tabular-nums ${i === 0 ? 'text-amber-300' : i === 1 ? 'text-slate-300' : 'text-orange-400'}`}>
                  #{i + 1}
                </span>
              </div>
              <div className="relative mt-5">
                <div className="truncate text-xl font-extrabold text-slate-50">{o.name}</div>
                <div className="mt-1 flex items-center gap-2 text-sm text-slate-400">
                  {o.land && <TeamFlagge groesse={16} laender={[o.land]} />}
                  <span className="truncate">{landName(o.land)}</span>
                  <span>· {o.spieler.length} <T>Spieler</T></span>
                </div>
                <div className="mt-4 text-3xl font-black tabular-nums text-slate-50">{betragText(o)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* --------------------------------------------------- Alle Orgs */}
      {!rest.length && !podest.length ? (
        <p className="rounded-2xl border border-zinc-800 px-5 py-6 text-sm text-slate-400">
          <T>Noch keine Organisationen</T>
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rest.map((o) => (
            <button key={o.id} type="button" onClick={() => oeffne(o.id)}
              className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4
                         text-left transition hover:-translate-y-0.5 hover:border-sky-500/60">
              <Logo org={o} groesse={64} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-bold text-slate-100">{o.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                  {o.land && <TeamFlagge groesse={14} laender={[o.land]} />}
                  <span className="truncate">{o.spieler.length ? `${o.spieler.length} ${t('Spieler')}` : landName(o.land)}</span>
                </div>
                <div className="mt-1.5 text-sm font-bold tabular-nums text-slate-200">
                  {o.spieler.length ? betragText(o) : <span className="font-normal text-slate-600"><T>Kader folgt</T></span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-500">{standText}</p>
    </div>
  );
}
