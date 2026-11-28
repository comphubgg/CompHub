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

import { useCallback, useEffect, useRef, useState } from 'react';
import T from '../port/app/components/T';
import { Laedt, NurAdmins } from '../teile';
import SeitenKopf from '../port/app/components/SeitenKopf';
import { useT } from '../port/app/components/SprachProvider';

type Rolle = 'pro' | 'academy' | 'creator';
interface Spieler {
  epicId: string | null; name: string; seit: string | null; rolle: Rolle;
  x: string | null; twitch: string | null; tiktok: string | null; youtube: string | null;
  /** Foto am Eintrag - fuer Spieler ohne Konto (lib/orgs). */
  bild?: string | null;
  /** Vom Abgleich gepflegt (Liquipedia-Spielerseite) - nur durchgereicht. */
  liquipedia?: string | null;
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
  /** Vom Admin entfernte Namen - der Liquipedia-Abgleich traegt sie nie wieder ein. */
  ausgeschlossen: string[];
  /** Vom Abgleich gepflegt - hier nur durchgereicht, damit Speichern sie nicht loescht. */
  ehemalige?: unknown[];
  liquipedia?: string | null;
}
const namensTeil = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
interface Treffer { epicId: string; name: string; anzeige?: string; land?: string | null; regionen?: string[] }

