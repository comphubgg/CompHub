'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';

/*
 * VIP-Zugaenge: jeder Zugang auf einen Blick, mit dem, was der Betreiber
 * damit tun will.
 *
 * Der Betreiber (24.9.2026): "ein Panel im Admin-Bereich, wo ich jeden
 * aufgelisteten VIP sehe. Buttons wie Decline - begruenden, wieso man den
 * Account geloescht hat -, Open a Chat mit dem User, oder Set a Time, wie
 * lange die VIP noch gueltig ist ... ueber DMs vom Bot." Und: sehen, die
 * wievielte Anfrage einer schon gestellt hat.
 *
 * Alles, was die Person erreicht, schickt der CompHub-Bot - nie eine private
 * Nachricht des Betreibers.
 */

interface Zeile {
  name: string;
  art: 'vip' | 'manager' | 'pro';
  stufe: 'vip' | 'streamer' | null;
  discordId: string | null;
  discordName: string | null;
  anfragen: number;
  angelegt: string;
  vipBis: number | null;
  fristLoescht: boolean;
  aktiv: boolean;
  verwaltet: string | null;
}
interface Treffer { id: string; name: string; anzeige: string }

const SERVER = '1529205620287344783';

function datum(ms: number) {
  return new Date(ms).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Das Datum fuer das Datumsfeld - JJJJ-MM-TT. */
function feldDatum(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function Karte({ z, jetzt, neuLaden, melden }: {
  z: Zeile; jetzt: number; neuLaden: () => void; melden: (text: string, gut: boolean) => void;
}) {
  const t = useT();
  const [offen, setOffen] = useState<'frist' | 'loeschen' | 'verknuepfen' | null>(null);
  const [bis, setBis] = useState(z.vipBis ? feldDatum(z.vipBis) : '');
  const [grund, setGrund] = useState('');
  const [suche, setSuche] = useState(z.name);
  const [treffer, setTreffer] = useState<Treffer[] | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const schicke = async (koerper: Record<string, unknown>) => {
    setLaeuft(true);
    try {
      const r = await fetch('/api/admin/vip-panel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: z.name, ...koerper }),
      });
      return await r.json() as { ok?: boolean; text?: string; kanal?: string; treffer?: Treffer[] };
    } catch {
      return { ok: false, text: t('Keine Verbindung zum Server.') };
    } finally { setLaeuft(false); }
  };

  const abgelaufen = z.vipBis !== null && z.vipBis > 0 && z.vipBis <= jetzt;
  const tage = z.vipBis && z.vipBis > jetzt ? Math.ceil((z.vipBis - jetzt) / 86_400_000) : null;
  const was = z.art === 'manager' ? 'Manager' : z.art === 'pro' ? 'Pro'
    : z.stufe === 'vip' ? 'VIP' : z.stufe === 'streamer' ? 'VIP Streamer' : 'VIP';

  const knopf = 'rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40';

  return (
    <li className={`rounded-xl border bg-zinc-900/50 p-4 ${abgelaufen ? 'border-amber-700/60' : 'border-zinc-800'}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold text-slate-100">{z.name}</span>
            <span className="rounded-md border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[11px]
                             font-semibold text-sky-300">{was}</span>
            {!z.aktiv && (
              <span className="rounded-md border border-zinc-700 px-1.5 py-0.5 text-[11px] text-slate-400">
                <T>gesperrt</T>
              </span>
            )}
            {z.anfragen > 1 && (
              <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px]
                               font-semibold text-amber-300">
                {z.anfragen}. <T>Anfrage</T>
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {z.verwaltet && <>{t('betreut')} {z.verwaltet} · </>}
            <T>angelegt</T> {z.angelegt ? datum(Date.parse(z.angelegt)) : '—'}
            {' · '}
            {z.discordId ? (
              <a href={`https://discord.com/users/${z.discordId}`} target="_blank" rel="noreferrer"
                className="text-slate-300 hover:text-sky-300">Discord: {z.discordName ?? z.discordId}</a>
            ) : (
              <span className="text-amber-300/80"><T>nicht mit Discord verknüpft</T></span>
            )}
          </p>
          <p className="mt-1 text-xs">
            {z.vipBis === null || z.vipBis === 0 ? (
              <span className="text-slate-400"><T>ohne Ende</T></span>
            ) : abgelaufen ? (
              <span className="text-amber-300">
                <T>abgelaufen am</T> {datum(z.vipBis)}
                {z.fristLoescht ? <> · <T>wird gelöscht</T></> : null}
              </span>
            ) : (
              <span className="text-slate-300">
                <T>gültig bis</T> {datum(z.vipBis)} · {tage} {t(tage === 1 ? 'Tag' : 'Tage')}
                {z.fristLoescht ? <> · <T>danach gelöscht</T></> : null}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={laeuft || !z.discordId}
            title={z.discordId ? undefined : t('Erst mit Discord verknüpfen')}
            onClick={async () => {
              const erg = await schicke({ aktion: 'chat' });
              melden(erg.text ?? '', !!erg.ok);
              if (erg.ok && erg.kanal) window.open(`https://discord.com/channels/${SERVER}/${erg.kanal}`, '_blank');
            }}
            className={`${knopf} border-zinc-700 text-slate-200 hover:border-sky-500 hover:text-sky-300`}>
            <T>Chat öffnen</T>
          </button>
          <button type="button" onClick={() => setOffen(offen === 'frist' ? null : 'frist')}
            className={`${knopf} ${offen === 'frist' ? 'border-sky-500 text-sky-300' : 'border-zinc-700 text-slate-200 hover:border-sky-500'}`}>
            <T>Frist setzen</T>
          </button>
          {!z.discordId && (
            <button type="button" onClick={() => setOffen(offen === 'verknuepfen' ? null : 'verknuepfen')}
              className={`${knopf} ${offen === 'verknuepfen' ? 'border-sky-500 text-sky-300' : 'border-zinc-700 text-slate-200 hover:border-sky-500'}`}>
              <T>Discord verknüpfen</T>
            </button>
          )}
          <button type="button" onClick={() => setOffen(offen === 'loeschen' ? null : 'loeschen')}
            className={`${knopf} ${offen === 'loeschen' ? 'border-rose-500 text-rose-300' : 'border-rose-900/70 text-rose-300 hover:border-rose-500'}`}>
            <T>Löschen</T>
          </button>
        </div>
      </div>

      {offen === 'frist' && (
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-zinc-800 pt-3">
          <label className="block text-xs text-slate-400">
            <span className="mb-1 block"><T>Gültig bis</T></span>
            <input type="date" value={bis} min={feldDatum(jetzt + 86_400_000)}
              onChange={(e) => setBis(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-slate-100
                         outline-none focus:border-sky-500 [color-scheme:dark]" />
          </label>
          <button type="button" disabled={laeuft || !bis}
            onClick={async () => {
              const erg = await schicke({ aktion: 'frist', bis });
              melden(erg.text ?? '', !!erg.ok);
              if (erg.ok) { setOffen(null); neuLaden(); }
            }}
            className={`${knopf} border-sky-500 bg-sky-500 text-white hover:bg-sky-400`}>
            <T>Frist setzen und per DM mitteilen</T>
          </button>
          {z.vipBis ? (
            <button type="button" disabled={laeuft}
              onClick={async () => {
                const erg = await schicke({ aktion: 'frist', bis: null });
                melden(erg.text ?? '', !!erg.ok);
                if (erg.ok) { setOffen(null); neuLaden(); }
              }}
              className={`${knopf} border-zinc-700 text-slate-300 hover:border-zinc-500`}>
              <T>Ohne Ende</T>
            </button>
          ) : null}
          <p className="w-full text-[11px] text-slate-500">
            <T>Der Bot schickt der Person das Datum. Ist es erreicht, wird der Zugang gelöscht, samt Rollen und Kanal.</T>
          </p>
        </div>
      )}

      {offen === 'verknuepfen' && (
        <div className="mt-3 border-t border-zinc-800 pt-3">
          <div className="flex flex-wrap gap-2">
            <input value={suche} onChange={(e) => setSuche(e.target.value)}
              placeholder={t('Discord-Name suchen')}
              className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm
                         text-slate-100 outline-none focus:border-sky-500" />
            <button type="button" disabled={laeuft || suche.trim().length < 2}
              onClick={async () => {
                const erg = await schicke({ aktion: 'suchen', q: suche });
                setTreffer(erg.treffer ?? []);
              }}
              className={`${knopf} border-zinc-700 text-slate-200 hover:border-sky-500`}>
              <T>Suchen</T>
            </button>
          </div>
          {treffer && (
            treffer.length ? (
              <ul className="mt-2 space-y-1">
                {treffer.map((x) => (
                  <li key={x.id}>
                    <button type="button" disabled={laeuft}
                      onClick={async () => {
                        const erg = await schicke({ aktion: 'verknuepfen', discordId: x.id, discordName: x.anzeige || x.name });
                        melden(erg.text ?? '', !!erg.ok);
                        if (erg.ok) { setOffen(null); neuLaden(); }
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm
                                 text-slate-200 transition hover:bg-zinc-800">
                      <span className="font-semibold">{x.anzeige}</span>
                      <span className="text-xs text-slate-500">@{x.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-500"><T>Niemand auf dem Server gefunden.</T></p>
            )
          )}
        </div>
      )}

      {offen === 'loeschen' && (
        <div className="mt-3 space-y-2 border-t border-zinc-800 pt-3">
          <textarea value={grund} onChange={(e) => setGrund(e.target.value)} rows={3}
            placeholder={t('Grund (geht als DM vom CompHub-Bot an die Person)')}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-slate-100
                       outline-none focus:border-rose-500" />
          <button type="button" disabled={laeuft || grund.trim().length < 3}
            onClick={async () => {
              if (!window.confirm(t('Zugang wirklich löschen? Anmeldung, Rollen und Kanal sind danach weg.'))) return;
              const erg = await schicke({ aktion: 'loeschen', grund });
              melden(erg.text ?? '', !!erg.ok);
              if (erg.ok) neuLaden();
            }}
            className={`${knopf} border-rose-600 bg-rose-600/90 text-white hover:bg-rose-500`}>
            <T>Zugang löschen und Grund senden</T>
          </button>
        </div>
      )}
    </li>
  );
}

export default function VipZugaengeSeite() {
  const t = useT();
  const [zeilen, setZeilen] = useState<Zeile[] | null>(null);
  const [fehler, setFehler] = useState('');
  const [erlaubt, setErlaubt] = useState(true);
  const [meldung, setMeldung] = useState<{ text: string; gut: boolean } | null>(null);
  const [suche, setSuche] = useState('');
  /** Der Zeitpunkt des Ladens - gegen ihn rechnen Frist und Resttage. */
  const [jetzt, setJetzt] = useState(() => Date.now());

  const holen = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/vip-panel', { cache: 'no-store' });
      if (r.status === 403) { setErlaubt(false); return; }
      const j = await r.json() as { zugaenge?: Zeile[]; fehler?: string; abgelaufen?: string[] };
      if (!r.ok) { setFehler(j.fehler ?? t('Nicht ladbar.')); return; }
      setFehler('');
      setJetzt(Date.now());
      setZeilen(j.zugaenge ?? []);
      if (j.abgelaufen?.length) {
        setMeldung({ text: `${t('Abgelaufen und gelöscht')}: ${j.abgelaufen.join(', ')}`, gut: true });
      }
    } catch (e) { setFehler((e as Error).message); }
  }, [t]);

  // Beim ersten Aufruf laden - ueber einen Zeitgeber, nicht mitten im Effekt.
  useEffect(() => {
    const uhr = setTimeout(() => { void holen(); }, 0);
    return () => clearTimeout(uhr);
  }, [holen]);

  const gezeigt = (zeilen ?? []).filter((z) => {
    const q = suche.trim().toLowerCase();
    return !q || z.name.toLowerCase().includes(q) || (z.discordName ?? '').toLowerCase().includes(q);
  });

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold"><T>VIP-Zugänge</T></h1>
            <p className="mt-0.5 text-sm text-slate-500">
              <T>Jeder Zugang mit Frist, Chat und Löschen. Was die Person erreicht, schickt der CompHub-Bot.</T>
            </p>
          </div>
          <Link href="/admin" prefetch={false}
            className="text-sm text-slate-500 transition hover:text-sky-400">
            ← <T>zu den Admin-Werkzeugen</T>
          </Link>
        </div>

        {!erlaubt ? (
          <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-slate-400">
            <T>Diese Seite ist dem Adminkonto vorbehalten.</T>
          </p>
        ) : fehler ? (
          <p className="rounded-lg border border-amber-700/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
            {fehler}
          </p>
        ) : zeilen === null ? (
          <LadeSchirm />
        ) : (
          <>
            {meldung && (
              <p className={`mb-3 rounded-lg border px-4 py-2.5 text-sm ${meldung.gut
                ? 'border-sky-700/60 bg-sky-950/30 text-sky-200' : 'border-amber-700/60 bg-amber-950/30 text-amber-200'}`}>
                {meldung.text}
              </p>
            )}
            <input value={suche} onChange={(e) => setSuche(e.target.value)}
              placeholder={t('Zugang oder Discord-Name suchen')}
              className="mb-3 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-slate-100
                         outline-none placeholder:text-slate-600 focus:border-sky-500" />
            <ul className="space-y-3">
              {gezeigt.map((z) => (
                <Karte key={z.name} z={z} jetzt={jetzt} neuLaden={holen}
                  melden={(text, gut) => setMeldung({ text: t(text), gut })} />
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
