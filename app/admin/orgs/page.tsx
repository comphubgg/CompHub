'use client';

/*
 * E-Sports-Teams - die Organisationen pflegen (app/api/orgs, lib/orgs).
 *
 * Der Betreiber (26.9.2026): "ein neues Admin-Tool, E-Sports-Teams ...
 * Create the E-Sports-Team, Name, Webseite freiwillig, Spieler, Logo". Dazu
 * je Spieler, seit wann er dabei ist, und Einnahmen der Org selbst, die er
 * von Hand notiert (EWC Club Bonus).
 *
 * Wie ueberall im Werkzeug: getippt werden Namen, die Konto-Id sucht die
 * Oberflaeche selbst; gespeichert wird von allein; Loeschen fragt nach.
 */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

type Rolle = 'pro' | 'academy' | 'creator';
interface Spieler {
  epicId: string | null; name: string; seit: string | null; rolle: Rolle;
  x: string | null; twitch: string | null; tiktok: string | null; youtube: string | null;
  /** Foto am Eintrag - fuer Spieler ohne Konto (lib/orgs). */
  bild?: string | null;
}
/** Die Fotos je Konto aus der Antwort von /api/orgs. */
function fotosAus(orgs: Array<{ spieler: Array<{ epicId: string | null; bild?: string | null }> }>) {
  const f: Record<string, string> = {};
  for (const o of orgs) for (const s of o.spieler) if (s.epicId && s.bild) f[s.epicId] = s.bild;
  return f;
}
const ROLLEN: Array<[Rolle, string]> = [['pro', 'Pro'], ['academy', 'Academy'], ['creator', 'Content Creator']];
const neuerSpieler = (epicId: string | null, name: string, rolle: Rolle = 'pro'): Spieler => ({
  epicId, name, seit: null, rolle, x: null, twitch: null, tiktok: null, youtube: null,
});
interface Extra { titel: string; betrag: number; datum: string | null }
interface Org {
  id: string; name: string; logo: string | null; banner: string | null; website: string | null; x: string | null;
  youtube: string | null; twitch: string | null; instagram: string | null; tiktok: string | null;
  land: string | null; region: string | null; spieler: Spieler[]; extras: Extra[];
}
interface Treffer { epicId: string; name: string; anzeige?: string; land?: string | null; regionen?: string[] }

const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];
const feld = 'rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm '
  + 'text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500';

