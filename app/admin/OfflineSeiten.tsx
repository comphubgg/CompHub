'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';

/*
 * Die Seiten, die gerade nicht online sind.
 *
 * Der Betreiber (10.10.2026): die Globals-VIP-Seite soll offline gehen koennen, "nicht geloescht,
 * nur offline fuer die VIPs", und im Admin-Bereich soll es eine Stelle geben, "wo ich als Admin
 * die Offline-Seiten sehe". Wieder online geht eine Seite nur auf sein Wort: es gibt hier
 * bewusst keinen Knopf dafuer, der Schalter liegt allein unter /admin/sections.
 *
 * Gelesen wird, was die Sperre ohnehin kennt (/api/sektionen). Der Admin sieht jede Seite in
 * jedem Zustand und kann sie hier oeffnen und weiterbauen; fuer alle anderen ist sie weg.
 */

interface Sektion { schluessel: string; pfad: string; titel: string }
interface Stand { zustand: 'online' | 'standby' | 'offline' }

const NAME = {
  offline: { titel: 'Offline', was: 'Für alle außer dir verschwunden.', punkt: 'bg-rose-500' },
  standby: { titel: 'Standby', was: 'Sichtbar, aber gesperrt: Besucher lesen einen Hinweis.', punkt: 'bg-amber-400' },
} as const;

export default function OfflineSeiten() {
  const [liste, setListe] = useState<Array<{ s: Sektion; zustand: 'offline' | 'standby' }> | null>(null);
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    let weg = false;
    fetch('/api/sektionen', { cache: 'no-store' }).then((r) => r.json())
      .then((j: { sektionen?: Sektion[]; staende?: Record<string, Stand> }) => {
        if (weg) return;
        const raus: Array<{ s: Sektion; zustand: 'offline' | 'standby' }> = [];
        for (const s of j.sektionen ?? []) {
          const z = j.staende?.[s.schluessel]?.zustand;
          if (z === 'offline' || z === 'standby') raus.push({ s, zustand: z });
        }
        setListe(raus);
      })
      .catch(() => { if (!weg) setFehler(true); });
    return () => { weg = true; };
  }, []);

  if (fehler) {
    return <p className="text-xs text-rose-300"><T>Der Zustand der Seiten ließ sich gerade nicht abrufen.</T></p>;
  }
  if (!liste) return <p className="text-xs text-slate-500"><T>Wird geladen …</T></p>;
  if (!liste.length) {
    return <p className="text-xs text-emerald-400"><T>Alle Seiten sind online.</T></p>;
  }
  return (
    <div className="space-y-2">
      {liste.map(({ s, zustand }) => (
        <div key={s.schluessel} className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5">
          <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${NAME[zustand].punkt}`} />
          <span className="text-sm font-semibold text-slate-100"><T>{s.titel}</T></span>
          <code className="font-mono text-[10px] text-slate-600">{s.pfad}</code>
          <span className="text-[11px] text-slate-500"><T>{NAME[zustand].titel}</T> · <T>{NAME[zustand].was}</T></span>
          <Link href={s.pfad} className="ml-auto text-xs text-sky-400 transition hover:text-sky-300"><T>Ansehen</T></Link>
        </div>
      ))}
      <p className="text-[11px] text-slate-600">
        <T>Wieder online geht eine Seite nur, wenn du es sagst. Der Schalter liegt unter Bereiche ein- und ausschalten.</T>
      </p>
    </div>
  );
}
