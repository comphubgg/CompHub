import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { Glas } from '../../teile/Glas';
import { Laedt, Meldung, NurAdmins, WerkzeugKopf, datum, feld, knopfGefahr, knopfHaupt, knopfLeise } from './teile';

/*
 * VIP-Zugaenge (app/admin/vip-access auf main, /api/admin/vip-panel): jeder Zugang mit Frist, Chat, Discord-Verknuepfung und Loeschen.
 * Was die Person erreicht, schickt der CompHub-Bot. Alle Aktionen wie auf der Seite - POST { name, aktion: chat | frist | suchen | verknuepfen | loeschen }.
 */
interface Zeile {
  name: string; art: 'vip' | 'manager' | 'pro'; stufe: 'vip' | 'streamer' | null; discordId: string | null; discordName: string | null;
  anfragen: number; angelegt: string; vipBis: number | null; fristLoescht: boolean; aktiv: boolean; verwaltet: string | null;
}
interface Treffer { id: string; name: string; anzeige: string }
const SERVER = '1529205620287344783';
const feldDatum = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function Karte({ z, jetzt, neuLaden, melden, i }: { z: Zeile; jetzt: number; neuLaden: () => void; melden: (t: string, gut: boolean) => void; i: number }) {
  const [offen, setOffen] = useState<'frist' | 'loeschen' | 'verknuepfen' | null>(null);
  const [bis, setBis] = useState(z.vipBis ? feldDatum(z.vipBis) : '');
  const [grund, setGrund] = useState('');
  const [suche, setSuche] = useState(z.name);
  const [treffer, setTreffer] = useState<Treffer[] | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const schicke = async (k: Record<string, unknown>) => {
    setLaeuft(true);
    try {
      const r = await fetch('/api/admin/vip-panel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: z.name, ...k }) });
      return await r.json() as { ok?: boolean; text?: string; kanal?: string; treffer?: Treffer[] };
    } catch { return { ok: false, text: 'No connection to the server.' }; } finally { setLaeuft(false); }
  };
  const abgelaufen = z.vipBis !== null && z.vipBis > 0 && z.vipBis <= jetzt;
  const tage = z.vipBis && z.vipBis > jetzt ? Math.ceil((z.vipBis - jetzt) / 86_400_000) : null;
  const was = z.art === 'manager' ? 'Manager' : z.art === 'pro' ? 'Pro' : z.stufe === 'streamer' ? 'VIP Streamer' : 'VIP';
  const umschalten = (o: typeof offen) => setOffen(offen === o ? null : o);

  return (
    <motion.li initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 24) * 0.025 }}
      className={`rounded-2xl border bg-white/[0.03] p-4 backdrop-blur-xl transition hover:bg-white/[0.045] ${abgelaufen ? 'border-amber-400/40' : 'border-white/10'}`}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-400/30 to-sky-400/20 text-lg font-extrabold text-white">{z.name.charAt(0).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold text-white">{z.name}</span>
            <span className="rounded-full border border-sky-400/40 bg-sky-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-200">{was}</span>
            {!z.aktiv && <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase text-white/50">blocked</span>}
            {z.anfragen > 1 && <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-200">request #{z.anfragen}</span>}
          </p>
          <p className="mt-1 text-xs text-white/45">
            {z.verwaltet && <>manages {z.verwaltet} · </>}created {z.angelegt ? datum(Date.parse(z.angelegt)) : '—'} ·{' '}
            {z.discordId ? <a href={`https://discord.com/users/${z.discordId}`} target="_blank" rel="noreferrer" className="text-white/75 hover:text-sky-300">Discord: {z.discordName ?? z.discordId}</a>
              : <span className="text-amber-300/80">not linked to Discord</span>}
          </p>
          <p className="mt-1 text-xs">
            {z.vipBis === null || z.vipBis === 0 ? <span className="text-white/55">no end date</span>
              : abgelaufen ? <span className="text-amber-300">expired on {datum(z.vipBis)}{z.fristLoescht ? ' · will be deleted' : ''}</span>
              : <span className="text-white/75">valid until {datum(z.vipBis)} · {tage} {tage === 1 ? 'day' : 'days'}{z.fristLoescht ? ' · deleted afterwards' : ''}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={laeuft || !z.discordId} title={z.discordId ? undefined : 'Link Discord first'} className={knopfLeise}
            onClick={async () => { const e = await schicke({ aktion: 'chat' }); melden(e.text ?? '', !!e.ok); if (e.ok && e.kanal) window.open(`https://discord.com/channels/${SERVER}/${e.kanal}`, '_blank'); }}>Open chat</button>
          <button type="button" onClick={() => umschalten('frist')} className={offen === 'frist' ? `${knopfLeise} !border-sky-400 !text-sky-200` : knopfLeise}>Set deadline</button>
          {!z.discordId && <button type="button" onClick={() => umschalten('verknuepfen')} className={offen === 'verknuepfen' ? `${knopfLeise} !border-sky-400 !text-sky-200` : knopfLeise}>Link Discord</button>}
          <button type="button" onClick={() => umschalten('loeschen')} className={knopfGefahr}>Delete</button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {offen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 border-t border-white/5 pt-3">
              {offen === 'frist' && (
                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-xs text-white/55"><span className="mb-1 block">Valid until</span>
                    <input type="date" value={bis} min={feldDatum(jetzt + 86_400_000)} onChange={(e) => setBis(e.target.value)} className={`${feld} [color-scheme:dark]`} /></label>
                  <button type="button" disabled={laeuft || !bis} className={knopfHaupt}
                    onClick={async () => { const e = await schicke({ aktion: 'frist', bis }); melden(e.text ?? '', !!e.ok); if (e.ok) { setOffen(null); neuLaden(); } }}>Set deadline and tell them by DM</button>
                  {z.vipBis ? <button type="button" disabled={laeuft} className={knopfLeise}
                    onClick={async () => { const e = await schicke({ aktion: 'frist', bis: null }); melden(e.text ?? '', !!e.ok); if (e.ok) { setOffen(null); neuLaden(); } }}>No end date</button> : null}
                  <p className="w-full text-[11px] text-white/40">The bot sends the date to the person. Once it is reached, the access is deleted, with roles and channel.</p>
                </div>
              )}
              {offen === 'verknuepfen' && (
                <div>
                  <div className="flex flex-wrap gap-2">
                    <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search Discord name" className={`${feld} min-w-0 flex-1`} />
                    <button type="button" disabled={laeuft || suche.trim().length < 2} className={knopfLeise}
                      onClick={async () => { const e = await schicke({ aktion: 'suchen', q: suche }); setTreffer(e.treffer ?? []); }}>Search</button>
                  </div>
                  {treffer && (treffer.length ? (
                    <ul className="mt-2 space-y-1">
                      {treffer.map((x) => (
                        <li key={x.id}><button type="button" disabled={laeuft} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-white transition hover:bg-white/[0.06]"
                          onClick={async () => { const e = await schicke({ aktion: 'verknuepfen', discordId: x.id, discordName: x.anzeige || x.name }); melden(e.text ?? '', !!e.ok); if (e.ok) { setOffen(null); neuLaden(); } }}>
                          <span className="font-semibold">{x.anzeige}</span><span className="text-xs text-white/45">@{x.name}</span></button></li>
                      ))}
                    </ul>
                  ) : <p className="mt-2 text-xs text-white/45">Nobody found on the server.</p>)}
                </div>
              )}
              {offen === 'loeschen' && (
                <div className="space-y-2">
                  <textarea value={grund} onChange={(e) => setGrund(e.target.value)} rows={3} placeholder="Reason (sent as a DM from the CompHub bot)" className={`${feld} w-full focus:border-rose-400/60`} />
                  <button type="button" disabled={laeuft || grund.trim().length < 3} className={`${knopfGefahr} !border-rose-500 !bg-rose-500/80 !text-white`}
                    onClick={async () => {
                      if (!window.confirm(`Really delete the access of ${z.name}? Sign-in, roles and channel are gone afterwards.`)) return;
                      const e = await schicke({ aktion: 'loeschen', grund }); melden(e.text ?? '', !!e.ok); if (e.ok) neuLaden();
                    }}>Delete access and send reason</button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export default function VipZugaenge({ klassisch }: { klassisch: () => void }) {
  const [zeilen, setZeilen] = useState<Zeile[] | null>(null);
  const [fehler, setFehler] = useState('');
  const [erlaubt, setErlaubt] = useState(true);
  const [meldung, setMeldung] = useState<{ text: string; gut: boolean } | null>(null);
  const [suche, setSuche] = useState('');
  const [jetzt, setJetzt] = useState(() => Date.now());
  const holen = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/vip-panel', { cache: 'no-store' });
      if (r.status === 401 || r.status === 403) { setErlaubt(false); return; }
      const j = await r.json() as { zugaenge?: Zeile[]; fehler?: string; abgelaufen?: string[] };
      if (!r.ok) { setFehler(j.fehler ?? 'Could not load.'); return; }
      setFehler(''); setJetzt(Date.now()); setZeilen(j.zugaenge ?? []);
      if (j.abgelaufen?.length) setMeldung({ text: `Expired and deleted: ${j.abgelaufen.join(', ')}`, gut: true });
    } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => { void holen(); }, [holen]);

  const kopf = <WerkzeugKopf ueber="Users & Access" titel="VIP access" text="Every access with deadline, chat and delete. Whatever reaches the person is sent by the CompHub bot." klassisch={klassisch}
    rechts={zeilen ? <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white/70">{zeilen.length} accesses</span> : null} />;
  if (!erlaubt) return <>{kopf}<NurAdmins /></>;
  if (fehler) return <>{kopf}<Meldung text={fehler} gut={false} /></>;
  if (!zeilen) return <>{kopf}<Laedt /></>;
  const q = suche.trim().toLowerCase();
  const gezeigt = zeilen.filter((z) => !q || z.name.toLowerCase().includes(q) || (z.discordName ?? '').toLowerCase().includes(q));
  return (
    <>
      {kopf}
      {meldung && <Meldung text={meldung.text} gut={meldung.gut} />}
      <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search access or Discord name" className={`${feld} mb-4 w-full max-w-xl`} />
      {!gezeigt.length ? <Glas className="p-6 text-sm text-white/50">Nobody matches.</Glas> : (
        <ul className="grid gap-3 min-[1900px]:grid-cols-2">{gezeigt.map((z, i) => <Karte key={z.name} z={z} i={i} jetzt={jetzt} neuLaden={holen} melden={(text, gut) => setMeldung({ text, gut })} />)}</ul>
      )}
    </>
  );
}
