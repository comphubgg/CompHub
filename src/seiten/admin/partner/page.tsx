import { useEffect, useMemo, useState } from 'react';
import T from '../port/app/components/T';
import SeitenKopf from '../port/app/components/SeitenKopf';
import { NurAdmins } from '../teile';
import { useZugang } from '../port/app/lib/zugang';
import { PARTNER_VORLAGEN, PARTNER_STANDARD, fuelleVorlage, type PartnerEinstellungen } from '../port/lib/partnerVorlagen';

/*
 * Partnership Requests (Betreiber, 16.11.2026: "mach die E-Mails als Vorlage auf meiner Seite ... als Admin-Tool, und nachher kann ich dort
 * schicken, also kopieren"). Oben einmal Name, Discord, X, Angebot und Video-Link - daraus fuellen sich alle Vorlagen. Je Vorlage ein
 * persoenlicher Satz, Kopieren je Feld und "In Mail oeffnen" (mailto). Alles bleibt in diesem Browser (localStorage); gesendet wird von hier nichts.
 */

const SPEICHER = 'admin-partner:v1';
interface Stand { e: PartnerEinstellungen; persoenlich: Record<string, string>; gesendet: Record<string, number> }

function lies(): Stand {
  try {
    const roh = localStorage.getItem(SPEICHER);
    if (roh) { const j = JSON.parse(roh) as Partial<Stand>; return { e: { ...PARTNER_STANDARD, ...(j.e ?? {}) }, persoenlich: j.persoenlich ?? {}, gesendet: j.gesendet ?? {} }; }
  } catch { /* privater Modus: dann ohne Merken */ }
  return { e: { ...PARTNER_STANDARD }, persoenlich: {}, gesendet: {} };
}

