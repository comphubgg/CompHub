import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Welche Flaggen liegen im Ordner?
//
// Die Auswahl im Stift-Fenster soll genau die Flaggen anbieten, die es
// tatsaechlich gibt. Eine fest eingetragene Liste im Code waere schon beim
// naechsten hinzugefuegten Bild veraltet und wuerde Kuerzel anbieten, hinter
// denen keine Datei steckt - im Ergebnis ein leeres Rechteck.
//
//   GET -> { flaggen: ["ar", "at", …] }

const ORDNER = path.join(process.cwd(), 'public', 'flags');

export async function GET() {
  try {
    const dateien = await fs.readdir(ORDNER);
    const flaggen = dateien
      .filter((d) => d.toLowerCase().endsWith('.png'))
      .map((d) => d.slice(0, -4))
      // Nur echte Laenderkuerzel: der Globus ist ein Platzhalter, kein Land.
      .filter((k) => /^[a-z]{2}$/.test(k))
      .sort();
    return NextResponse.json({ flaggen });
  } catch {
    return NextResponse.json({ flaggen: [] });
  }
}
