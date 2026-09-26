'use client';

/*
 * Der Reiter "Organizations" der Statistik (Daten: app/api/orgs, lib/orgs).
 *
 * Der Betreiber (26.9.2026): die Organisationen im Werkzeug, "einfach dass
 * man die Spieler clean sieht"; ein Klick auf einen Spieler fuehrt in sein
 * Profil; je Spieler, was er fuer die Org gewonnen hat - dieses Jahr, und
 * erst ab seinem Beitritt ("Part of ... since ...").
 *
 * Oben alle Orgs nach ihrem Preisgeld des Jahres, ein Klick oeffnet eine
 * Org mit ihren Spielern. Kein "mehr anzeigen": die Liste steht ganz da.
 */

import { useEffect, useMemo, useState } from 'react';
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
  region: string | null; gesamt: number | null;
  spieler: OrgSpielerAnzeige[];
  extras: Array<{ titel: string; betrag: number; datum: string | null }>;
}
interface Antwort { jahr: number; stand: number | null; orgs: OrgAnzeige[] }

/** Zwei Buchstaben, wo noch kein Logo hinterlegt ist. */
function kuerzel(name: string) {
  const w = name.replace(/\b(Esports?|E-sports?|Gaming|Clan|Team)\b/gi, '').trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w.map((x) => x[0]).join('') : (w[0] ?? name).slice(0, 3)).slice(0, 3).toUpperCase();
}

