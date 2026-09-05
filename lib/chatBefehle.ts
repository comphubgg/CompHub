import { alleChatNutzer, loeseNamenAuf, type ChatNutzer } from './chatNutzer';
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

/*
 * Die Befehlsausgabe ist englisch, und zwar durchgehend.
 *
 * Sie entsteht auf dem Server und traegt Namen in sich - durch das
 * Woerterbuch, das ganze Saetze nachschlaegt, kaeme sie nie. Uebrig blieben
 * zwei Wege: Bausteine verschicken und im Browser zusammensetzen, oder eine
 * Sprache waehlen. Fuer eine Konsole, die nur der Betreiber sieht, ist das
 * Zweite ehrlicher - und er liest das Werkzeug ohnehin auf Englisch.
 */
const HILFE = [
  'Commands in this conversation:',
  '',
  '  /help             this list',
  '  /close            close the conversation as done',
  '  /open             reopen it',
  '  /who              who is in this conversation',
  '  /users <search>   search accounts (no search: the last 20)',
  '  /add <name>       add someone (several names work)',
  '  /remove <name>    take someone out again',
  '  /new <name> ...   new conversation with one or more people',
].join('\n');

/**
 * Jemanden anhand des Namens finden.
 *
 * Dieselbe Liste, die auch das Vorschlagsfenster ueber dem Schreibfeld
 * benutzt - Konten und alte Zugangsschluessel zusammen. Frueher waren es
 * zwei verschiedene, und was vorgeschlagen wurde, liess sich anschliessend
 * nicht hinzufuegen.
 */
async function sucheKonten(begriff: string): Promise<ChatNutzer[]> {
  const k = begriff.trim().replace(/^@+/, '').toLowerCase();
  const liste = await alleChatNutzer();
  if (!k) return liste.slice(0, 20);
  return liste.filter((x) => x.name.toLowerCase().includes(k));
}

/** Wie jemand in einer Liste dasteht. */
function zeile(k: { name?: string | null; rolle?: string | null }) {
  // Adressen stehen hier bewusst nicht: die Liste gibt sie nicht heraus, und
  // im Chat sucht man ohnehin nach dem Namen, den man kennt.
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
    return { hinweis: 'Conversation closed.', neuLaden: true };
  }

  if (befehl === 'open') {
    await aendere(gespraechId, { erledigt: false });
    return { hinweis: 'Conversation reopened.', neuLaden: true };
  }

  if (['nutzer', 'users', 'konten'].includes(befehl)) {
    const treffer = await sucheKonten(argument);
    if (!treffer.length) return { hinweis: `No account matches "${argument}".` };
    const kopf = argument
      ? `${treffer.length} match "${argument}":`
      : `The last ${treffer.length} accounts:`;
    return { hinweis: [kopf, '', ...treffer.slice(0, 40).map(zeile)].join('\n') };
  }

  // Die Hilfe nennt /who, gehandhabt wurde bisher nur /wer - wer der Liste
  // folgte, bekam "I do not know". Beide gelten.
  if (['wer', 'who'].includes(befehl)) {
    const m = (await alle()).find((x) => x.id === gespraechId);
    if (!m) return { hinweis: 'That conversation no longer exists.' };
    const leute = await alleChatNutzer();
    const namen = (m.teilnehmer ?? []).map((id) => {
      // Auch die alten Zugaenge nachschlagen - sonst stand dort eine nackte
      // Kennung "vip:gulli" statt eines Namens.
      const k = leute.find((x) => x.id === id);
      return `  ${k?.name || id}`;
    });
    return {
      hinweis: [
        `Started by: ${m.vonName || '—'}`,
        namen.length ? 'Added later:' : 'Nobody else is in it.',
        ...namen,
      ].join('\n'),
    };
  }

  if (['add', 'hinzu'].includes(befehl)) {
    if (!argument) {
      const treffer = await sucheKonten('');
      return {
        hinweis: ['Who? Like this:  /add <name>', '',
          'To choose from (the last 20):', '',
          ...treffer.map(zeile)].join('\n'),
      };
    }
    return await teilnehmerAendern(gespraechId, argument, true);
  }

  if (['remove', 'raus'].includes(befehl)) {
    if (!argument) return { hinweis: 'Who? Like this:  /remove <name>' };
    return await teilnehmerAendern(gespraechId, argument, false);
  }

  if (['neu', 'new', 'gruppe'].includes(befehl)) {
    if (!argument) {
      return { hinweis: 'Like this:  /new <name> [name …]  — starts a conversation with these people.' };
    }
    return await neuesGespraech(argument);
  }

  return { hinweis: `I do not know "/${befehl}". /help shows the list.` };
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
  if (!m) return { hinweis: 'That conversation no longer exists.' };

  const { gefunden, meldungen } = await loeseNamenAuf(argument);
  if (!gefunden.length) return { hinweis: meldungen.join('\n') };

  const bisher = new Set(m.teilnehmer ?? []);
  const namen: string[] = [];
  for (const k of gefunden) {
    if (k.id === m.vonId) { meldungen.push(`${k.name} started this conversation.`); continue; }
    if (dazu) { bisher.add(k.id); } else { bisher.delete(k.id); }
    namen.push(k.name || k.id);
  }

  if (!namen.length) return { hinweis: meldungen.join('\n') };
  await setzeTeilnehmer(gespraechId, [...bisher]);

  return {
    // Was ging und was nicht, in einer Meldung - zwei getrennte Zeilen
    // haetten bedeutet, dass eine davon uebersehen wird.
    hinweis: [
      dazu ? `Added: ${namen.join(', ')}` : `Removed: ${namen.join(', ')}`,
      ...meldungen,
    ].join('\n'),
    neuLaden: true,
  };
}

/** Ein neues Gespraech mit mehreren Leuten. */
async function neuesGespraech(argument: string): Promise<BefehlsErgebnis> {
  const { gefunden, meldungen } = await loeseNamenAuf(argument);
  if (!gefunden.length) return { hinweis: meldungen.join('\n') };

  const [erster, ...weitere] = gefunden;
  const m: Meldung = await lege({
    thema: 'anderes',
    eigenesThema: gefunden.length > 1
      ? `Group: ${gefunden.map((k) => k.name).join(', ')}`
      : `Message to ${erster.name}`,
    text: 'CompHub started this conversation.',
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
      `Conversation created with ${gefunden.map((k) => k.name).join(', ')}.`,
      'It is now at the top of the list.',
      ...meldungen,
    ].join('\n'),
    neuLaden: true,
  };
}
