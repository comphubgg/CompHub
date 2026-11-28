import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from '../port/next/link';
import T from '../port/app/components/T';
import SeitenKopf from '../port/app/components/SeitenKopf';
import { NurAdmins } from '../teile';
import { useT } from '../port/app/components/SprachProvider';

/*
 * In einen anderen Zugang wechseln.
 *
 * Der Knopf dafuer stand bisher in der Zugangsliste unter "Konten", zwischen
 * Schluesseln, Rollen und Fristen - der Betreiber hat ihn dort schlicht nicht
 * gefunden. Er wollte eine eigene Seite: "kann ich einfach den User anklicken
 * und dann switche ich automatisch."
 *
 * Also genau das und sonst nichts: eine Liste, ein Klick, drin. Was ein
 * Wechsel bedeutet, steht einmal oben statt in jeder Zeile.
 */

interface Zugang {
  name: string;
  aktiv: boolean;
  angelegt: string;
  rolle: string | null;
  verwaltet?: string | null;
}

export default function WechselnSeite() {
  const t = useT();
  const [liste, setListe] = useState<Zugang[] | null>(null);
  const [erlaubt, setErlaubt] = useState(true);
  const [suche, setSuche] = useState('');
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState<string | null>(null);

  const holen = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/vip-zugaenge', { cache: 'no-store' });
      if (r.status === 403) { setErlaubt(false); setListe([]); return; }
      const j = await r.json();
      setListe(Array.isArray(j?.zugaenge) ? j.zugaenge : []);
    } catch {
      setListe([]);
    }
  }, []);

  useEffect(() => { void holen(); }, [holen]);

  const gezeigt = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return (liste ?? [])
      .filter((z) => !q || z.name.toLowerCase().includes(q)
        || (z.verwaltet ?? '').toLowerCase().includes(q))
      /*
       * Aktive zuerst, danach alphabetisch.
       *
       * In einen stillgelegten Zugang zu wechseln hiesse, sich selbst
       * auszusperren - er steht deshalb unten und laesst sich nicht
       * anklicken.
       */
      .sort((a, b) => Number(b.aktiv) - Number(a.aktiv)
        || a.name.localeCompare(b.name));
  }, [liste, suche]);

  async function wechseln(name: string) {
    const sicher = window.confirm(
      `${t('In diesen Zugang wechseln')}: ${name}\n\n`
      + t('Zum Zurückkehren musst du dich neu anmelden.'));
    if (!sicher) return;
    setFehler('');
    setLaeuft(name);
    try {
      const r = await fetch('/api/admin/konto-wechsel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setFehler(t(j?.fehler ?? 'Switching not possible')); return; }
      // Ganz neu laden: jede Seite haelt die Rechte aus dem ersten Abruf fest.
      window.location.href = '/';
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaeuft(null);
    }
  }

  if (!erlaubt) {
    return (
      <NurAdmins />
    );
  }

  return (
    <main className="text-white/85">
      <div className="">
        <SeitenKopf className="mb-5" marke={<T>Testing</T>} titel={<T>Switch into an access</T>}
          text={<T>One click and you see what this access sees — its overlays, its rights. Getting back only works with a new sign-in; a cookie secretly carrying your admin rights would be a second key to the admin area.</T>} />

        <input value={suche} onChange={(e) => setSuche(e.target.value)}
          placeholder={t('Namen suchen')}
          className="mt-4 w-full rounded-lg border border-white/10 bg-black/40
                     px-3 py-2 text-sm text-white outline-none
                     placeholder:text-white/30 focus:border-akz" />

        {fehler && (
          <p className="mt-3 rounded-lg border border-rose-900/60 bg-rose-950/30
                        px-3 py-2 text-xs text-rose-300">{fehler}</p>
        )}

        {!liste && (
          <p className="mt-6 text-sm text-white/30"><T>Wird geladen …</T></p>
        )}
        {liste && !gezeigt.length && (
          <p className="mt-6 text-sm text-white/30"><T>Nothing found.</T></p>
        )}

        <ul className="mt-4 space-y-2">
          {gezeigt.map((z) => (
            <li key={z.name}>
              <button
                onClick={() => z.aktiv && void wechseln(z.name)}
                disabled={!z.aktiv || laeuft === z.name}
                className={`flex w-full items-center gap-3 rounded-xl border
                            px-4 py-3 text-left transition ${z.aktiv
                  ? 'border-white/10 bg-white/[0.03] hover:border-akz'
                  : 'cursor-not-allowed border-white/5 bg-black/20 opacity-50'}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold
                                   text-white">
                    {z.name}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-white/40">
                    {z.verwaltet
                      ? <><T>Manager für</T> {z.verwaltet}</>
                      : z.rolle ? z.rolle : <T>VIP</T>}
                    {!z.aktiv ? ` · ${t('stillgelegt')}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] font-medium text-akz">
                  {laeuft === z.name ? <T>one moment …</T> : <T>hineinsehen</T>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