/** Namen suchen - die Konto-Id kommt aus der Suche der Statistik. */
function KontoSuche({ onWahl, platzhalter }: { onWahl: (t: Treffer) => void; platzhalter: string }) {
  const [q, setQ] = useState('');
  const [treffer, setTreffer] = useState<Treffer[]>([]);
  const [laedt, setLaedt] = useState(false);
  useEffect(() => {
    const frage = q.trim();
    if (frage.length < 2) return;
    let weg = false;
    const uhr = setTimeout(() => {
      setLaedt(true);
      fetch(`/api/szene-stats?ansicht=suche&q=${encodeURIComponent(frage)}`)
        .then((r) => r.json())
        .then((j) => { if (!weg) setTreffer((j.spieler ?? []).slice(0, 8)); })
        .catch(() => { if (!weg) setTreffer([]); })
        .finally(() => { if (!weg) setLaedt(false); });
    }, 300);
    return () => { weg = true; clearTimeout(uhr); };
  }, [q]);
  return (
    <div className="relative">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={platzhalter}
        className={`${feld} w-full`} />
      {laedt && <span className="absolute right-3 top-2.5 h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-sky-400" />}
      {q.trim().length >= 2 && treffer.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-xl">
          {treffer.map((t) => (
            <button key={t.epicId} type="button"
              onClick={() => { onWahl(t); setQ(''); setTreffer([]); }}
              className="flex w-full items-center justify-between gap-3 border-b border-zinc-900 px-3 py-2 text-left text-sm
                         text-slate-200 last:border-0 hover:bg-zinc-900">
              <span>{t.anzeige || t.name}</span>
              <span className="text-xs text-slate-500">{[t.land, (t.regionen ?? []).join('/')].filter(Boolean).join(' · ')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgsAdmin() {
  const t = useT();
  const [erlaubt, setErlaubt] = useState<boolean | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [fehler, setFehler] = useState('');
  const [wahl, setWahl] = useState<string | null>(null);
  const [stand, setStand] = useState('');
  const [loeschFrage, setLoeschFrage] = useState(false);
  const [filter, setFilter] = useState('');
  // Je Org ein eigener Takt - sonst verschluckte der Wechsel zur naechsten
  // Org die noch nicht gespeicherte Aenderung der vorigen.
  const uhren = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const orgsRef = useRef<Org[]>([]);
  useEffect(() => { orgsRef.current = orgs; }, [orgs]);
  const dateiFeld = useRef<HTMLInputElement | null>(null);
  /** Spielerfotos je Konto - kommen mit der Liste, gehoeren aber nicht zur Org. */
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const [fotoLaedt, setFotoLaedt] = useState<string | null>(null);
  const [fotoFehler, setFotoFehler] = useState('');

  useEffect(() => {
    fetch('/api/auth/check-admin', { cache: 'no-store' })
      .then((r) => r.json()).then((j) => setErlaubt(j?.isAdmin === true)).catch(() => setErlaubt(false));
    fetch('/api/orgs', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.orgs) { setFehler(j?.fehler ?? 'Storage is not answering right now.'); return; }
        setFotos(fotosAus(j.orgs));
        // Nur die gepflegten Felder - Betraege und Fotos rechnet die Anzeige.
        setOrgs(j.orgs.map((o: Org & { spieler: Array<Spieler & Record<string, unknown>> }) => ({
          id: o.id, name: o.name, logo: o.logo, banner: o.banner ?? null, website: o.website, x: o.x,
          youtube: o.youtube ?? null, twitch: o.twitch ?? null, instagram: o.instagram ?? null,
          tiktok: o.tiktok ?? null, land: o.land ?? null, region: o.region,
          // Alles, was gepflegt wird - sonst setzte das naechste Speichern
          // Rollen und Kanaele zurueck.
          spieler: o.spieler.map((s) => ({
            epicId: s.epicId, name: s.name, seit: s.seit, rolle: s.rolle ?? 'pro',
            x: s.x ?? null, twitch: s.twitch ?? null, tiktok: s.tiktok ?? null, youtube: s.youtube ?? null,
            bild: (s as { eigenesBild?: string | null }).eigenesBild ?? null,
          })),
          extras: o.extras ?? [],
        })).sort((a: Org, b: Org) => a.name.localeCompare(b.name)));
      })
      .catch(() => setFehler('Storage is not answering right now.'));
  }, []);

  /** Speichern - kurz nach der letzten Aenderung, ohne Knopf. */
  const speichere = useCallback((org: Org, sofort = false) => {
    const alt = uhren.current.get(org.id);
    if (alt) clearTimeout(alt);
    const los = async () => {
      setStand(t('Wird gespeichert …'));
      try {
        const r = await fetch('/api/orgs', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ org }),
        });
        const j = await r.json().catch(() => null);
        setStand(r.ok ? t('Gespeichert') : `${t('Nicht gespeichert')}: ${j?.fehler ?? r.status}`);
      } catch { setStand(t('Nicht gespeichert')); }
    };
    if (sofort) void los(); else uhren.current.set(org.id, setTimeout(() => { void los(); }, 700));
  }, [t]);

  const aendere = useCallback((id: string, f: (o: Org) => Org, sofort = false) => {
    const alt = orgsRef.current.find((o) => o.id === id);
    if (!alt) return;
    const neu = f(alt);
    orgsRef.current = orgsRef.current.map((o) => (o.id === id ? neu : o));
    setOrgs(orgsRef.current);
    speichere(neu, sofort);
  }, [speichere]);

  const neueOrg = async () => {
    setStand(t('Wird gespeichert …'));
    const r = await fetch('/api/orgs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org: { name: t('Neue Organisation'), spieler: [], extras: [] } }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.orgs) { setStand(`${t('Nicht gespeichert')}: ${j?.fehler ?? r.status}`); return; }
    const neu = (j.orgs as Org[]).find((o) => !orgs.some((x) => x.id === o.id));
    setOrgs(j.orgs.sort((a: Org, b: Org) => a.name.localeCompare(b.name)));
    if (neu) setWahl(neu.id);
    setStand(t('Gespeichert'));
  };

  const loesche = async (id: string) => {
    const r = await fetch('/api/orgs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loeschen: id }),
    });
    if (r.ok) { setOrgs((alt) => alt.filter((o) => o.id !== id)); setWahl(null); setStand(t('Gespeichert')); }
    else setStand(t('Nicht gespeichert'));
    setLoeschFrage(false);
  };

  /**
   * Ein Spielerfoto hochladen. Der Betreiber: "wenn es keins hat" - ein
   * vorhandenes laesst sich ersetzen, muss aber nicht.
   *
   * Auch ohne Konto (30.9.2026): "dann lass mich mindestens ein Bild
   * hochladen. Es muss ja kein Account connected sein." Dann haengt das Foto
   * am Eintrag der Org und wird mit ihr fuer alle gespeichert.
   */
  const fotoHochladen = async (orgId: string, i: number, s: Spieler, datei: File) => {
    const schluessel = s.epicId ?? `${orgId}#${i}`;
    setFotoLaedt(schluessel); setFotoFehler('');
    const form = new FormData();
    form.set('datei', datei); form.set('name', s.name);
    if (s.epicId) form.set('epicId', s.epicId); else form.set('ohneKonto', '1');
    try {
      const r = await fetch('/api/spielerbild/hochladen', { method: 'POST', body: form });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.bild) { setFotoFehler(j?.fehler ?? `HTTP ${r.status}`); return; }
      if (s.epicId) setFotos((v) => ({ ...v, [s.epicId!]: j.bild }));
      else aendere(orgId, (o) => ({ ...o, spieler: o.spieler.map((x, j2) => (j2 === i ? { ...x, bild: j.bild } : x)) }), true);
    } catch { setFotoFehler(t('Keine Verbindung zum Server.')); }
    finally { setFotoLaedt(null); }
  };

  /*
   * Die Fotos neu holen, nachdem ein Konto zugewiesen wurde. Vorher kamen sie
   * nur beim Oeffnen der Seite - ein eben zugewiesenes Konto stand deshalb
   * "ohne Foto" da, obwohl es in der Statistik eins hat (Higgs, 30.9.2026).
   */
  const fotosNeu = useCallback(() => {
    fetch('/api/orgs', { cache: 'no-store' })
      .then((r) => r.json()).then((j) => { if (j?.orgs) setFotos(fotosAus(j.orgs)); })
      .catch(() => {});
  }, []);

  /** Das Banner hinter dem Logo - als Datei oder vom X-Konto der Org. */
  const [bannerLaedt, setBannerLaedt] = useState(false);
  const bannerHochladen = async (org: Org, quelle: File | { vonX: string }) => {
    setBannerLaedt(true); setStand(t('Wird gespeichert …'));
    const form = new FormData();
    form.append('org', org.id); form.append('art', 'banner');
    if (quelle instanceof File) form.append('datei', quelle); else form.append('vonX', quelle.vonX);
    try {
      const r = await fetch('/api/orgs/logo', { method: 'POST', body: form });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.banner) { setStand(`${t('Nicht gespeichert')}: ${j?.fehler ?? r.status}`); return; }
      aendere(org.id, (o) => ({ ...o, banner: j.banner }), true);
    } catch { setStand(t('Keine Verbindung zum Server.')); }
    finally { setBannerLaedt(false); }
  };
  const bannerFeld = useRef<HTMLInputElement | null>(null);
  const [ohneKonto, setOhneKonto] = useState('');

  const logoHochladen = async (org: Org, datei: File) => {
    setStand(t('Wird gespeichert …'));
    const form = new FormData();
    form.append('datei', datei); form.append('org', org.id);
    const r = await fetch('/api/orgs/logo', { method: 'POST', body: form });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.logo) { setStand(`${t('Nicht gespeichert')}: ${j?.fehler ?? r.status}`); return; }
    aendere(org.id, (o) => ({ ...o, logo: j.logo }), true);
  };

  if (erlaubt === null) return <main className="min-h-screen bg-zinc-950 px-6 py-16 text-sm text-slate-500"><T>Wird geladen …</T></main>;
  if (!erlaubt) {
    return (
      <main className="min-h-screen bg-zinc-950 px-6 py-16">
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-slate-400">
          <T>Diese Seite ist dem Admin vorbehalten.</T>
        </p>
      </main>
    );
  }

  const org = orgs.find((o) => o.id === wahl) ?? null;
  const gefiltert = orgs.filter((o) => !filter.trim() || o.name.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-2 flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold text-slate-100"><T>E-Sports-Teams</T></h1>
        <span className="text-xs text-slate-500">{orgs.length} <T>Organisationen</T></span>
        {stand && (
          <span className={`text-xs ${/nicht|not/i.test(stand) ? 'text-rose-400' : 'text-emerald-400'}`}>{stand}</span>
        )}
        <Link href="/admin" className="ml-auto text-xs text-slate-500 transition hover:text-sky-400">
          ← <T>zum Verwaltungsbereich</T>
        </Link>
      </div>
      <p className="mb-8 text-sm text-slate-500">
        <T>Erscheint in der Statistik unter Organizations. Spieler hängen an ihrem Epic-Konto; ohne Konto stehen sie ohne Profil und ohne Preisgeld da.</T>
      </p>

      {fehler ? (
        <p className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-5 text-sm text-amber-200">{fehler}</p>
      ) : (
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* --------------------------------------------------- Die Liste */}
        <div>
          <button type="button" onClick={() => void neueOrg()}
            className="mb-3 w-full rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-400">
            + <T>Neue Organisation</T>
          </button>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('Namen suchen …')}
            className={`${feld} mb-3 w-full`} />
          <div className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
            {gefiltert.map((o) => (
              <button key={o.id} type="button" onClick={() => { setWahl(o.id); setLoeschFrage(false); }}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${wahl === o.id
                  ? 'border-sky-500 bg-sky-500/10' : 'border-zinc-800 hover:border-zinc-600'}`}>
                {o.logo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={o.logo} alt="" className="h-8 w-8 shrink-0 rounded-md object-contain" />
                  : <span className="h-8 w-8 shrink-0 rounded-md border border-dashed border-zinc-700" />}
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-200">{o.name}</span>
                <span className="text-xs text-slate-500">{o.spieler.length}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ------------------------------------------------- Der Editor */}
        {!org ? (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-sm text-slate-500">
            <T>Organisation wählen oder neu anlegen.</T>
          </p>
        ) : (
          <div className="space-y-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
            <div className="flex flex-wrap items-start gap-5">
              <div className="flex flex-col items-center gap-2">
                {org.logo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={org.logo} alt="" className="h-24 w-24 rounded-xl bg-zinc-950 object-contain p-1.5" />
                  : <span className="flex h-24 w-24 items-center justify-center rounded-xl border border-dashed border-zinc-700 text-xs text-slate-600"><T>kein Logo</T></span>}
                <button type="button" onClick={() => dateiFeld.current?.click()}
                  className="text-xs text-sky-400 hover:underline"><T>Logo hochladen</T></button>
                {org.logo && (
                  <button type="button" onClick={() => aendere(org.id, (o) => ({ ...o, logo: null }), true)}
                    className="text-xs text-slate-500 hover:text-rose-400"><T>Logo entfernen</T></button>
                )}
              </div>
              <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-500 sm:col-span-2"><T>Name der Organisation</T>
                  <input value={org.name} onChange={(e) => aendere(org.id, (o) => ({ ...o, name: e.target.value }))}
                    className={`${feld} mt-1 w-full text-base`} />
                </label>
                <label className="text-xs text-slate-500"><T>Webseite (freiwillig)</T>
                  <input value={org.website ?? ''} placeholder="https://"
                    onChange={(e) => aendere(org.id, (o) => ({ ...o, website: e.target.value || null }))}
                    className={`${feld} mt-1 w-full`} />
                </label>
                <label className="text-xs text-slate-500"><T>X-Konto (freiwillig)</T>
                  <input value={org.x ?? ''} placeholder="@"
                    onChange={(e) => aendere(org.id, (o) => ({ ...o, x: e.target.value.replace(/^@/, '') || null }))}
                    className={`${feld} mt-1 w-full`} />
                </label>
                {/* Weitere Kanaele - sie erscheinen als Knoepfe unter dem Logo. */}
                {(['youtube', 'twitch', 'instagram', 'tiktok'] as const).map((k) => (
                  <label key={k} className="text-xs text-slate-500">
                    {{ youtube: 'YouTube', twitch: 'Twitch', instagram: 'Instagram', tiktok: 'TikTok' }[k]} (<T>freiwillig</T>)
                    <input value={org[k] ?? ''} placeholder="@"
                      onChange={(e) => aendere(org.id, (o) => ({ ...o, [k]: e.target.value.replace(/^@/, '') || null }))}
                      className={`${feld} mt-1 w-full`} />
                  </label>
                ))}
                <label className="text-xs text-slate-500"><T>Land (zwei Buchstaben, z. B. DE)</T>
                  <input value={org.land ?? ''} maxLength={2} placeholder="DE"
                    onChange={(e) => aendere(org.id, (o) => ({ ...o, land: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') || null }))}
                    className={`${feld} mt-1 w-full uppercase`} />
                </label>
                <div className="text-xs text-slate-500 sm:col-span-2"><T>Region</T>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {REGIONEN.map((r) => (
                      <button key={r} type="button" onClick={() => aendere(org.id, (o) => ({ ...o, region: r }), true)}
                        className={`rounded-lg border px-3 py-1.5 text-sm transition ${org.region === r
                          ? 'border-sky-500 bg-sky-500/10 text-sky-400' : 'border-zinc-800 text-slate-400 hover:border-zinc-600'}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ------------------------------------------------- Banner */}
            <div>
              <h2 className="mb-1 text-sm font-semibold text-slate-200"><T>Banner</T></h2>
              <p className="mb-2 text-xs text-slate-500"><T>Das breite Bild hinter dem Logo auf der Seite der Organisation.</T></p>
              <div className="relative aspect-[3/1] w-full max-w-xl overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
                {org.banner
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={org.banner} alt="" className="h-full w-full object-cover" />
                  : <span className="flex h-full w-full items-center justify-center text-xs text-slate-600"><T>kein Banner</T></span>}
                {bannerLaedt && <span className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-sky-400" /></span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => bannerFeld.current?.click()} disabled={bannerLaedt}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-slate-200 transition hover:border-sky-500 hover:text-sky-400 disabled:opacity-50">
                  <T>Banner hochladen</T>
                </button>
                <button type="button" disabled={!org.x || bannerLaedt} onClick={() => org.x && void bannerHochladen(org, { vonX: org.x })}
                  title={org.x ? `@${org.x}` : t('Erst das X-Konto eintragen')}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-slate-200 transition hover:border-sky-500 hover:text-sky-400 disabled:opacity-50">
                  <T>Banner von X übernehmen</T>
                </button>
                {org.banner && (
                  <button type="button" onClick={() => aendere(org.id, (o) => ({ ...o, banner: null }), true)}
                    className="px-2 text-sm text-slate-500 hover:text-rose-400"><T>Banner entfernen</T></button>
                )}
              </div>
              <input ref={bannerFeld} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const d = e.target.files?.[0]; e.target.value = ''; if (d) void bannerHochladen(org, d); }} />
            </div>

            {/* ------------------------------------------------ Spieler */}
            <div>
              <h2 className="mb-2 text-sm font-semibold text-slate-200"><T>Spieler</T> · {org.spieler.length}</h2>
              {fotoFehler && <p className="mb-2 rounded-lg border border-rose-600/50 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
                <T>Foto nicht gespeichert:</T> {fotoFehler}</p>}
              <div className="mb-3 space-y-1.5">
                {org.spieler.map((s, i) => (
                  <div key={`${s.epicId ?? s.name}-${i}`}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                    {/* Das Foto - mit oder ohne Konto hochladen oder ersetzen. */}
                    {(() => {
                      const foto = (s.epicId && fotos[s.epicId]) || s.bild || null;
                      const schluessel = s.epicId ?? `${org.id}#${i}`;
                      return (
                        <>
                          <label className="relative h-12 w-10 shrink-0 cursor-pointer overflow-hidden rounded-md border border-zinc-800
                                            bg-zinc-900 hover:border-sky-500"
                            title={foto ? t('Foto ersetzen') : t('Foto hochladen')}>
                            {foto
                              /* eslint-disable-next-line @next/next/no-img-element */
                              ? <img src={foto} alt="" className="h-full w-full object-cover object-top" />
                              : <span className="flex h-full w-full items-center justify-center text-lg text-zinc-600">+</span>}
                            {/* Nur beim Hochladen genau dieses Fotos. Vorher stand hier
                                fotoLaedt === s.epicId - ohne Konto und ohne laufendes
                                Hochladen sind beide null, und jeder Spieler ohne Konto
                                zeigte dauerhaft den Ladekringel. */}
                            {fotoLaedt !== null && fotoLaedt === schluessel && <span className="absolute inset-0 flex items-center justify-center bg-black/60">
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-sky-400" /></span>}
                            <input type="file" accept="image/*" className="hidden"
                              onChange={(e) => { const d = e.target.files?.[0]; e.target.value = ''; if (d) void fotoHochladen(org.id, i, s, d); }} />
                          </label>
                          <span className="min-w-[8rem] flex-1 text-sm font-medium text-slate-100">
                            {s.name}
                            {!foto && <span className="ml-2 text-xs font-normal text-amber-400/80"><T>ohne Foto</T></span>}
                          </span>
                        </>
                      );
                    })()}
                    {s.epicId
                      ? <span className="text-xs text-emerald-400" title={s.epicId}>✓ <T>Konto</T></span>
                      : (
                        <div className="w-56">
                          <KontoSuche platzhalter={t('Konto zuweisen …')}
                            onWahl={(k) => { aendere(org.id, (o) => ({ ...o, spieler: o.spieler.map((x, j) => (j === i ? { ...x, epicId: k.epicId } : x)) }), true); window.setTimeout(fotosNeu, 1500); }} />
                        </div>
                      )}
                    <label className="flex items-center gap-2 text-xs text-slate-500"><T>seit</T>
                      <input type="date" value={s.seit ?? ''}
                        onChange={(e) => aendere(org.id, (o) => ({ ...o, spieler: o.spieler.map((x, j) => (j === i ? { ...x, seit: e.target.value || null } : x)) }))}
                        className={`${feld} py-1.5`} />
                    </label>
                    <button type="button"
                      onClick={() => aendere(org.id, (o) => ({ ...o, spieler: o.spieler.filter((_, j) => j !== i) }), true)}
                      className="rounded-lg border border-zinc-800 px-2.5 py-1 text-xs text-slate-500 transition hover:border-rose-600 hover:text-rose-400">
                      <T>entfernen</T>
                    </button>
                    {/* Rolle und Kanaele: Pros und Academy nur X, Creator alle. */}
                    <div className="flex w-full flex-wrap items-center gap-2 pl-[3.25rem]">
                      {ROLLEN.map(([r, titel]) => (
                        <button key={r} type="button"
                          onClick={() => aendere(org.id, (o) => ({ ...o, spieler: o.spieler.map((x, j) => (j === i ? { ...x, rolle: r } : x)) }), true)}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${s.rolle === r
                            ? 'border-sky-500 bg-sky-500/10 text-sky-400' : 'border-zinc-800 text-slate-400 hover:border-zinc-600'}`}>
                          {titel}
                        </button>
                      ))}
                      {((s.rolle === 'creator' ? ['tiktok', 'twitch', 'x', 'youtube'] : ['x']) as Array<'x' | 'twitch' | 'tiktok' | 'youtube'>).map((k) => (
                        <input key={k} value={s[k] ?? ''}
                          placeholder={{ x: 'X @', twitch: 'Twitch', tiktok: 'TikTok @', youtube: 'YouTube @' }[k]}
                          onChange={(e) => aendere(org.id, (o) => ({ ...o, spieler: o.spieler.map((x, j) => (j === i ? { ...x, [k]: e.target.value.replace(/^@/, '') || null } : x)) }))}
                          className={`${feld} w-32 py-1 text-xs`} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <KontoSuche platzhalter={t('Spieler hinzufügen: Namen tippen …')}
                onWahl={(k) => aendere(org.id, (o) => ({
                  ...o,
                  spieler: o.spieler.some((x) => x.epicId === k.epicId) ? o.spieler
                    : [...o.spieler, neuerSpieler(k.epicId, k.anzeige || k.name)],
                }), true)} />
              {/* Creator spielen oft keine Turniere - dann ohne Konto, nur mit Namen. */}
              <form className="mt-2 flex gap-2" onSubmit={(e) => {
                e.preventDefault();
                const name = ohneKonto.trim();
                if (!name) return;
                aendere(org.id, (o) => ({ ...o, spieler: [...o.spieler, neuerSpieler(null, name, 'creator')] }), true);
                setOhneKonto('');
              }}>
                <input value={ohneKonto} onChange={(e) => setOhneKonto(e.target.value)}
                  placeholder={t('Content Creator ohne Epic-Konto: Namen tippen …')} className={`${feld} flex-1`} />
                <button type="submit" disabled={!ohneKonto.trim()}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-slate-200 transition hover:border-sky-500 disabled:opacity-40">
                  + <T>hinzufügen</T>
                </button>
              </form>
            </div>

            {/* ----------------------------------------------- Extras */}
            <div>
              <h2 className="mb-1 text-sm font-semibold text-slate-200"><T>Weitere Einnahmen</T></h2>
              <p className="mb-2 text-xs text-slate-500"><T>Was die Organisation selbst bekommt, etwa den EWC Club Bonus. Zählt im Jahr seines Datums.</T></p>
              <div className="space-y-1.5">
                {org.extras.map((e, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <input value={e.titel} placeholder={t('Titel, z. B. EWC Club Championship')}
                      onChange={(ev) => aendere(org.id, (o) => ({ ...o, extras: o.extras.map((x, j) => (j === i ? { ...x, titel: ev.target.value } : x)) }))}
                      className={`${feld} min-w-[12rem] flex-1`} />
                    <input value={e.betrag || ''} inputMode="numeric" placeholder={t('Betrag in $')}
                      onChange={(ev) => aendere(org.id, (o) => ({ ...o, extras: o.extras.map((x, j) => (j === i ? { ...x, betrag: Number(ev.target.value.replace(/[^\d]/g, '')) || 0 } : x)) }))}
                      className={`${feld} w-36`} />
                    <input type="date" value={e.datum ?? ''}
                      onChange={(ev) => aendere(org.id, (o) => ({ ...o, extras: o.extras.map((x, j) => (j === i ? { ...x, datum: ev.target.value || null } : x)) }))}
                      className={feld} />
                    <button type="button"
                      onClick={() => aendere(org.id, (o) => ({ ...o, extras: o.extras.filter((_, j) => j !== i) }), true)}
                      className="rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-slate-500 transition hover:border-rose-600 hover:text-rose-400">
                      <T>entfernen</T>
                    </button>
                  </div>
                ))}
              </div>
              <button type="button"
                onClick={() => setOrgs((alt) => alt.map((o) => (o.id === org.id ? { ...o, extras: [...o.extras, { titel: '', betrag: 0, datum: null }] } : o)))}
                className="mt-2 text-sm text-sky-400 hover:underline">+ <T>Einnahme notieren</T></button>
            </div>

            {/* ----------------------------------------------- Loeschen */}
            <div className="border-t border-zinc-800 pt-4">
              {loeschFrage ? (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-rose-300"><T>Wirklich löschen? Spieler und Einnahmen dieser Organisation sind danach weg.</T></span>
                  <button type="button" onClick={() => void loesche(org.id)}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white hover:bg-rose-500"><T>Ja, löschen</T></button>
                  <button type="button" onClick={() => setLoeschFrage(false)}
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-slate-300"><T>Abbrechen</T></button>
                </div>
              ) : (
                <button type="button" onClick={() => setLoeschFrage(true)}
                  className="text-sm text-slate-500 transition hover:text-rose-400"><T>Organisation löschen</T></button>
              )}
            </div>

            <input ref={dateiFeld} type="file" accept="image/*" className="hidden"
              onChange={(e) => {
                const d = e.target.files?.[0];
                e.target.value = '';
                if (d) void logoHochladen(org, d);
              }} />
          </div>
        )}
      </div>
      )}
      </div>
    </main>
  );
}
