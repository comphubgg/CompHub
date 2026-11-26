import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Kopf from '../../teile/Kopf';
import { Glas } from '../../teile/Glas';
import { useWer } from '../../teile/Anmeldung';
import { Laedt, feld, her, knopfHaupt, knopfLeise, wann } from '../admin/teile';

/*
 * Nachrichten (/messages). Auf der Seite gibt es kein Formular mehr (Betreiber 27.10.2026: "nur ueber Discord oder per E-Mail") - /messages leitet dort
 * zu /contact. Die bestehenden Gespraeche liegen aber weiter in der Ablage (GET /api/kontakt/chat) und lassen sich lesen und beantworten:
 *   POST  /api/kontakt/chat { id, text }            antworten (solange offen)
 *   POST  /api/kontakt/chat { id, text, anfrage }   ein geschlossenes Gespraech wieder oeffnen lassen
 *   POST  /api/kontakt/chat { id, verlassen, grund } aus einer Gruppe austreten (nur Dazugeholte)
 *   PATCH /api/kontakt/chat { id }                  gelesen
 * Admins sehen hier alle Gespraeche; Notizen, Erledigt und Loeschen stehen im Admin-Werkzeug "Contact".
 */
interface Nachricht { id: string; zeit: number; von: 'nutzer' | 'betreiber'; name: string; text: string; bilder?: string[] }
interface Gespraech {
  id: string; zeit: number; thema: string; eigenesThema: string; erledigt: boolean; vonName: string; vonVip: boolean; vonRolle: string | null;
  teilnehmer: Array<{ id: string; name: string }>; gruppe: boolean; darfVerlassen: boolean; darfSchreiben: boolean; verlauf: Nachricht[]; zuletzt: number; ungelesen: number;
}
const MAIL = 'contact@thecomphub.com';
const THEMEN: Record<string, string> = { fehler: 'Bug', idee: 'Idea', vip: 'VIP', partner: 'Partnership', daten: 'Data', konto: 'Account', anderes: 'Other' };