const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];
const feld = 'rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm '
  + 'text-white outline-none placeholder:text-white/30 focus:border-akz';

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
      {laedt && <span className="absolute right-3 top-2.5 h-4 w-4 animate-spin rounded-full border-2 border-white/15 border-t-akz" />}
      {q.trim().length >= 2 && treffer.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-white/15 bg-black/40 shadow-xl">
          {treffer.map((t) => (
            <button key={t.epicId} type="button"
              onClick={() => { onWahl(t); setQ(''); setTreffer([]); }}
              className="flex w-full items-center justify-between gap-3 border-b border-white/5 px-3 py-2 text-left text-sm
                         text-white/85 last:border-0 hover:bg-white/[0.06]">
              <span>{t.anzeige || t.name}</span>
              <span className="text-xs text-white/40">{[t.land, (t.regionen ?? []).join('/')].filter(Boolean).join(' · ')}</span>
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
  /** Nur Organisationen mit Luecken (Foto oder Konto fehlt). */
  const [nurLuecken, setNurLuecken] = useState(false);
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
            liquipedia: (s as { liquipedia?: string | null }).liquipedia ?? null,
          })),
          extras: o.extras ?? [],
          ausgeschlossen: o.ausgeschlossen ?? [],
          ehemalige: o.ehemalige ?? [],
          liquipedia: o.liquipedia ?? null,
        })).sort((a: Org, b: Org) => a.name.localeCompare(b.name)));
      })
      .catch(() => setFehler('Storage is not answering right now.'));
  }, []);

  /** Speichern - kurz nach der letzten Aenderung, ohne Knopf. */
  const speichere = useCallback((org: Org, sofort = false) => {
    const alt = uhren.current.get(org.id);
    if (alt) clearTimeout(alt);
    const los = async () => {
      setStand(t('Saving …'));
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
    setStand(t('Saving …'));
    const r = await fetch('/api/orgs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org: { name: t('New organisation'), spieler: [], extras: [] } }),
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
    } catch { setFotoFehler(t('No connection to the server.')); }
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
    setBannerLaedt(true); setStand(t('Saving …'));
    const form = new FormData();
    form.append('org', org.id); form.append('art', 'banner');
    if (quelle instanceof File) form.append('datei', quelle); else form.append('vonX', quelle.vonX);
    try {
      const r = await fetch('/api/orgs/logo', { method: 'POST', body: form });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.banner) { setStand(`${t('Nicht gespeichert')}: ${j?.fehler ?? r.status}`); return; }
      aendere(org.id, (o) => ({ ...o, banner: j.banner }), true);
    } catch { setStand(t('No connection to the server.')); }
    finally { setBannerLaedt(false); }
  };
  const bannerFeld = useRef<HTMLInputElement | null>(null);
  const [ohneKonto, setOhneKonto] = useState('');

  const logoHochladen = async (org: Org, datei: File) => {
    setStand(t('Saving …'));
    const form = new FormData();
    form.append('datei', datei); form.append('org', org.id);
    const r = await fetch('/api/orgs/logo', { method: 'POST', body: form });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.logo) { setStand(`${t('Nicht gespeichert')}: ${j?.fehler ?? r.status}`); return; }
    aendere(org.id, (o) => ({ ...o, logo: j.logo }), true);
  };

  if (erlaubt === null) return <Laedt />;
  if (!erlaubt) {
    return (
      <NurAdmins />
    );
  }

  const org = orgs.find((o) => o.id === wahl) ?? null;
  /*
   * Was noch fehlt - je Organisation und insgesamt.
   *
   * Der Betreiber (1.10.2026): fuer den Admin "simpler, optisch besser
   * sichtbar". Bei hundert Organisationen sieht man nicht, wo noch ein Foto
   * oder ein Konto fehlt; die Liste sagt es jetzt selbst. Ein Content Creator
   * braucht kein Konto, ein Pro oder Academy-Spieler schon.
   */
  const luecken = (o: Org) => ({
    fotos: o.spieler.filter((x) => !((x.epicId && fotos[x.epicId]) || x.bild)).length,
    konten: o.spieler.filter((x) => !x.epicId && x.rolle !== 'creator').length,
  });
  const gesamtLuecken = orgs.reduce((a, o) => {
    const l = luecken(o);
    return { fotos: a.fotos + l.fotos, konten: a.konten + l.konten, orgs: a.orgs + (l.fotos || l.konten ? 1 : 0) };
  }, { fotos: 0, konten: 0, orgs: 0 });
  const gefiltert = orgs.filter((o) => (!filter.trim() || o.name.toLowerCase().includes(filter.trim().toLowerCase()))
    && (!nurLuecken || luecken(o).fotos > 0 || luecken(o).konten > 0));

  return (
    <main className="text-white">
      <div>
      <SeitenKopf className="mb-8" marke={<T>Statistik</T>} titel={<T>Esports teams</T>}
        text={<T>Shows up in the stats under Organizations. Players are tied to their Epic account; without one they have no profile and no prize money.</T>}
        rechts={<>
          <span className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-white/70">{orgs.length} <T>Organisationen</T></span>
          {stand && (
            <span className={`text-xs ${/nicht|not/i.test(stand) ? 'text-rose-400' : 'text-emerald-400'}`}>{stand}</span>
          )}
        </>} />

      {fehler ? (
        <p className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-5 text-sm text-amber-200">{fehler}</p>
      ) : (
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* --------------------------------------------------- Die Liste */}
        <div>
          <button type="button" onClick={() => void neueOrg()}
            className="mb-3 w-full rounded-lg bg-akz px-3 py-2 text-sm font-semibold text-[#04050a] transition hover:brightness-110">
            + <T>New organisation</T>
          </button>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('Namen suchen …')}
            className={`${feld} mb-2 w-full`} />
          {(gesamtLuecken.fotos > 0 || gesamtLuecken.konten > 0) && (
            <button type="button" onClick={() => setNurLuecken((v) => !v)}
              className={`mb-3 w-full rounded-lg border px-3 py-2 text-left text-xs leading-snug transition ${nurLuecken
                ? 'border-amber-500 bg-amber-500/10 text-amber-300' : 'border-white/10 text-white/55 hover:border-amber-500/60'}`}>
              <span className="block font-semibold">
                {nurLuecken ? <T>Only organisations with gaps</T> : <T>Something is still missing</T>}
              </span>
              <span className="block text-white/40">
                {gesamtLuecken.fotos} <T>Fotos</T> · {gesamtLuecken.konten} <T>Konten</T> · {gesamtLuecken.orgs} <T>Organisationen</T>
              </span>
            </button>
          )}
          <div className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
            {gefiltert.map((o) => (
              <button key={o.id} type="button" onClick={() => { setWahl(o.id); setLoeschFrage(false); }}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${wahl === o.id
                  ? 'border-akz bg-akz/10' : 'border-white/10 hover:border-white/25'}`}>
                {o.logo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={o.logo} alt="" className="h-8 w-8 shrink-0 rounded-md object-contain" />
                  : <span className="h-8 w-8 shrink-0 rounded-md border border-dashed border-white/15" />}
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/85">{o.name}</span>
                {(() => {
                  const l = luecken(o);
                  return l.fotos || l.konten ? (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300"
                      title={`${l.fotos} ${t('Fotos')} · ${l.konten} ${t('Konten')}`}>
                      {l.fotos + l.konten}
                    </span>
                  ) : null;
                })()}
                <span className="text-xs text-white/40">{o.spieler.length}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ------------------------------------------------- Der Editor */}
        {!org ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-sm text-white/40">
            <T>Pick an organisation or create a new one.</T>
          </p>
        ) : (
          <div className="space-y-6 rounded-xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex flex-wrap items-start gap-5">
              <div className="flex flex-col items-center gap-2">
                {org.logo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={org.logo} alt="" className="h-24 w-24 rounded-xl bg-black/40 object-contain p-1.5" />
                  : <span className="flex h-24 w-24 items-center justify-center rounded-xl border border-dashed border-white/15 text-xs text-white/30"><T>no logo</T></span>}
                <button type="button" onClick={() => dateiFeld.current?.click()}
                  className="text-xs text-akz hover:underline"><T>Upload logo</T></button>
                {org.logo && (
                  <button type="button" onClick={() => aendere(org.id, (o) => ({ ...o, logo: null }), true)}
                    className="text-xs text-white/40 hover:text-rose-400"><T>Remove logo</T></button>
                )}
              </div>
              <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                <label className="text-xs text-white/40 sm:col-span-2"><T>Organisation name</T>
                  <input value={org.name} onChange={(e) => aendere(org.id, (o) => ({ ...o, name: e.target.value }))}
                    className={`${feld} mt-1 w-full text-base`} />
                </label>
                <label className="text-xs text-white/40"><T>Website (optional)</T>
                  <input value={org.website ?? ''} placeholder="https://"
                    onChange={(e) => aendere(org.id, (o) => ({ ...o, website: e.target.value || null }))}
                    className={`${feld} mt-1 w-full`} />
                </label>
                <label className="text-xs text-white/40"><T>X account (optional)</T>
                  <input value={org.x ?? ''} placeholder="@"
                    onChange={(e) => aendere(org.id, (o) => ({ ...o, x: e.target.value.replace(/^@/, '') || null }))}
                    className={`${feld} mt-1 w-full`} />
                </label>
                {/* Weitere Kanaele - sie erscheinen als Knoepfe unter dem Logo. */}
                {(['youtube', 'twitch', 'instagram', 'tiktok'] as const).map((k) => (
                  <label key={k} className="text-xs text-white/40">
                    {{ youtube: 'YouTube', twitch: 'Twitch', instagram: 'Instagram', tiktok: 'TikTok' }[k]} (<T>freiwillig</T>)
                    <input value={org[k] ?? ''} placeholder="@"
                      onChange={(e) => aendere(org.id, (o) => ({ ...o, [k]: e.target.value.replace(/^@/, '') || null }))}
                      className={`${feld} mt-1 w-full`} />
                  </label>
                ))}
                <label className="text-xs text-white/40"><T>Country (two letters, e.g. DE)</T>
                  <input value={org.land ?? ''} maxLength={2} placeholder="DE"
                    onChange={(e) => aendere(org.id, (o) => ({ ...o, land: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') || null }))}
                    className={`${feld} mt-1 w-full uppercase`} />
                </label>
                <div className="text-xs text-white/40 sm:col-span-2"><T>Region</T>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {REGIONEN.map((r) => (
                      <button key={r} type="button" onClick={() => aendere(org.id, (o) => ({ ...o, region: r }), true)}
                        className={`rounded-lg border px-3 py-1.5 text-sm transition ${org.region === r
                          ? 'border-akz bg-akz/10 text-akz' : 'border-white/10 text-white/55 hover:border-white/25'}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ------------------------------------------------- Banner */}
            <div>
              <h2 className="mb-1 text-sm font-semibold text-white/85"><T>Banner</T></h2>
              <p className="mb-2 text-xs text-white/40"><T>The wide image behind the logo on the organisation's page.</T></p>
              <div className="relative aspect-[3/1] w-full max-w-xl overflow-hidden rounded-xl border border-white/10 bg-black/40">
                {org.banner
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={org.banner} alt="" className="h-full w-full object-cover" />
                  : <span className="flex h-full w-full items-center justify-center text-xs text-white/30"><T>no banner</T></span>}
                {bannerLaedt && <span className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-akz" /></span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => bannerFeld.current?.click()} disabled={bannerLaedt}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/85 transition hover:border-akz hover:text-akz disabled:opacity-50">
                  <T>Upload banner</T>
                </button>
                <button type="button" disabled={!org.x || bannerLaedt} onClick={() => org.x && void bannerHochladen(org, { vonX: org.x })}
                  title={org.x ? `@${org.x}` : t('Enter the X account first')}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/85 transition hover:border-akz hover:text-akz disabled:opacity-50">
                  <T>Take banner from X</T>
                </button>
                {org.banner && (
                  <button type="button" onClick={() => aendere(org.id, (o) => ({ ...o, banner: null }), true)}
                    className="px-2 text-sm text-white/40 hover:text-rose-400"><T>Remove banner</T></button>
                )}
              </div>
              <input ref={bannerFeld} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const d = e.target.files?.[0]; e.target.value = ''; if (d) void bannerHochladen(org, d); }} />
            </div>

            {/* ------------------------------------------------ Spieler */}
            <div>
              <h2 className="mb-2 text-sm font-semibold text-white/85"><T>Spieler</T> · {org.spieler.length}</h2>
              {fotoFehler && <p className="mb-2 rounded-lg border border-rose-600/50 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
                <T>Photo not saved:</T> {fotoFehler}</p>}
              <div className="mb-3 space-y-1.5">
                {org.spieler.map((s, i) => (
                  <div key={`${s.epicId ?? s.name}-${i}`}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                    {/* Das Foto - mit oder ohne Konto hochladen oder ersetzen. */}
                    {(() => {
                      const foto = (s.epicId && fotos[s.epicId]) || s.bild || null;
                      const schluessel = s.epicId ?? `${org.id}#${i}`;
                      return (
                        <>
                          <label className="relative h-12 w-10 shrink-0 cursor-pointer overflow-hidden rounded-md border border-white/10
                                            bg-white/[0.035] backdrop-blur-xl hover:border-akz"
                            title={foto ? t('Replace photo') : t('Foto hochladen')}>
                            {foto
                              /* eslint-disable-next-line @next/next/no-img-element */
                              ? <img src={foto.endsWith('.webp') ? `${foto}?v=2` : foto} alt="" className="h-full w-full object-cover object-top" />
                              : <span className="flex h-full w-full items-center justify-center text-lg text-white/30">+</span>}
                            {/* Nur beim Hochladen genau dieses Fotos. Vorher stand hier
                                fotoLaedt === s.epicId - ohne Konto und ohne laufendes
                                Hochladen sind beide null, und jeder Spieler ohne Konto
                                zeigte dauerhaft den Ladekringel. */}
                            {fotoLaedt !== null && fotoLaedt === schluessel && <span className="absolute inset-0 flex items-center justify-center bg-black/60">
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-akz" /></span>}
                            <input type="file" accept="image/*" className="hidden"
                              onChange={(e) => { const d = e.target.files?.[0]; e.target.value = ''; if (d) void fotoHochladen(org.id, i, s, d); }} />
                          </label>
                          <span className="min-w-[8rem] flex-1 text-sm font-medium text-white">
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
                          <KontoSuche platzhalter={t('Assign account …')}
                            onWahl={(k) => { aendere(org.id, (o) => ({ ...o, spieler: o.spieler.map((x, j) => (j === i ? { ...x, epicId: k.epicId } : x)) }), true); window.setTimeout(fotosNeu, 1500); }} />
                        </div>
                      )}
                    <label className="flex items-center gap-2 text-xs text-white/40"><T>seit</T>
                      <input type="date" value={s.seit ?? ''}
                        onChange={(e) => aendere(org.id, (o) => ({ ...o, spieler: o.spieler.map((x, j) => (j === i ? { ...x, seit: e.target.value || null } : x)) }))}
                        className={`${feld} py-1.5`} />
                    </label>
                    <button type="button"
                      /* Entfernt heisst: bleibt draussen - auch wenn Liquipedia den
                         Spieler noch fuehrt. Der taegliche Abgleich liest diese Liste. */
                      onClick={() => aendere(org.id, (o) => ({
                        ...o,
                        spieler: o.spieler.filter((_, j) => j !== i),
                        ausgeschlossen: [...new Set([...(o.ausgeschlossen ?? []), s.name])],
                      }), true)}
                      className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-white/40 transition hover:border-rose-600 hover:text-rose-400">
                      <T>entfernen</T>
                    </button>
                    {/* Rolle und Kanaele: Pros und Academy nur X, Creator alle. */}
                    <div className="flex w-full flex-wrap items-center gap-2 pl-[3.25rem]">
                      {ROLLEN.map(([r, titel]) => (
                        <button key={r} type="button"
                          onClick={() => aendere(org.id, (o) => ({ ...o, spieler: o.spieler.map((x, j) => (j === i ? { ...x, rolle: r } : x)) }), true)}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${s.rolle === r
                            ? 'border-akz bg-akz/10 text-akz' : 'border-white/10 text-white/55 hover:border-white/25'}`}>
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
              <KontoSuche platzhalter={t('Add player: type a name …')}
                onWahl={(k) => aendere(org.id, (o) => ({
                  ...o,
                  spieler: o.spieler.some((x) => x.epicId === k.epicId) ? o.spieler
                    : [...o.spieler, neuerSpieler(k.epicId, k.anzeige || k.name)],
                  // Wer von Hand wieder dazukommt, ist nicht mehr ausgeschlossen.
                  ausgeschlossen: (o.ausgeschlossen ?? []).filter((n) => ![k.anzeige, k.name]
                    .some((m) => m && namensTeil(m) === namensTeil(n))),
                }), true)} />
              {/* Creator spielen oft keine Turniere - dann ohne Konto, nur mit Namen. */}
              <form className="mt-2 flex gap-2" onSubmit={(e) => {
                e.preventDefault();
                const name = ohneKonto.trim();
                if (!name) return;
                aendere(org.id, (o) => ({ ...o, spieler: [...o.spieler, neuerSpieler(null, name, 'creator')],
                  ausgeschlossen: (o.ausgeschlossen ?? []).filter((n) => namensTeil(n) !== namensTeil(name)) }), true);
                setOhneKonto('');
              }}>
                <input value={ohneKonto} onChange={(e) => setOhneKonto(e.target.value)}
                  placeholder={t('Content creator without Epic account: type a name …')} className={`${feld} flex-1`} />
                <button type="submit" disabled={!ohneKonto.trim()}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/85 transition hover:border-akz disabled:opacity-40">
                  + <T>add</T>
                </button>
              </form>
            </div>

            {/* ----------------------------------------------- Extras */}
            <div>
              <h2 className="mb-1 text-sm font-semibold text-white/85"><T>Other earnings</T></h2>
              <p className="mb-2 text-xs text-white/40"><T>What the organisation itself receives, e.g. the EWC Club bonus. Counts in the year of its date.</T></p>
              <div className="space-y-1.5">
                {org.extras.map((e, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <input value={e.titel} placeholder={t('Title, e.g. EWC Club Championship')}
                      onChange={(ev) => aendere(org.id, (o) => ({ ...o, extras: o.extras.map((x, j) => (j === i ? { ...x, titel: ev.target.value } : x)) }))}
                      className={`${feld} min-w-[12rem] flex-1`} />
                    <input value={e.betrag || ''} inputMode="numeric" placeholder={t('Amount in $')}
                      onChange={(ev) => aendere(org.id, (o) => ({ ...o, extras: o.extras.map((x, j) => (j === i ? { ...x, betrag: Number(ev.target.value.replace(/[^\d]/g, '')) || 0 } : x)) }))}
                      className={`${feld} w-36`} />
                    <input type="date" value={e.datum ?? ''}
                      onChange={(ev) => aendere(org.id, (o) => ({ ...o, extras: o.extras.map((x, j) => (j === i ? { ...x, datum: ev.target.value || null } : x)) }))}
                      className={feld} />
                    <button type="button"
                      onClick={() => aendere(org.id, (o) => ({ ...o, extras: o.extras.filter((_, j) => j !== i) }), true)}
                      className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/40 transition hover:border-rose-600 hover:text-rose-400">
                      <T>entfernen</T>
                    </button>
                  </div>
                ))}
              </div>
              <button type="button"
                onClick={() => setOrgs((alt) => alt.map((o) => (o.id === org.id ? { ...o, extras: [...o.extras, { titel: '', betrag: 0, datum: null }] } : o)))}
                className="mt-2 text-sm text-akz hover:underline">+ <T>Add earning</T></button>
            </div>

            {/* ----------------------------------------------- Loeschen */}
            <div className="border-t border-white/10 pt-4">
              {loeschFrage ? (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-rose-300"><T>Really delete? Players and earnings of this organisation will be gone.</T></span>
                  <button type="button" onClick={() => void loesche(org.id)}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white hover:bg-rose-500"><T>Yes, delete</T></button>
                  <button type="button" onClick={() => setLoeschFrage(false)}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-white/70"><T>Cancel</T></button>
                </div>
              ) : (
                <button type="button" onClick={() => setLoeschFrage(true)}
                  className="text-sm text-white/40 transition hover:text-rose-400"><T>Delete organisation</T></button>
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