function Logo({ org, groesse }: { org: OrgAnzeige; groesse: number }) {
  const [kaputt, setKaputt] = useState(false);
  const stil = { width: groesse, height: groesse };
  if (!org.logo || kaputt) {
    return (
      <span style={stil} aria-hidden="true"
        className="flex shrink-0 items-center justify-center rounded-xl border border-dashed
                   border-zinc-700 bg-zinc-900 text-sm font-bold tracking-wide text-slate-500">
        {kuerzel(org.name)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={org.logo} alt="" style={stil} onError={() => setKaputt(true)}
      className="shrink-0 rounded-xl bg-zinc-900 object-contain p-1.5" />
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
  const tag = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(ort, {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  const regionen = useMemo(() => {
    const da = new Set((daten?.orgs ?? []).map((o) => o.region).filter(Boolean) as string[]);
    return REGIONEN_REIHE.filter((r) => da.has(r));
  }, [daten]);
  const sichtbar = useMemo(() => (daten?.orgs ?? [])
    .filter((o) => region === 'alle' || o.region === region), [daten, region]);

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

  /* ---------------------------------------------------- Eine Org offen */
  if (org) {
    return (
      <div className="space-y-6">
        <button type="button" onClick={() => setOffen(null)}
          className="text-sm text-slate-400 transition hover:text-sky-400">
          ← <T>Alle Organisationen</T>
        </button>

        <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <Logo org={org} groesse={96} />
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold text-slate-100">{org.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-400">
              {org.region && (
                <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${regionFarbe(org.region).marke}`}>
                  {org.region}
                </span>
              )}
              <span>{org.spieler.length} <T>Spieler</T></span>
              {org.website && (
                <a href={org.website} target="_blank" rel="noopener noreferrer"
                  className="text-sky-400 hover:underline">{new URL(org.website).hostname.replace(/^www\./, '')}</a>
              )}
              {org.x && (
                <a href={`https://x.com/${org.x}`} target="_blank" rel="noopener noreferrer"
                  className="text-sky-400 hover:underline">@{org.x}</a>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-slate-500">
              <T>Für die Organisation gewonnen</T> · {daten.jahr}
            </div>
            <div className="mt-1 text-3xl font-bold tabular-nums text-slate-100">
              {org.gesamt === null ? '—' : geld.format(org.gesamt)}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-zinc-800">
          {org.spieler.map((s, i) => {
            const klickbar = !!s.epicId;
            const inhalt = (
              <>
                {s.bild ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.bild} alt="" className="h-12 w-12 shrink-0 rounded-full bg-zinc-800 object-cover object-top" />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-800
                                   text-sm font-bold text-slate-500">
                    {s.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {s.land && <TeamFlagge groesse={18} laender={[s.land]} />}
                    <span className={`truncate text-base font-semibold ${klickbar ? 'text-slate-100' : 'text-slate-400'}`}>
                      {s.name}
                    </span>
                  </div>
                  <div className="mt-0.5 text-sm text-slate-500">
                    {s.seit
                      ? <>{t('Teil von')} {org.name} {t('seit')} {tag(s.seit)}</>
                      : !klickbar ? <T>Kein Konto verknüpft</T> : null}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold tabular-nums text-slate-100"
                    title={s.betrag === null ? t('Wird innerhalb der nächsten Stunde gerechnet') : undefined}>
                    {s.betrag === null ? '—' : geld.format(s.betrag)}
                  </div>
                  {!!s.turniere && (
                    <div className="text-xs text-slate-500">
                      {s.turniere} {s.turniere === 1 ? t('bezahltes Turnier') : t('bezahlte Turniere')}
                    </div>
                  )}
                </div>
              </>
            );
            const zeile = `flex w-full items-center gap-4 px-5 py-3.5 text-left ${i ? 'border-t border-zinc-800/80' : ''}`;
            return klickbar ? (
              <button key={`${s.epicId}-${i}`} type="button" onClick={() => aufSpieler(s.epicId!, s.name)}
                title={t('Profil öffnen')}
                className={`${zeile} transition hover:bg-zinc-900/70`}>
                {inhalt}
              </button>
            ) : (
              <div key={`${s.name}-${i}`} className={zeile}>{inhalt}</div>
            );
          })}
        </div>

        {org.extras.length > 0 && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
              <T>Weitere Einnahmen der Organisation</T>
            </h3>
            {org.extras.map((e, i) => (
              <div key={i} className="flex items-center justify-between gap-4 py-1.5 text-base">
                <span className="text-slate-200">{e.titel}{e.datum && <span className="ml-2 text-sm text-slate-500">{tag(e.datum)}</span>}</span>
                <span className="font-semibold tabular-nums text-slate-100">{geld.format(e.betrag)}</span>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-slate-500">
          <T>Preisgeld aus Epics Ergebnissen und Auszahlungstabellen und von den LAN-Events, je Spieler ab dem Tag seines Beitritts.</T> · {standText}
        </p>
      </div>
    );
  }

  /* ---------------------------------------------------------- Die Liste */
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-100"><T>Organisationen</T></h2>
          <p className="mt-1 text-sm text-slate-400">
            <T>Preisgeld für die Organisation, gezählt ab dem Beitritt jedes Spielers</T> · {daten.jahr}
          </p>
        </div>
        {regionen.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {['alle', ...regionen].map((r) => (
              <button key={r} type="button" onClick={() => setRegion(r)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${r === 'alle'
                  ? (region === r ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                    : 'border-zinc-800 text-slate-400 hover:border-zinc-600 hover:text-slate-200')
                  : (region === r ? regionFarbe(r).marke : `${regionFarbe(r).ruhig} hover:brightness-125`)}`}>
                {r === 'alle' ? t('Alle') : r}
              </button>
            ))}
          </div>
        )}
      </div>

      {!sichtbar.length ? (
        <p className="rounded-2xl border border-zinc-800 px-5 py-6 text-sm text-slate-400">
          <T>Noch keine Organisationen</T>
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sichtbar.map((o) => (
            <button key={o.id} type="button" onClick={() => { setOffen(o.id); window.scrollTo({ top: 0 }); }}
              className="flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 text-left
                         transition hover:border-sky-500/60 hover:bg-zinc-900/70">
              <Logo org={o} groesse={56} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold text-slate-100">{o.name}</div>
                <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                  {o.region && (
                    <span className={`rounded border px-1.5 py-px text-xs font-semibold ${regionFarbe(o.region).marke}`}>
                      {o.region}
                    </span>
                  )}
                  <span>{o.spieler.length} <T>Spieler</T></span>
                </div>
              </div>
              <div className="text-right text-base font-semibold tabular-nums text-slate-100">
                {o.gesamt === null ? '—' : geld.format(o.gesamt)}
              </div>
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-500">{standText}</p>
    </div>
  );
}
