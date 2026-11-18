'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useZugang } from '@/app/lib/zugang';
import { ergaenzeEnglisch } from '@/app/lib/sprache';
import { ADMIN_AUF_ENGLISCH } from '@/app/lib/spracheAdmin';
import AdminSeitenleiste from './AdminSeitenleiste';

// Die Admin-Texte werden erst hier geladen, nicht fuer alle Besucher. Das
// Eintragen laeuft beim Laden des Moduls - auf dem Server und im Browser vor
// dem ersten Zeichnen -, damit beide Seiten dasselbe liefern.
ergaenzeEnglisch(ADMIN_AUF_ENGLISCH);

/*
 * Der Rahmen um alle Admin-Seiten (Betreiber, 14.10.2026: "du hast fuer den Admin gar nichts geaendert ... Posts, Maps ... alles anpassen, auch fuer den
 * Admin"). Zwei Dinge fuer jede Seite unter /admin: links die Seitenleiste mit allen Werkzeugen (AdminSeitenleiste, seit 18.11.2026 statt der Kapsel-Leiste
 * oben, die ueberlief) und die gemeinsame Feinarbeit in design.css (.admin-neu: Eingabefelder, Knoepfe, Tafeln, Hintergrund).
 *
 * Die Leiste sieht nur der Admin; ein Manager oder Besucher bekommt die Seite ohne sie (ein gesperrter Bereich taucht fuer andere nicht auf).
 * Waehrend die Rechte noch geladen werden, haelt ein leerer Platz die Breite frei - aber nur, wenn in diesem Browser zuletzt der Admin hier war, sonst
 * spraenge der Inhalt nach dem Laden zur Seite. Namen stehen darin keine.
 */

const WAR_ADMIN = 'comphub-admin-leiste-war';

export default function AdminRahmen({ children }: { children: ReactNode }) {
  const zugang = useZugang();
  const [platzhalter, setPlatzhalter] = useState(false);
  useEffect(() => { try { setPlatzhalter(localStorage.getItem(WAR_ADMIN) === '1'); } catch { /* ohne Speicher */ } }, []);
  useEffect(() => {
    if (zugang.laedt) return;
    try { localStorage.setItem(WAR_ADMIN, zugang.admin ? '1' : '0'); } catch { /* egal */ }
  }, [zugang.laedt, zugang.admin]);

  // Die Leiste klebt unter der Kopfzeile - deren Hoehe gemessen statt geraten (sie bricht je nach Breite und Sprache anders um).
  useEffect(() => {
    const kopf = document.querySelector<HTMLElement>('header.kopf');
    if (!kopf) return undefined;
    const setze = () => document.documentElement.style.setProperty('--admin-kopf', `${kopf.offsetHeight}px`);
    setze();
    const beobachter = new ResizeObserver(setze);
    beobachter.observe(kopf);
    return () => beobachter.disconnect();
  }, []);

  const leiste = !zugang.laedt && zugang.admin;
  return (
    <div className="admin-neu bg-zinc-950 lg:flex lg:items-start">
      {leiste && <AdminSeitenleiste />}
      {zugang.laedt && platzhalter && <div aria-hidden className="hidden w-64 shrink-0 lg:block" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
