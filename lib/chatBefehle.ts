import { alleKonten } from './konten';
import {
  alle, aendere, lege, setzeTeilnehmer, type Meldung,
} from './kontakt';

/*
 * Befehle im Gespraech - nur fuer den Betreiber.
 *
 * Der Betreiber wollte den Chat auch bedienen koennen, ohne durch Menues zu
 * gehen: "wenn ich als Admin schreibe /commands, bekomme ich zum Beispiel
 * /close, dann tue ich das Ticket schliessen; mit /add werden mir alle User
 * angezeigt, dann kann ich die zum Chat hinzufuegen".
 *
 * Warum als Text und nicht als Knoepfe: er tippt ohnehin gerade. Ein Knopf
 * mehr am Rand haette bedeutet, die Hand vom Schreiben zu nehmen - und fuer
 * Sachen, die einmal am Tag vorkommen, ist eine Zeile schneller als eine
 * Leiste, die immer da ist.
 *
 * Antworten, die nur ihn angehen (eine Nutzerliste etwa), landen nicht im
 * Verlauf: der Gegenueber muss nicht sehen, dass jemand eine Liste abgerufen
 * hat. Nur was das Gespraech wirklich veraendert, wird als Nachricht
 * festgehalten.
 */

/** Was ein Befehl zurueckgibt. */
export interface BefehlsErgebnis {
  /** Nur fuer den Betreiber, nicht im Verlauf. */
  hinweis?: string;
  /** Kommt als Nachricht ins Gespraech - alle sehen es. */
  imVerlauf?: string;
  /** Das Gespraech hat sich geaendert und gehoert neu geladen. */
  neuLaden?: boolean;
  /** Kein Befehl - der Text geht als gewoehnliche Nachricht hinaus. */
  keinBefehl?: boolean;
}

const HILFE = [
  'Befehle im Gespräch:',
  '',
  '  /hilfe            diese Liste',
  '  /close            Gespräch als erledigt schließen',
  '  /open             wieder öffnen',
  '  /wer              wer in diesem Gespräch ist',
  '  /nutzer <suche>   Konten suchen (ohne Suche: die letzten 20)',
  '  /add <name>       jemanden hinzufügen (mehrere Namen möglich)',
  '  /remove <name>    jemanden wieder herausnehmen',
  '  /neu <name> …     neues Gespräch mit einem oder mehreren',
].join('\n');

/** Ein Konto anhand von Name oder Adresse finden. */
async function sucheKonten(begriff: string) {
  const k = begriff.trim().toLowerCase();
  const liste = await alleKonten();
  if (!k) return liste.slice(0, 20);
  return liste.filter((x) => String(x.name ?? '').toLowerCase().includes(k));
}

/** Wie ein Konto in einer Liste dasteht. */
function zeile(k: { name?: string | null; rolle?: string | null }) {
  // Adressen stehen hier bewusst nicht: alleKonten() gibt sie nicht heraus,
  // und im Chat sucht man ohnehin nach dem Namen, den man kennt.
  const rolle = k.rolle ? ` (${k.rolle})` : '';
  return `  ${k.name || '—'}${rolle}`;
}

/**
 * Einen Befehl ausfuehren.
 *
 * Gibt `keinBefehl` zurueck, wenn der Text gar keiner ist - dann geht er
 * unveraendert als Nachricht hinaus. Ein Schraegstrich am Zeilenanfang ist
 * schliesslich auch ein zulaessiger Satzanfang.
 */
export async function fuehreAus(
  gespraechId: string, text: string,
): Promise<BefehlsErgebnis> {
  const roh = text.trim();
  if (!roh.startsWith('/')) return { keinBefehl: true };

  const [wort, ...rest] = roh.slice(1).split(/\s+/);
  const befehl = wort.toLowerCase();
  const argument = rest.join(' ').trim();

  if (['hilfe', 'help', 'commands', 'befehle', '?'].includes(befehl)) {
    return { hinweis: HILFE };
  }

  if (befehl === 'close') {
    await aendere(gespraechId, { erledigt: true });
    return { imVerlauf: 'Gespräch geschlossen.', neuLaden: true };
  }

  if (befehl === 'open') {
    await aendere(gespraechId, { erledigt: false });
    return { imVerlauf: 'Gespräch wieder geöffnet.', neuLaden: true };
  }

  if (['nutzer', 'users', 'konten'].includes(befehl)) {
    const treffer = await sucheKonten(argument);
    if (!treffer.length) return { hinweis: `Kein Konto passt zu „${argument}".` };
    const kopf = argument
      ? `${treffer.length} Treffer für „${argument}":`
      : `Die letzten ${treffer.length} Konten:`;
    return { hinweis: [kopf, '', ...treffer.slice(0, 40).map(zeile)].join('\n') };
  }

  if (befehl === 'wer') {
    const m = (await alle()).find((x) => x.id === gespraechId);
    if (!m) return { hinweis: 'Dieses Gespräch gibt es nicht mehr.' };
    const konten = await alleKonten();
    const namen = (m.teilnehmer ?? [])
      .map((id) => konten.find((k) => k.id === id))
      .filter(Boolean)
      .map((k) => `  ${k!.name || k!.id}`);
    return {
      hinweis: [
        `Begonnen von: ${m.vonName || '—'}`,
        namen.length ? 'Dazugekommen:' : 'Sonst niemand dabei.',
        ...namen,
      ].join('\n'),
    };
  }

  if (['add', 'hinzu'].includes(befehl)) {
    if (!argument) {
      const treffer = await sucheKonten('');
      return {
        hinweis: ['Wen? So:  /add <name>', '',
          'Zur Auswahl (die letzten 20):', '',
          ...treffer.map(zeile)].join('\n'),
      };
    }
    return await teilnehmerAendern(gespraechId, argument, true);
  }

  if (['remove', 'raus'].includes(befehl)) {
    if (!argument) return { hinweis: 'Wen? So:  /remove <name>' };
    return await teilnehmerAendern(gespraechId, argument, false);
  }

  if (['neu', 'new', 'gruppe'].includes(befehl)) {
    if (!argument) {
      return { hinweis: 'So:  /neu <name> [name …]  — legt ein Gespräch mit diesen Leuten an.' };
    }
    return await neuesGespraech(argument);
  }

  return { hinweis: `„/${befehl}" kenne ich nicht. /hilfe zeigt die Liste.` };
}

