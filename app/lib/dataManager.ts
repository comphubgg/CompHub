import { promises as fs } from 'fs';
import path from 'path';
import { t } from "@/app/lib/i18n";
import { DATEN_ORT } from '@/lib/datenOrt';

const DATA_DIR = path.join(DATEN_ORT);

// Stelle sicher, dass das Datenverzeichnis existiert
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

/**
 * Liest eine JSON-Datei aus dem data-Verzeichnis
 */
export async function readDataFile<T>(filename: string): Promise<T> {
  try {
    await ensureDataDir();
    const filePath = path.join(DATA_DIR, filename);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    console.error(`Error reading ${filename}:`, error);
    throw new Error(`Failed to read ${filename}`);
  }
}

/**
 * Schreibt eine JSON-Datei in das data-Verzeichnis (persistiert Änderungen)
 */
export async function writeDataFile<T>(filename: string, data: T): Promise<void> {
  try {
    await ensureDataDir();
    const filePath = path.join(DATA_DIR, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log(`✓ Data saved: ${filename}`);
  } catch (error) {
    console.error(`Error writing ${filename}:`, error);
    throw new Error(`Failed to write ${filename}`);
  }
}

/**
 * Ändert ein Feld in einer Datei und speichert es
 */
export async function updateDataField<T extends Record<string, any>>(
  filename: string,
  key: string,
  value: any
): Promise<T> {
  const data = await readDataFile<T>(filename);
  (data as Record<string, any>)[key] = value;
  await writeDataFile(filename, data);
  return data;
}

/**
 * Fügt einen neuen Eintrag zu einem Array in einer Datei hinzu
 */
export async function addToArrayField<T extends Record<string, any>>(
  filename: string,
  arrayField: string,
  item: any
): Promise<T> {
  const data = await readDataFile<T>(filename);
  const arr = (data as Record<string, any>)[arrayField] as any[];
  if (!Array.isArray(arr)) {
    throw new Error(`${arrayField} is not an array in ${filename}`);
  }
  arr.push(item);
  await writeDataFile(filename, data);
  return data;
}

/**
 * Entfernt einen Eintrag aus einem Array in einer Datei
 */
export async function removeFromArrayField<T extends Record<string, any>>(
  filename: string,
  arrayField: string,
  predicate: (item: any) => boolean
): Promise<T> {
  const data = await readDataFile<T>(filename);
  const arr = (data as Record<string, any>)[arrayField] as any[];
  if (!Array.isArray(arr)) {
    throw new Error(`${arrayField} is not an array in ${filename}`);
  }
  const index = arr.findIndex(predicate);
  if (index > -1) {
    arr.splice(index, 1);
    await writeDataFile(filename, data);
  }
  return data;
}
