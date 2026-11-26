import { useCallback, useEffect, useRef, useState } from 'react';
import T from '../T';
import { FC_GOLD, FC_KARTEN, FcRahmen } from './FcTeile';
import { FELD } from '../Bausteine';

/*
 * Control page of a Finest Creative scoreboard - /overlays/finest/control?id=…&key=…
 *
 * For the streamer and the mods he hands the link to. Gated twice: the page
 * only opens for accounts with Finest Creative access (FcRahmen), and the
 * server takes a change only with that access AND the key from the link (or
 * as the owner / his manager) - see app/api/overlay-config.
 *
 * Score, round, series and the map header (title, search term, island code,
 * clip, thumbnail URL). Every change is on stream within ~1.5 s; the page
 * follows changes made by others every 4 s.
 */

type Cfg = Record<string, unknown>;

export default function FcSteuerung() {
  return <FcRahmen titel="Scoreboard control" text="for you and your mods"><Steuerung /></FcRahmen>;
}

function Steuerung() {
  const [id, setId] = useState('');
  const [key, setKey] = useState('');
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [fehler, setFehler] = useState('');
  const [ok, setOk] = useState(false);
  const letzter = useRef(0);
  const [kopf, setKopf] = useState({ karte: '', suche: '', code: '', clip: '', bild: '' });
  const [kopfOffen, setKopfOffen] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setId(p.get('id') ?? ''); setKey(p.get('key') ?? '');
  }, []);

  const laden = useCallback(async () => {
    if (!id) return;
    try {
      const r = await fetch(`/api/overlay-config?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (r.status === 403) { setFehler('No access to this scoreboard.'); return; }
      if (!r.ok) { setFehler('This scoreboard does not exist (any more).'); return; }
      const j = await r.json();
      setCfg(j.config ?? {});
      const c = j.config ?? {};
      setKopf({ karte: String(c.karte ?? ''), suche: String(c.suche ?? ''), code: String(c.code ?? ''), clip: String(c.clip ?? ''), bild: String(c.bild ?? '').startsWith('data:') ? '' : String(c.bild ?? '') });
    } catch { setFehler('No connection.'); }
  }, [id]);
  useEffect(() => { void laden(); }, [laden]);

  // Follow changes made elsewhere (another mod, the streamer) - cheap version check.
  useEffect(() => {
    if (!id) return undefined;
    let stand = -1;
    const uhr = window.setInterval(async () => {
      if (document.hidden || Date.now() - letzter.current < 4000) return;
      try {
        const j = await (await fetch(`/api/overlay-config?nur=stand&id=${encodeURIComponent(id)}`, { cache: 'no-store' })).json();
        if (typeof j?.stand === 'number' && j.stand !== stand) { if (stand !== -1) void laden(); stand = j.stand; }
      } catch { /* next round */ }
    }, 4000);
    return () => window.clearInterval(uhr);
  }, [id, laden]);

  const n = (k: string) => Number(cfg?.[k]) || 0;

  async function senden(teil: Cfg, kopfMit = false, aufstellungMit = false) {
    if (!cfg) return;
    letzter.current = Date.now();
    const neu = { ...cfg, ...teil };
    setCfg(neu);
    setFehler(''); setOk(false);
    try {
      const r = await fetch('/api/overlay-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id, steuer: key,
          punkte: { p1: neu.punkte1, p2: neu.punkte2, p3: neu.punkte3 ?? 0, p4: neu.punkte4 ?? 0, runde: neu.runde, serie1: neu.serie1, serie2: neu.serie2, serieZeigen: neu.serieZeigen },
          ...(aufstellungMit ? { aufstellung: {
            teams: neu.teams, name1: neu.name1, name2: neu.name2, name3: neu.name3, name4: neu.name4,
            spieler1: neu.spieler1, spieler2: neu.spieler2, spieler3: neu.spieler3, spieler4: neu.spieler4,
          } } : {}),
          ...(kopfMit ? { kopf: String(cfg.bild ?? '').startsWith('data:') && !kopf.bild ? { ...kopf, bild: undefined } : kopf } : {}),
        }),
      });
      const j = await r.json();
      if (!r.ok) setFehler(j?.error ?? 'Could not save');
      else { if (j.config) setCfg(j.config); setOk(true); }
    } catch { setFehler('No connection — try again.'); }
  }

  if (!id) return <p className="text-sm text-white/55"><T>This link is missing the scoreboard id.</T></p>;
  if (!cfg) return <p className="text-sm text-white/55">{fehler || '…'}</p>;

  const teams = Math.max(2, Math.min(4, Number(cfg.teams) || 2));
  const spielerVon = (s: number) => (Array.isArray(cfg[`spieler${s}`]) ? (cfg[`spieler${s}`] as string[]) : []);
  const seitenName = (s: number) => {
    const name = String(cfg[`name${s}`] ?? '').trim();
    const sp = spielerVon(s).filter(Boolean);
    return name || (sp.length > 2 ? sp.join(' · ') : sp.join(' & '));
  };
  /** Line-up changes are kept locally and sent with "Update line-up". */
  const setzeAufstellung = (teil: Cfg) => setCfg((a) => (a ? { ...a, ...teil } : a));
  const knopf = 'h-11 rounded-lg border border-white/[0.1] px-4 text-lg font-bold text-white/85 active:scale-[0.98]';

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className={`grid gap-3 ${teams > 2 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
        {[1, 2, 3, 4].slice(0, teams).map((s) => (
          <div key={s} className="flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4">
            <p className="truncate text-center text-sm font-bold text-white/85">{seitenName(s)}</p>
            <p className={`my-3 text-center font-mono font-black text-white ${teams > 2 ? 'text-5xl' : 'text-7xl'}`}>{n(`punkte${s}`)}</p>
            <button type="button" onClick={() => void senden({ [`punkte${s}`]: n(`punkte${s}`) + 1 })}
              className="h-24 rounded-xl text-4xl font-black text-black active:scale-[0.98]" style={{ background: FC_GOLD }}>+</button>
            <button type="button" onClick={() => void senden({ [`punkte${s}`]: Math.max(0, n(`punkte${s}`) - 1) })}
              className="mt-2 h-12 rounded-xl border border-white/[0.12] text-2xl font-bold text-white/70">−</button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4">
        <span className="text-xs font-bold uppercase tracking-wider text-white/45"><T>Round</T></span>
        <button type="button" className={knopf} onClick={() => void senden({ runde: Math.max(0, n('runde') - 1) })}>−</button>
        <span className="w-8 text-center font-mono text-xl font-bold">{n('runde')}</span>
        <button type="button" className={knopf} onClick={() => void senden({ runde: n('runde') + 1 })}>+</button>
        <span className="ml-4 text-xs font-bold uppercase tracking-wider text-white/45"><T>Series</T></span>
        <button type="button" className={knopf} onClick={() => void senden({ serie1: n('serie1') + 1, serieZeigen: true })}>{seitenName(1) || 'L'} +1</button>
        <span className="font-mono text-xl font-bold">{n('serie1')} – {n('serie2')}</span>
        <button type="button" className={knopf} onClick={() => void senden({ serie2: n('serie2') + 1, serieZeigen: true })}>{seitenName(2) || 'R'} +1</button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void senden({ punkte1: 0, punkte2: 0, punkte3: 0, punkte4: 0, runde: n('runde') ? 1 : 0 })}
          className="rounded-lg border border-white/[0.1] px-4 py-2 text-xs font-semibold text-white/70"><T>New game: 0 : 0</T></button>
        <button type="button" onClick={() => { if (window.confirm('Reset score, round and series?')) void senden({ punkte1: 0, punkte2: 0, punkte3: 0, punkte4: 0, runde: 0, serie1: 0, serie2: 0 }); }}
          className="rounded-lg border border-white/[0.1] px-4 py-2 text-xs font-semibold text-white/55"><T>Reset everything</T></button>
        <span className="self-center text-xs text-white/45">{ok ? '✓' : ''}</span>
        {fehler && <span className="self-center text-xs text-rose-400">{fehler}</span>}
      </div>

      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4">
        <p className="mb-3 text-sm font-bold text-white"><T>Teams and players</T></p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-white/45"><T>Teams</T>:</span>
          {[2, 3, 4].map((z) => (
            <button key={z} type="button" onClick={() => setzeAufstellung({ teams: z })}
              className={`h-9 w-9 rounded-lg text-sm font-bold ${teams === z ? 'text-black' : 'border border-white/[0.1] text-white/70'}`}
              style={teams === z ? { background: FC_GOLD } : undefined}>{z}</button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].slice(0, teams).map((s) => {
            const sp = spielerVon(s).length ? spielerVon(s) : [''];
            return (
              <div key={s} className="rounded-xl border border-white/[0.07] p-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/45"><T>Team</T> {s}</p>
                {sp.map((w, i) => (
                  <div key={i} className="mb-1.5 flex gap-1.5">
                    <input value={w} maxLength={24} onChange={(e) => { const neu = [...sp]; neu[i] = e.target.value; setzeAufstellung({ [`spieler${s}`]: neu }); }}
                      className={`${FELD} min-w-0 flex-1`} />
                    {sp.length > 1 && (
                      <button type="button" onClick={() => setzeAufstellung({ [`spieler${s}`]: sp.filter((_, k) => k !== i) })}
                        className="h-9 w-9 shrink-0 rounded-lg border border-white/[0.08] text-white/45">×</button>
                    )}
                  </div>
                ))}
                {sp.length < 4 && (
                  <button type="button" onClick={() => setzeAufstellung({ [`spieler${s}`]: [...sp, ''] })}
                    className="w-full rounded-lg border border-dashed border-white/[0.12] py-1 text-xs text-white/55">+ <T>Add player</T></button>
                )}
                <input value={String(cfg[`name${s}`] ?? '')} maxLength={28} placeholder="Team name (optional)"
                  onChange={(e) => setzeAufstellung({ [`name${s}`]: e.target.value })} className={`${FELD} mt-2 w-full text-xs`} />
              </div>
            );
          })}
        </div>
        <button type="button" onClick={() => void senden({}, false, true)}
          className="mt-3 rounded-lg px-5 py-2 text-sm font-bold text-black" style={{ background: FC_GOLD }}><T>Update line-up</T></button>
      </section>

      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4">
        <button type="button" onClick={() => setKopfOffen(!kopfOffen)} className="flex w-full items-center justify-between text-sm font-bold text-white">
          <T>Map header</T> <span className="text-white/45">{kopfOffen ? '−' : '+'}</span>
        </button>
        {kopfOffen && (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {FC_KARTEN.map((k) => (
                <button key={k.karte} type="button" onClick={() => setKopf((a) => ({ ...a, karte: k.karte, suche: k.suche, code: k.code }))}
                  className="rounded-full border border-white/[0.1] px-3 py-1 text-[11px] font-bold text-white/70 hover:text-white">{k.karte}</button>
              ))}
            </div>
            {([['karte', 'Map title', 40], ['suche', 'Search term', 24], ['code', 'Island code', 20], ['clip', 'Background clip URL (MP4/WebM)', 500], ['bild', 'Thumbnail image URL', 500]] as const).map(([k, titel, max]) => (
              <label key={k} className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/45"><T>{titel}</T></span>
                <input value={kopf[k]} maxLength={max} onChange={(e) => setKopf((a) => ({ ...a, [k]: e.target.value }))} className={`${FELD} w-full`} />
              </label>
            ))}
            <button type="button" onClick={() => void senden({}, true)}
              className="rounded-lg px-5 py-2 text-sm font-bold text-black" style={{ background: FC_GOLD }}><T>Update header</T></button>
          </div>
        )}
      </section>
    </div>
  );
}
