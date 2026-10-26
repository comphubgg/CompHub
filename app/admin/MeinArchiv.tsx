'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { ARTEN, overlayAdresse } from '@/app/overlays/OverlayGeruest';

/*
 * Mein Archiv - alles, was ein Konto gespeichert hat, an einer Stelle.
 *
 * Der Betreiber (1.10.2026): "wenn ich Save druecke, muss es irgendein
 * Overlay-Archiv im Dashboard des Users geben, damit er die auch immer wieder
 * oeffnen, benutzen, bearbeiten kann" - und darunter immer auch die
 * gespeicherten Tierlists und alles andere, was man mal speichern kann. Ein
 * privates Archiv je Konto.
 *
 * Private heisst: jede Liste kommt von einer Schnittstelle, die nur die
 * eigenen Eintraege des angemeldeten Kontos herausgibt (overlay-config
 * "meine", tierlists, meine-prognose). Hier wird nichts zusammengesucht.
 *
 * Neue Arten, die man speichern kann, kommen als weiterer Abschnitt hinzu -
 * jeder Abschnitt ist eine Liste von Zeilen mit Titel, Zusatz, Datum und
 * Links.
 */

interface Overlay { id: string; typ: string; name: string; stand: number; geaendert: string }
interface Tierlist { listId: string; listName?: string; modus?: 'solo' | 'duo' | 'trio'; entries?: Array<{ tier?: string | null }>; updatedAt?: number }
interface Zeile {
  schluessel: string; titel: string; zusatz: string; datum: number | null;
  oeffnen: { href: string; text: string };
  /** Nur Overlays: die Adresse fuer OBS und das Loeschen. */
  overlay?: { id: string; typ: string };
  /** Nur Tierlists: das Loeschen (Betreiber, 26.10.2026: "Overlays und Tierlists sollte man im Dashboard loeschen koennen"). */
  tierlist?: { id: string; spieler: number; eingestuft: number };
}

