/* Typen zu spielerFlagge.mjs (main: reines JS, dort mit allowJs). */
export const LAND_QUELLEN: string[];
export const unbekannteGeoTokens: Set<string>;
export function landAusGeoToken(token: string | null | undefined): string | null;
export function flaggeZeichen(code: string | null | undefined): string;
export function regionVon(roh: string | null | undefined): string;
export function regionZeichen(region: string | null | undefined): string;
export function landPasst(land: string | null | undefined, region: string | null | undefined): boolean;
export function landNorm(roh: string | null | undefined): string | null;
export function landWaehlen(quellen: Record<string, string | null | undefined>, region: string | null | undefined, melde?: (quelle: string, land: string) => void): { land: string; quelle: string } | null;
export function flaggeOderRegion(land: string | null | undefined, region: string | null | undefined): string;