export default function Nachrichten() {
  const { wer, oeffnen } = useWer();
  const [daten, setDaten] = useState<{ admin: boolean; gespraeche: Gespraech[] } | null>(null);
  const [angemeldet, setAngemeldet] = useState(true);
  const [offen, setOffen] = useState<string | null>(null);
  const [text, setText] = useState(''); const [stand, setStand] = useState(''); const [grund, setGrund] = useState('');
  const unten = useRef<HTMLDivElement>(null);
  // Die Einladung kommt von der Seite (wie DiscordKnopf dort) - sie wechselt gelegentlich.
  const [discord, setDiscord] = useState('');
  useEffect(() => { fetch('/api/discord/einladung').then((r) => r.json()).then((j) => setDiscord(String(j?.url ?? ''))).catch(() => {}); }, []);

  const laden = useCallback(async () => {
    try {
      const j = await (await fetch('/api/kontakt/chat', { cache: 'no-store' })).json();
      if (j?.angemeldet === false || !j?.ok) { setAngemeldet(false); setDaten({ admin: false, gespraeche: [] }); return; }
      setAngemeldet(true); setDaten({ admin: Boolean(j.admin), gespraeche: j.gespraeche ?? [] });
    } catch { setDaten({ admin: false, gespraeche: [] }); }
  }, []);
  useEffect(() => { void laden(); const t = setInterval(() => void laden(), 30_000); return () => clearInterval(t); }, [laden, wer?.userName]);

  const g = daten?.gespraeche.find((x) => x.id === offen) ?? null;
  useEffect(() => {
    if (!g || !g.ungelesen) return;
    void fetch('/api/kontakt/chat', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: g.id }) }).then(() => laden()).catch(() => {});
  }, [g?.id, g?.ungelesen, laden]);
  useEffect(() => { unten.current?.scrollIntoView({ block: 'end' }); }, [g?.id, g?.verlauf.length]);

  async function schicken(extra: Record<string, unknown>) {
    if (!g) return; setStand('sending …');
    try {
      const r = await fetch('/api/kontakt/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: g.id, ...extra }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setStand(j?.fehler ?? 'not sent'); return; }
      setText(''); setGrund(''); setStand(j?.hinweis ?? ''); await laden();
    } catch (e) { setStand((e as Error).message); }
  }

  const thema = (x: Gespraech) => (x.thema === 'anderes' && x.eigenesThema ? x.eigenesThema : THEMEN[x.thema] ?? x.thema);
  return (
    <div className="min-h-screen">
      <Kopf bereich="account" />
      <main className="px-6 pb-16 pt-8 lg:px-10">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex flex-wrap items-end gap-4">
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-400">Account</p>
            <h1 className="mt-1 text-5xl font-extrabold tracking-tight text-white">Messages</h1>
            <p className="mt-2 text-white/55">{daten?.admin ? 'Every conversation with CompHub. Notes, done and delete are in the admin contact tool.' : 'Your conversations with CompHub. New questions go to Discord or email.'}</p>
          </div>
          {daten?.admin && <Link to="/admin/contact" className={`${knopfLeise} !border-rose-400/40 !text-rose-200`}>Contact inbox (admin)</Link>}
        </motion.div>

        {!daten ? <Laedt /> : !angemeldet ? (
          <Glas className="mx-auto mt-6 max-w-xl p-10 text-center">
            <h2 className="text-2xl font-extrabold text-white">Sign in to see your messages</h2>
            <p className="mt-2 text-sm text-white/55">Your conversations with CompHub are tied to your account.</p>
            <button type="button" onClick={() => oeffnen('konto')} className={`${knopfHaupt} mt-6 px-6 py-2.5 text-sm`}>Sign in</button>
          </Glas>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
            <div className="space-y-4">
              <Glas className="overflow-hidden">
                {!daten.gespraeche.length ? <p className="p-6 text-sm text-white/45">No conversations yet.</p> : daten.gespraeche.map((x, i) => (
                  <motion.button key={x.id} type="button" onClick={() => setOffen(x.id)} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 20) * 0.025 }}
                    className={`block w-full border-b border-white/5 px-4 py-3 text-left transition last:border-0 ${offen === x.id ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'}`}>
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-white">{daten.admin ? x.vonName : thema(x)}</span>
                      {x.vonVip && daten.admin && <span className="rounded-full bg-violet-400/15 px-1.5 text-[9px] font-bold uppercase text-violet-300">VIP</span>}
                      {x.gruppe && <span className="rounded-full bg-white/10 px-1.5 text-[9px] font-bold uppercase text-white/60">Group</span>}
                      {x.erledigt && <span className="rounded-full bg-white/5 px-1.5 text-[9px] font-bold uppercase text-white/40">closed</span>}
                      {!!x.ungelesen && <span className="ml-auto rounded-full bg-sky-400 px-1.5 text-[10px] font-bold text-[#06080f]">{x.ungelesen}</span>}
                      <span className={`${x.ungelesen ? '' : 'ml-auto'} shrink-0 text-[11px] text-white/35`}>{her(x.zuletzt)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-white/45">{daten.admin ? `${thema(x)} · ` : ''}{x.verlauf[x.verlauf.length - 1]?.text}</span>
                  </motion.button>
                ))}
              </Glas>
              <Glas className="p-5">
                <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-sky-300">Contact CompHub</h2>
                <p className="mt-2 text-sm text-white/55">Questions, ideas or something broken? Write on Discord or by email — in English or German.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {discord && <a href={discord} target="_blank" rel="noreferrer" className={`${knopfHaupt} px-4 py-2`}>Discord</a>}
                  <a href={`mailto:${MAIL}`} className={`${knopfLeise} px-4 py-2`}>{MAIL}</a>
                </div>
              </Glas>
            </div>

            <Glas className="flex min-h-[520px] flex-col overflow-hidden">
              <AnimatePresence mode="wait">
                {!g ? (
                  <motion.div key="leer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid flex-1 place-items-center p-10 text-center text-sm text-white/45">
                    {daten.gespraeche.length ? 'Choose a conversation on the left.' : 'Nothing here yet.'}
                  </motion.div>
                ) : (
                  <motion.div key={g.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col">
                    <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-5 py-3">
                      <span className="text-base font-bold text-white">{thema(g)}</span>
                      <span className="text-xs text-white/40">started {wann(g.zeit)}{daten.admin ? ` by ${g.vonName}` : ''}</span>
                      {g.teilnehmer.length > 0 && <span className="text-xs text-white/45">· with {g.teilnehmer.map((t) => t.name).join(', ')}</span>}
                    </div>
                    <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4" style={{ maxHeight: 'calc(100vh - 360px)' }}>
                      {g.verlauf.map((n) => {
                        const ich = daten.admin ? n.von === 'betreiber' : n.von === 'nutzer' && n.name === (wer?.userName ?? n.name);
                        return (
                          <div key={n.id} className={`flex ${ich ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${ich ? 'bg-sky-400/15 text-sky-50' : 'bg-white/[0.05] text-white/90'}`}>
                              <p className="text-[11px] font-semibold text-white/45">{n.name} · {wann(n.zeit)}</p>
                              <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">{n.text}</p>
                              {!!n.bilder?.length && <div className="mt-2 flex flex-wrap gap-2">{n.bilder.map((b) => { const u = /^(data:|https?:|\/)/.test(b) ? b : `/api/kontakt-bild?datei=${encodeURIComponent(b)}`; return <a key={b} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="h-24 rounded-lg object-cover" /></a>; })}</div>}
                            </div>
                          </div>
                        );
                      })}
                      <div ref={unten} />
                    </div>
                    <div className="border-t border-white/5 p-4">
                      {g.darfSchreiben ? (
                        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) void schicken({ text }); }} className="flex gap-2">
                          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Write a reply …" className={`${feld} flex-1 resize-none`}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (text.trim()) void schicken({ text }); } }} />
                          <button type="submit" disabled={!text.trim()} className={`${knopfHaupt} self-end px-5 py-2`}>Send</button>
                        </form>
                      ) : (
                        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) void schicken({ text, anfrage: true }); }} className="space-y-2">
                          <p className="text-xs text-white/45">This conversation is closed. You can ask to reopen it — the operator decides.</p>
                          <div className="flex gap-2">
                            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Why should it be reopened?" className={`${feld} flex-1`} />
                            <button type="submit" disabled={!text.trim()} className={knopfLeise}>Request reopening</button>
                          </div>
                        </form>
                      )}
                      {g.darfVerlassen && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
                          <input value={grund} onChange={(e) => setGrund(e.target.value)} placeholder="Reason (optional)" className={`${feld} flex-1 py-1.5 text-xs`} />
                          <button type="button" className={knopfLeise} onClick={() => { if (window.confirm('Leave this group conversation?')) void schicken({ verlassen: true, grund }); }}>Leave group</button>
                        </div>
                      )}
                      {stand && <p className="mt-2 text-xs text-white/55">{stand}</p>}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Glas>
          </div>
        )}
      </main>
    </div>
  );
}
