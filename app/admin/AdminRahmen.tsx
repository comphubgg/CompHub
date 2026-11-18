'use client';

import type { ReactNode } from 'react';
import { useZugang } from '@/app/lib/zugang';
import { ergaenzeEnglisch } from '@/app/lib/sprache';
import { ADMIN_AUF_ENGLISCH } from '@/app/lib/spracheAdmin';
import AdminLeiste from './AdminLeiste';

// Die Admin-Texte werden erst hier geladen, nicht fuer alle Besucher. Das
// Eintragen laeuft beim Laden des Moduls - auf dem Server und im Browser vor
// dem ersten Zeichnen -, damit beide Seiten dasselbe liefern.
ergaenzeEnglisch(ADMIN_AUF_ENGLISCH);

/*
 * Der Rahmen um alle Admin-Seiten (Betreiber, 14.10.2026: "du hast fuer den Admin gar nichts geaendert ... Posts, Maps ... alles anpassen, auch fuer den
 * Admin"). Zwei Dinge fuer jede Seite unter /admin: oben die Leiste mit allen Werkzeugen als Kapseln (AdminLeiste - seit 18.11.2026 umbrechend, damit
 * jedes Werkzeug zu sehen ist) und die gemeinsame Feinarbeit in design.css (.admin-neu: Eingabefelder, Knoepfe, Tafeln, Hintergrund).
 *
 * Die Leiste sieht nur der Admin; ein Manager oder Besucher bekommt die Seite ohne sie (ein gesperrter Bereich taucht fuer andere nicht auf).
 */

export default function AdminRahmen({ children }: { children: ReactNode }) {
  const zugang = useZugang();
  return (
    <div className="admin-neu bg-zinc-950">
      {!zugang.laedt && zugang.admin && <AdminLeiste />}
      {children}
    </div>
  );
}
