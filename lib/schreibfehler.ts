/**
 * Warum das Schreiben nicht ging - in einem Satz, den man lesen kann.
 *
 * Anlass: im Fensterprogramm liess sich keine Turnierkarte mehr sichern.
 * Auf der Seite stand nur "Speichern fehlgeschlagen", und das kann alles
 * heissen. Die Ursache war eine ganz gewoehnliche: das Programm war nach
 * "C:\Program Files" installiert, und dorthin darf ein Programm ohne
 * Administratorrechte nicht schreiben. Aus dem Quellbaum heraus ging alles,
 * weil der Ordner dem Nutzer gehoert.
 *
 * Ein Fehler, den niemand deuten kann, kostet einen Abend. Deshalb steht
 * hier, was los ist und was hilft.
 */
export function schreibGrund(fehler: unknown, ziel: string): string {
  const code = (fehler as { code?: string } | null)?.code ?? '';

  if (code === 'EACCES' || code === 'EPERM') {
    return `Kein Schreibrecht auf ${ziel}. Wenn CompHub unter "C:\Program `
      + `Files" installiert ist, darf es dort nichts ändern — bitte neu `
      + `installieren, der Installer legt es dann in deinen Benutzerordner.`;
  }
  if (code === 'ENOSPC') return `Kein Platz mehr auf dem Laufwerk von ${ziel}.`;
  if (code === 'EROFS') return `${ziel} liegt auf einem schreibgeschützten Laufwerk.`;
  if (code === 'EBUSY') return `${ziel} ist gerade von einem anderen Programm belegt.`;

  const text = fehler instanceof Error ? fehler.message : String(fehler);
  return `Schreiben nach ${ziel} ging nicht: ${text}`;
}