/**
 * Leute hinzufuegen oder herausnehmen.
 *
 * Mehrere Namen auf einmal, durch Leerzeichen oder Komma getrennt: wer eine
 * Gruppe aufmacht, will nicht viermal dasselbe tippen. Namen, die auf mehrere
 * Konten passen, werden benannt statt geraten - ein falsch hinzugefuegter
 * Mitleser saehe den ganzen bisherigen Verlauf.
 */
async function teilnehmerAendern(
  gespraechId: string, argument: string, dazu: boolean,
): Promise<BefehlsErgebnis> {
  const m = (await alle()).find((x) => x.id === gespraechId);
  if (!m) return { hinweis: 'Dieses Gespräch gibt es nicht mehr.' };

  const { gefunden, meldungen } = await loeseNamenAuf(argument);
  if (!gefunden.length) return { hinweis: meldungen.join('\n') };

  const bisher = new Set(m.teilnehmer ?? []);
  const namen: string[] = [];
  for (const k of gefunden) {
    if (k.id === m.vonId) { meldungen.push(`${k.name} hat das Gespräch begonnen.`); continue; }
    if (dazu) { bisher.add(k.id); } else { bisher.delete(k.id); }
    namen.push(k.name || k.id);
  }

  if (!namen.length) return { hinweis: meldungen.join('\n') };
  await setzeTeilnehmer(gespraechId, [...bisher]);

  return {
    imVerlauf: dazu
      ? `${namen.join(', ')} ${namen.length > 1 ? 'sind' : 'ist'} jetzt dabei.`
      : `${namen.join(', ')} ${namen.length > 1 ? 'sind' : 'ist'} nicht mehr dabei.`,
    hinweis: meldungen.length ? meldungen.join('\n') : undefined,
    neuLaden: true,
  };
}

/** Namen zu Konten aufloesen und sagen, was nicht ging. */
async function loeseNamenAuf(argument: string) {
  const teile = argument.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
  const konten = await alleKonten();
  const gefunden: Array<{ id: string; name?: string | null }> = [];
  const meldungen: string[] = [];

  for (const t of teile) {
    const k = t.toLowerCase();
    const genau = konten.filter((x) => String(x.name ?? '').toLowerCase() === k);
    const treffer = genau.length ? genau : konten.filter((x) =>
      String(x.name ?? '').toLowerCase().includes(k));

    if (!treffer.length) { meldungen.push(`Kein Konto passt zu „${t}".`); continue; }
    if (treffer.length > 1) {
      meldungen.push(`„${t}" passt auf mehrere: ${treffer.slice(0, 6).map((x) => x.name).join(', ')}`);
      continue;
    }
    gefunden.push(treffer[0]);
  }
  return { gefunden, meldungen };
}

/** Ein neues Gespraech mit mehreren Leuten. */
async function neuesGespraech(argument: string): Promise<BefehlsErgebnis> {
  const { gefunden, meldungen } = await loeseNamenAuf(argument);
  if (!gefunden.length) return { hinweis: meldungen.join('\n') };

  const [erster, ...weitere] = gefunden;
  const m: Meldung = await lege({
    thema: 'anderes',
    eigenesThema: gefunden.length > 1
      ? `Gruppe: ${gefunden.map((k) => k.name).join(', ')}`
      : `Nachricht an ${erster.name}`,
    text: 'Der Betreiber hat dieses Gespräch begonnen.',
    bilder: [],
    vonId: erster.id,
    vonName: erster.name ?? '',
    vonEmail: '',
  });

  if (weitere.length) {
    await setzeTeilnehmer(m.id, weitere.map((k) => k.id));
  }

  return {
    hinweis: [
      `Gespräch angelegt mit ${gefunden.map((k) => k.name).join(', ')}.`,
      'Es steht jetzt oben in der Liste.',
      ...meldungen,
    ].join('\n'),
    neuLaden: true,
  };
}