const DATUM = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export default function MeinArchiv() {
  const t = useT();
  const [overlays, setOverlays] = useState<Overlay[] | null>(null);
  const [tierlists, setTierlists] = useState<Tierlist[] | null>(null);
  const [prognose, setPrognose] = useState<boolean | null>(null);
  const [kopiert, setKopiert] = useState('');

  const laden = useCallback(() => {
    fetch('/api/overlay-config?meine=1', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => setOverlays(Array.isArray(j?.overlays) ? j.overlays : []))
      .catch(() => setOverlays([]));
    fetch('/api/tierlists', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => setTierlists(Array.isArray(j?.lists) ? j.lists : []))
      .catch(() => setTierlists([]));
    // Die eigene Globals-Prognose gibt es nur mit VIP-Zugang - ohne ist die Antwort ein Nein, kein Fehler.
    fetch('/api/meine-prognose', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
      .then((j) => setPrognose(Array.isArray(j?.prognosen) && j.prognosen.length > 0))
      .catch(() => setPrognose(false));
  }, []);
  useEffect(() => { laden(); }, [laden]);

  const art = (typ: string) => ARTEN.find((a) => a.schluessel === typ);

  const overlayZeilen: Zeile[] = (overlays ?? [])
    // Die Studio-Szenen gibt es nicht mehr - was nur dort sichtbar war, steht nicht im Archiv.
    .filter((o) => art(o.typ))
    .sort((a, b) => Date.parse(b.geaendert) - Date.parse(a.geaendert))
    .map((o) => ({
      schluessel: o.id, titel: o.name, zusatz: art(o.typ)?.titel ?? o.typ,
      datum: Date.parse(o.geaendert) || null,
      oeffnen: { href: `${art(o.typ)!.pfad}?id=${encodeURIComponent(o.id)}&bauen=1`, text: 'Bearbeiten' },
      overlay: { id: o.id, typ: o.typ },
    }));

  const tierZeilen: Zeile[] = (tierlists ?? [])
    .filter((l) => (l.entries?.length ?? 0) > 0)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .map((l) => {
      const gesamt = l.entries?.length ?? 0;
      const gesetzt = (l.entries ?? []).filter((e) => e.tier).length;
      return {
        schluessel: l.listId, titel: l.listName || 'Tierlist',
        zusatz: `${l.modus ? ({ solo: 'Solo', duo: 'Duos', trio: 'Trios' }[l.modus]) + ' · ' : ''}${gesetzt} / ${gesamt} ${t('eingestuft')}`,
        datum: l.updatedAt ?? null,
        tierlist: { id: l.listId, spieler: gesamt, eingestuft: gesetzt },
        // Direkt im gespeicherten Modus: /tierlist/solos, /duos oder /trios.
        oeffnen: {
          href: `/tierlist${l.modus ? '/' + ({ solo: 'solos', duo: 'duos', trio: 'trios' }[l.modus]) : ''}?liste=${encodeURIComponent(l.listId)}`,
          text: 'Öffnen',
        },
      };
    });

  async function kopieren(typ: string, id: string) {
    try {
      await navigator.clipboard.writeText(overlayAdresse(typ, id));
      setKopiert(id);
      window.setTimeout(() => setKopiert(''), 1800);
    } catch { /* ohne Zwischenablage bleibt die Adresse im Baukasten */ }
  }

  async function loeschen(z: Zeile) {
    if (!z.overlay) return;
    if (!window.confirm(t('Dieses Overlay wirklich löschen? Die Adresse in OBS zeigt danach nichts mehr.'))) return;
    await fetch('/api/overlay-config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: z.overlay.id, loeschen: true }),
    }).catch(() => {});
    laden();
  }

  /** Eine gespeicherte Tierlist entfernen - nach Rueckfrage, die nennt, was verschwindet. */
  async function loeschenTier(z: Zeile) {
    const tl = z.tierlist;
    if (!tl) return;
    if (!window.confirm(t('Diese Tierlist wirklich löschen?') + `\n\n${z.titel} · ${tl.spieler} ${t('Einträge')}, ${tl.eingestuft} ${t('eingestuft')}\n${t('Das lässt sich nicht rückgängig machen.')}`)) return;
    try {
      // Frisch holen: geloescht wird aus dem Stand, wie er jetzt auf dem Konto liegt, nicht aus dem, den diese Seite vor einer Weile gesehen hat.
      const j = await (await fetch('/api/tierlists', { cache: 'no-store' })).json() as { lists?: Array<{ listId: string }>; currentListId?: string | null };
      const rest = (j.lists ?? []).filter((l) => l.listId !== tl.id);
      await fetch('/api/tierlists', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lists: rest, currentListId: j.currentListId === tl.id ? (rest[0]?.listId ?? null) : (j.currentListId ?? null), absichtlich: true }),
      });
    } catch { /* der Abschnitt laedt unten neu und zeigt, was wirklich noch da ist */ }
    laden();
  }

  const Abschnitt = ({ titel, zeilen, leer, geladen, kopfLink }: {
    titel: string; zeilen: Zeile[]; leer: React.ReactNode; geladen: boolean;
    kopfLink?: { href: string; text: string };
  }) => (
    <div>
      <div className="flex items-baseline gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400"><T>{titel}</T></h3>
        {geladen && <span className="text-[11px] text-slate-600">{zeilen.length}</span>}
        {kopfLink && (
          <Link href={kopfLink.href} className="ml-auto text-[11px] text-slate-500 transition hover:text-sky-400">
            <T>{kopfLink.text}</T> →
          </Link>
        )}
      </div>
      {!geladen ? (
        <p className="mt-2 text-xs text-slate-600"><T>Wird geladen …</T></p>
      ) : zeilen.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{leer}</p>
      ) : (
        <div className="mt-2 max-h-72 divide-y divide-zinc-900 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/30">
          {zeilen.map((z) => (
            <div key={z.schluessel} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-200">{z.titel}</p>
                <p className="text-[11px] text-slate-500">
                  {z.zusatz}{z.datum ? ` · ${DATUM.format(new Date(z.datum))}` : ''}
                </p>
              </div>
              {z.overlay && (
                <button type="button" onClick={() => void kopieren(z.overlay!.typ, z.overlay!.id)}
                  title={t('Adresse für OBS kopieren')}
                  className="rounded-md border border-zinc-700 px-2.5 py-1 text-[11px] text-slate-400 transition
                             hover:border-sky-500 hover:text-sky-400">
                  {kopiert === z.overlay.id ? <T>Kopiert</T> : <T>OBS-Adresse</T>}
                </button>
              )}
              <Link href={z.oeffnen.href}
                className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold
                           text-sky-400 transition hover:bg-sky-500/20">
                <T>{z.oeffnen.text}</T>
              </Link>
              {(z.overlay || z.tierlist) && (
                <button type="button" onClick={() => void (z.overlay ? loeschen(z) : loeschenTier(z))} title={t('Löschen')}
                  className="rounded-md border border-zinc-700 px-2.5 py-1 text-[11px] text-slate-400 transition hover:border-rose-500 hover:text-rose-400">
                  <T>Löschen</T>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <section id="archiv" className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-slate-100"><T>Mein Archiv</T></h2>
        <span className="text-xs text-slate-500"><T>sichtbar nur für dich</T></span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        <T>Alles, was du gespeichert hast, an einer Stelle — zum Öffnen, Bearbeiten und Wiederverwenden.</T>
      </p>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <Abschnitt titel="Overlays" geladen={overlays !== null} zeilen={overlayZeilen}
          kopfLink={{ href: '/overlays', text: 'Neues Overlay' }}
          leer={<T>Noch kein Overlay gespeichert. In einem der Baukästen unter Overlays auf „Anlegen“ drücken — danach steht es hier.</T>} />
        <Abschnitt titel="Tierlists" geladen={tierlists !== null} zeilen={tierZeilen}
          kopfLink={{ href: '/tierlist', text: 'Zur Tierlist' }}
          leer={<T>Noch keine Tierlist gespeichert. Sobald du in der Tierlist Spieler einstufst, speichert sie sich auf deinem Konto und steht hier.</T>} />
      </div>

      {prognose && (
        <div className="mt-6">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400"><T>Prognose</T></h3>
          <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-200"><T>Meine Globals-Prognose</T></p>
              <p className="text-[11px] text-slate-500"><T>Deine eigene Prognose zur Global Championship</T></p>
            </div>
            <Link href="/globals/predictions"
              className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-400 transition hover:bg-sky-500/20">
              <T>Öffnen</T>
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
