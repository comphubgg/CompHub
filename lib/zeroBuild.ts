/**
 * Ob ein Spieltag Zero Build ist (Fenster-Id wie "S43_ReloadZBDuosCashCup_Event1Round1_ME"). Dort gibt es keine Materialien: gefarmte Mats sind 0 wie bei
 * Osirion, auch wenn der Leser beim Abbauen etwas meldet (Betreiber, 8.11.2026: "Material Farmed ... musst du 0 machen bei Zero Build").
 */
export const istZeroBuild = (fensterId: string | null | undefined): boolean => /(^|_)(ZB|ZeroBuild|NoBuild)|ZB(Duos|Trios|Squads|Solo|Cash)/i.test(fensterId ?? '');