function KopierKnopf({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" disabled={!text}
      onClick={() => { void navigator.clipboard.writeText(text).then(() => { setOk(true); window.setTimeout(() => setOk(false), 1500); }); }}
      className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-bold transition disabled:opacity-40 ${ok ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-white/15 text-white/70 hover:border-sky-500 hover:text-sky-300'}`}>
      {ok ? '✓ Copied' : label}
    </button>
  );
}

export default function PartnerSeite() {
  const zugang = useZugang();
  const [stand, setStand] = useState<Stand | null>(null);
  const [offen, setOffen] = useState<string>(PARTNER_VORLAGEN[0].id);

  // Erst im Browser lesen (der Server kennt kein localStorage) - ueber eine Mikroaufgabe, wie in der Tierlist.
  useEffect(() => { void Promise.resolve().then(() => setStand(lies())); }, []);
  useEffect(() => { if (stand) { try { localStorage.setItem(SPEICHER, JSON.stringify(stand)); } catch { /* ohne Merken */ } } }, [stand]);

  const fertig = useMemo(() => {
    if (!stand) return {} as Record<string, string>;
    return Object.fromEntries(PARTNER_VORLAGEN.map((v) => [v.id, fuelleVorlage(v.text, stand.e, stand.persoenlich[v.id] ?? '')]));
  }, [stand]);

  if (!zugang.laedt && !zugang.admin) {
    return <NurAdmins />;
  }
  if (!stand) return <main className="" />;

  const setzeE = (k: keyof PartnerEinstellungen, w: string) => setStand({ ...stand, e: { ...stand.e, [k]: w } });
  const feld = 'w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40';
  const fehlt = (['name', 'discord', 'x'] as const).filter((k) => !stand.e[k].trim());
  const v = PARTNER_VORLAGEN.find((x) => x.id === offen) ?? PARTNER_VORLAGEN[0];
  const text = fertig[v.id] ?? '';
  const offenePlatzhalter = (text.match(/\[[^\]]+\]/g) ?? []).filter((x, i, a) => a.indexOf(x) === i);

  return (
    <main className="text-white/85">
      <div className="">
        <SeitenKopf className="mb-5" marke={<T>Inhalte</T>} titel="Partnership Requests"
          text={<T>Ready requests to streamers. Enter your details once at the top, then every template fills itself. Copy and send yourself – nothing is sent from here.</T>} />

        {/* Die Angaben fuer alle Vorlagen */}
        <section className="mb-5 rounded-2xl border border-white/10 bg-white/[0.035] backdrop-blur-xl p-4">
          <div className="grid gap-3 md:grid-cols-5">
            {([['name', 'Your name', 'z. B. Max'], ['discord', 'Discord-Link', 'discord.gg/…'], ['x', 'X-Handle', '@thecomphub'],
              ['angebot', 'Angebot', 'free VIP access'], ['video', 'Video link (for DMs)', 'YouTube / X-Post']] as const).map(([k, label, ph]) => (
              <label key={k} className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40"><T>{label}</T></span>
                <input value={stand.e[k]} placeholder={ph} onChange={(ev) => setzeE(k, ev.target.value)} className={feld} />
              </label>
            ))}
          </div>
          {fehlt.length > 0 && <p className="mt-2 text-xs text-amber-300"><T>Still empty – otherwise shows as a placeholder in the text:</T> {fehlt.join(', ')}</p>}
        </section>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
          {/* Die Liste */}
          <nav className="flex flex-col gap-1.5">
            {PARTNER_VORLAGEN.map((x) => (
              <button key={x.id} type="button" onClick={() => setOffen(x.id)}
                className={`rounded-xl border px-3 py-2.5 text-left transition ${offen === x.id ? 'border-sky-500 bg-sky-500/10' : 'border-white/10 bg-white/[0.035] backdrop-blur-xl hover:border-white/25'}`}>
                <span className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${x.art === 'mail' ? 'bg-sky-500/20 text-sky-300' : 'bg-violet-500/20 text-violet-300'}`}>{x.art === 'mail' ? 'Mail' : 'DM'}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{x.titel}</span>
                  {stand.gesendet[x.id] ? <span className="text-xs text-emerald-400" title={new Date(stand.gesendet[x.id]).toLocaleString()}>✓</span> : null}
                </span>
                <span className="mt-0.5 block truncate text-xs text-white/40">{x.hinweis}</span>
              </button>
            ))}
          </nav>

          {/* Die gewaehlte Vorlage */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] backdrop-blur-xl p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold text-white">{v.titel}</h2>
              <div className="flex flex-wrap gap-2">
                {v.art === 'mail' && v.an && (
                  <a href={`mailto:${v.an}?subject=${encodeURIComponent(v.betreff)}&body=${encodeURIComponent(text)}`}
                    className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-sky-400"><T>Open in mail</T></a>
                )}
                <button type="button"
                  onClick={() => { const g = { ...stand.gesendet }; if (g[v.id]) delete g[v.id]; else g[v.id] = Date.now(); setStand({ ...stand, gesendet: g }); }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${stand.gesendet[v.id] ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-white/15 text-white/70 hover:border-emerald-500'}`}>
                  {stand.gesendet[v.id] ? '✓ Sent' : 'Mark as sent'}
                </button>
              </div>
            </div>

            {v.an && (
              <div className="mb-3 flex items-center gap-2">
                <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40"><T>Recipient</T></span>
                <code className="min-w-0 flex-1 truncate rounded-lg bg-black/40 px-3 py-2 text-sm text-white/85">{v.an}</code>
                <KopierKnopf text={v.an} label="Copy" />
              </div>
            )}
            {v.betreff && (
              <div className="mb-3 flex items-center gap-2">
                <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40"><T>Subject</T></span>
                <span className="min-w-0 flex-1 truncate rounded-lg bg-black/40 px-3 py-2 text-sm text-white/85">{v.betreff}</span>
                <KopierKnopf text={v.betreff} label="Copy" />
              </div>
            )}

            <label className="mb-3 block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40"><T>Personal sentence (optional)</T></span>
              <input value={stand.persoenlich[v.id] ?? ''} placeholder={v.persoenlichHilfe ?? ''}
                onChange={(ev) => setStand({ ...stand, persoenlich: { ...stand.persoenlich, [v.id]: ev.target.value } })} className={feld} />
            </label>

            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40"><T>Text</T></span>
              <KopierKnopf text={text} label="Copy text" />
            </div>
            <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 p-4 font-sans text-sm leading-relaxed text-white/85">{text}</pre>
            {offenePlatzhalter.length > 0 && (
              <p className="mt-2 text-xs text-amber-300"><T>Still to fill in:</T> {offenePlatzhalter.join(' ')}</p>
            )}
            {v.art === 'mail' && <p className="mt-3 text-xs text-white/40"><T>Do not forget the attachment: the demo video and ideally a short clip of your overlays in OBS.</T></p>}
          </section>
        </div>
      </div>
    </main>
  );
}
