'use client';

/*
 * Ob das Chatsymbol am Bildschirmrand steht.
 *
 * Das Gespraech selbst bleibt immer erreichbar - ausgeblendet wird nur der
 * Knopf, der ueber allem liegt. Wer gerade eine Turnierkarte baut oder einen
 * Stream nebenher laufen hat, will dort nichts Schwebendes am Rand haben; wer
 * auf eine Antwort wartet, schon.
 *
 * Abgelegt wird im Browser, nicht beim Konto. Das ist Absicht: es ist eine
 * Frage des Bildschirms, nicht der Person. Am grossen Monitor darf das Symbol
 * stehen, auf dem Telefon vielleicht nicht - und beides gleichzeitig ginge mit
 * einer Einstellung am Konto nicht.
 */

export const CHAT_HUD_SCHLUESSEL = 'comphub_chat_hud';

/** Wird ausgeloest, wenn sich die Einstellung aendert - auch im selben Tab. */
export const CHAT_HUD_EREIGNIS = 'comphub:chat-hud';

/**
 * Steht das Symbol am Rand?
 *
 * Gibt null zurueck, solange es sich nicht sagen laesst - auf dem Server und
 * im ersten Durchgang im Browser. Wer daraus sofort "ja" machte, bekaeme
 * entweder eine Abweichung beim Zusammenfuegen oder ein kurzes Aufblitzen des
 * Knopfes, den jemand ausdruecklich weghaben wollte.
 */
export function liesChatHud(): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(CHAT_HUD_SCHLUESSEL) !== 'aus';
  } catch {
    // Privates Fenster oder gesperrter Speicher: dann eben sichtbar.
    return true;
  }
}

/** Umstellen und alle offenen Stellen sofort mitziehen. */
export function setzeChatHud(an: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CHAT_HUD_SCHLUESSEL, an ? 'an' : 'aus');
  } catch { /* dann gilt es nur bis zum Neuladen */ }
  window.dispatchEvent(new CustomEvent(CHAT_HUD_EREIGNIS, { detail: an }));
}
