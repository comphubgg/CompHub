/** Die Regionen, in denen FNCS Solos gespielt wird - Europa kommt von Noble (mit Karten), die anderen aus Epics Bestenlisten. Ohne Serverteile, damit auch die Seite sie lesen darf. */
export const SOLOS_REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'] as const;
export type SolosRegion = (typeof SOLOS_REGIONEN)[number];
