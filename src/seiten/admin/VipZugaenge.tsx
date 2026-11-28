import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { Flaeche, Kennzahl } from '../../ds/Bausteine';
import { Laedt, Meldung, NurAdmins, WerkzeugKopf, datum, feld, knopfGefahr, knopfHaupt, knopfLeise } from './teile';

/*
 * VIP-Zugaenge (app/admin/vip-access auf main, /api/admin/vip-panel). Design-System 3.0 (28.11.2026): Zahlen als Filter oben (bald ablaufend,
 * ohne Discord, Manager), darunter eine Tabelle - je Zugang eine Zeile mit Frist-Balken, Aktionen klappen darunter auf; keine Buchstaben-Bildchen.
 * Jeder Zugang mit Frist, Chat, Discord-Verknuepfung und Loeschen.
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
      className={`px-5 py-3.5 transition hover:bg-white/[0.025] ${abgelaufen ? 'bg-akz/[0.05]' : ''}`}>
      <div className="grid items-center gap-x-5 gap-y-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.1fr)_19rem]">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold text-white">{z.name}</span>
            <span className="rounded-md bg-akz/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-akz">{was}</span>
            {!z.aktiv && <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-bold uppercase text-white/50">blocked</span>}
            {z.anfragen > 1 && <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-bold text-white/70">request #{z.anfragen}</span>}
          </p>
          <p className="mt-0.5 text-xs text-white/40">{z.verwaltet && <>manages <span className="text-white/70">{z.verwaltet}</span> · </>}created {z.angelegt ? datum(Date.parse(z.angelegt)) : '—'}</p>
        </div>
        <p className="text-xs">
          {z.discordId ? <a href={`https://discord.com/users/${z.discordId}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-white/75 hover:text-akz"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Discord: {z.discordName ?? z.discordId}</a>
            : <span className="flex items-center gap-1.5 text-akz"><span className="h-1.5 w-1.5 rounded-full bg-akz" />not linked to Discord</span>}
        </p>
        <div className="text-xs">
          {z.vipBis === null || z.vipBis === 0 ? <span className="text-white/45">no end date</span>
            : abgelaufen ? <span className="text-akz">expired on {datum(z.vipBis)}{z.fristLoescht ? ' · will be deleted' : ''}</span>
            : (
              <>
                <span className={tage !== null && tage <= 7 ? 'text-akz' : 'text-white/75'}>until {datum(z.vipBis)} · <b className="zahl">{tage}</b> {tage === 1 ? 'day' : 'days'}{z.fristLoescht ? ' · deleted afterwards' : ''}</span>
                <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/[0.06]"><span className={`block h-full rounded-full ${tage !== null && tage <= 7 ? 'bg-akz' : 'bg-white/40'}`} style={{ width: `${Math.max(3, Math.min(100, ((tage ?? 0) / 90) * 100))}%` }} /></span>
              </>
            )}
        </div>
        <div className="flex flex-wrap gap-1.5 lg:justify-end">
          <button type="button" disabled={laeuft || !z.discordId} title={z.discordId ? undefined : 'Link Discord first'} className={knopfLeise}
            onClick={async () => { const e = await schicke({ aktion: 'chat' }); melden(e.text ?? '', !!e.ok); if (e.ok && e.kanal) window.open(`https://discord.com/channels/${SERVER}/${e.kanal}`, '_blank'); }}>Chat</button>
          <button type="button" onClick={() => umschalten('frist')} className={offen === 'frist' ? `${knopfLeise} !border-akz !text-akz` : knopfLeise}>Deadline</button>
          {!z.discordId && <button type="button" onClick={() => umschalten('verknuepfen')} className={offen === 'verknuepfen' ? `${knopfLeise} !border-akz !text-akz` : knopfLeise}>Link Discord</button>}
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
  const [filter, setFilter] = useState<'alle' | 'bald' | 'vorbei' | 'ohne' | 'manager'>('alle');
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
  const bald = (z: Zeile) => !!z.vipBis && z.vipBis > jetzt && z.vipBis - jetzt < 7 * 86_400_000;
  const vorbei = (z: Zeile) => !!z.vipBis && z.vipBis <= jetzt;
  const FILTER: Array<{ k: typeof filter; titel: string; passt: (z: Zeile) => boolean }> = [
    { k: 'alle', titel: 'All', passt: () => true },
    { k: 'bald', titel: 'Ends within 7 days', passt: bald },
    { k: 'vorbei', titel: 'Expired', passt: vorbei },
    { k: 'ohne', titel: 'No Discord', passt: (z) => !z.discordId },
    { k: 'manager', titel: 'Managers', passt: (z) => z.art === 'manager' },
  ];
  const fl = FILTER.find((f) => f.k === filter) ?? FILTER[0];
  const gezeigt = zeilen.filter(fl.passt).filter((z) => !q || z.name.toLowerCase().includes(q) || (z.discordName ?? '').toLowerCase().includes(q))
    .sort((a, b) => Number(vorbei(b)) - Number(vorbei(a)) || Number(bald(b)) - Number(bald(a)) || a.name.localeCompare(b.name));
  return (
    <>
      {kopf}
      {meldung && <Meldung text={meldung.text} gut={meldung.gut} />}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Accesses', wert: zeilen.length, ton: 'weiss' as const, f: 'alle' as const },
          { label: 'End within 7 days', wert: zeilen.filter(bald).length, ton: 'akz' as const, f: 'bald' as const },
          { label: 'Not linked to Discord', wert: zeilen.filter((z) => !z.discordId).length, ton: 'akz' as const, f: 'ohne' as const },
          { label: 'Managers', wert: zeilen.filter((z) => z.art === 'manager').length, ton: 'weiss' as const, f: 'manager' as const },
        ].map((k) => (
          <button key={k.label} type="button" onClick={() => setFilter(k.f)} className={`fl-fest fl-klick !rounded-2xl px-5 py-4 text-left ${filter === k.f ? '!border-akz/50' : ''}`}>
            <Kennzahl label={k.label} wert={k.wert} ton={k.wert ? k.ton : 'weiss'} />
          </button>
        ))}
      </div>
      <Flaeche fest className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-5 py-3">
          {FILTER.map((f) => <button key={f.k} type="button" onClick={() => setFilter(f.k)} className={`chip ${filter === f.k ? 'chip-an' : ''}`}>{f.titel} <span className="zahl text-white/40">{zeilen.filter(f.passt).length}</span></button>)}
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search access or Discord name" className={`${feld} w-full sm:ml-auto sm:w-72`} />
        </div>
        <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.1fr)_19rem] gap-5 border-b border-white/[0.06] px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35 lg:grid"><span>Access</span><span>Discord</span><span>Deadline</span><span className="text-right">Actions</span></div>
        {!gezeigt.length ? <p className="px-5 py-8 text-center text-sm text-white/45">Nobody matches.</p> : (
          <ul className="divide-y divide-white/[0.05]">{gezeigt.map((z, i) => <Karte key={z.name} z={z} i={i} jetzt={jetzt} neuLaden={holen} melden={(text, gut) => setMeldung({ text, gut })} />)}</ul>
        )}
      </Flaeche>
    </>
  );
}
