import { useState } from 'react';
import { Link } from 'react-router-dom';
import MatchFinder from '../../comp/MatchFinder';
import { knopfLeise } from '../teile';

/*
 * Alle Epic-Freunde (main: /match-finder?ansicht=freunde, im Dashboard "Nur hier" fuer den Admin): der Match-ID-Finder des Hubs
 * (src/seiten/comp/MatchFinder.tsx) mit seinem Reiter "All friends (admin)" - beide Epic-Konten live mit Match-ID, dazu die Freigaben.
 * Hier im Admin-Bereich steht er gleich auf diesem Reiter; der Finder liest die Ansicht beim ersten Zeichnen aus der Adresse.
 */
export default function AlleEpicFreunde({ klassisch }: { klassisch?: () => void }) {
  useState(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get('ansicht') !== 'freunde') { u.searchParams.set('ansicht', 'freunde'); window.history.replaceState(window.history.state, '', u.toString()); }
    return true;
  });
  return (
    <div>
      <div className="mb-2 flex flex-wrap justify-end gap-2">
        <Link to="/competitive/match-finder?ansicht=freunde" className={knopfLeise}>Open in Competitive ↗</Link>
        {klassisch && <button type="button" onClick={klassisch} className={knopfLeise} title="The original page of thecomphub.com, inside the hub">Classic view</button>}
      </div>
      <MatchFinder />
    </div>
  );
}
