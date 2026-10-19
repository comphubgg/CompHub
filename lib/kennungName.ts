/*
 * Eine Konto-Id ist kein Name.
 *
 * In der Spielerliste der Szene-Quelle (data/szene-quelle/spielerliste.json) steht bei 376 von ueber 4000 Konten statt eines Namens
 * die Konto-Id selbst. Wer die Liste ungeprueft als Namensquelle nimmt, zeigt dann auf Karten, in Bestenlisten und Posts 32 Zeichen
 * Hex - der Betreiber (19.10.2026): "Namen, die als lange Zahlen dastehen, musst du finden und ueberall richtig machen." Jeder, der
 * aus dieser Liste einen Namen liest, fragt deshalb zuerst hier; ohne Namen greift die naechste Quelle (Profil, Epic-Name).
 */
export function istKennungName(name: unknown, id?: unknown): boolean {
  const n = String(name ?? '').trim();
  if (!n) return false;
  if (/^[0-9a-f]{32}$/i.test(n.replace(/-/g, ''))) return true;
  const k = String(id ?? '').trim().toLowerCase().replace(/-/g, '');
  return Boolean(k) && (n.toLowerCase() === k || (n.length === 8 && k.startsWith(n.toLowerCase())));
}

/**
 * Fertige Antworten, die vor der Korrektur gerechnet wurden, tragen die Id noch als Anzeigenamen.
 * Statt auf die naechste Berechnung zu warten, wird beim Lesen ersetzt: durch den Namen der Zeile, sonst durch den ersten bekannten.
 * Aendert nur Objekte, deren "anzeige" eine Kennung ist; alles andere bleibt, wie es ist.
 */
export function kennungNamenErsetzen(wert: unknown, tiefe = 0): void {
  if (!wert || typeof wert !== 'object' || tiefe > 8) return;
  if (Array.isArray(wert)) { for (const x of wert) kennungNamenErsetzen(x, tiefe + 1); return; }
  const o = wert as Record<string, unknown>;
  if (typeof o.anzeige === 'string' && istKennungName(o.anzeige, o.epicId ?? o.id)) {
    const echt = [o.name, ...(Array.isArray(o.namen) ? o.namen : [])]
      .find((n) => typeof n === 'string' && n.trim() && !istKennungName(n, o.epicId ?? o.id));
    if (echt) o.anzeige = echt;
  }
  for (const v of Object.values(o)) if (v && typeof v === 'object') kennungNamenErsetzen(v, tiefe + 1);
}
