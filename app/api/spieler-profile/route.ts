import { NextResponse } from 'next/server';
import { wirfWeg } from '@/lib/antwortSpeicher';
import fs from '@/lib/ablageFs';
import path from 'path';
import { namensSchluessel } from '@/lib/homoglyph';
import { DATEN_ORT } from '@/lib/datenOrt';

// Herkunftsland, X-Konto und Anzeigename je Spieler - von Hand gepflegt.
//
// Der Schluessel ist die Epic-Konto-ID, nicht der Name: Namen sind nicht
// eindeutig. "FocusHD yhyh" und "Th0masHD yhyh" enden beide auf "yhyh" und
// bekaemen sonst denselben Eintrag - beim Pflegen des einen aenderte sich
// stillschweigend auch der andere.
//
// Damit aeltere Eintraege und Faelle ohne bekannte ID weiter funktionieren,
// laesst sich zusaetzlich ueber die beobachteten Namen suchen.
//
// Bewusst ohne automatische Quelle fuer die Laender: die vorhandene Rangliste
// fuehrt Kuerzel, die nachweislich nicht stimmen (sie ordnet shxrk "KR" und
// peterbot "MX" zu). Lieber gar keine Flagge als eine falsche.
//
//   GET                                            -> alle Profile
//   POST { id?, name, land, x, region, anzeige }   -> anlegen oder aendern
//   DELETE ?id=… oder ?name=…                      -> Profil entfernen

export interface SpielerProfil {
  /** Epic-Konto-ID, sofern bekannt - der eigentliche Schluessel. */
  id?: string;
  /** Der Name, unter dem das Profil zuletzt gepflegt wurde. */
  name: string;
  /** Alle Namen, unter denen dieser Spieler schon angetreten ist. */
  namen?: string[];
  /** Laenderkuerzel nach ISO, etwa "RO" oder "US". */
  land?: string;
  /** Konto auf X, ohne das @. */
  x?: string;
  /**
   * Twitch-Kanal, ohne die Adresse davor.
   *
   * Nur von Hand gepflegt und nie geraten: aus einem Turniernamen den
   * passenden Twitch-Kanal zu erschliessen geht regelmaessig daneben, und
   * ein fremder Kanal unter dem Namen eines Profis waere ein Fehler, den
   * niemand bemerkt. Das Werkzeug schlaegt Kanaele vor, uebernommen wird
   * nur, was der Betreiber bestaetigt.
   */
  twitch?: string;
  /** Wettkampfregion. Nur noetig, wo das Land nicht eindeutig ist (NAC/NAW). */
  region?: string;
  /** Selbst gesetzter Anzeigename - schlaegt jeden automatischen Vorschlag. */
  anzeige?: string;
}

const DATEI = path.join(DATEN_ORT, 'spieler-profile.json');

async function lies(): Promise<Record<string, SpielerProfil>> {
  try {
    return JSON.parse(await fs.readFile(DATEI, 'utf8')) as Record<string, SpielerProfil>;
  } catch {
    return {};
  }
}

async function schreib(profile: Record<string, SpielerProfil>) {
  await fs.mkdir(path.dirname(DATEI), { recursive: true });
  await fs.writeFile(DATEI, JSON.stringify(profile, null, 2), 'utf8');
}

/**
 * Einen einzelnen Eintrag schreiben, ohne fremde zu verlieren.
 *
 * Die ganze Datei wird gelesen, geaendert und zurueckgeschrieben. Wer zwei
 * Spieler kurz nacheinander pflegt, kann dabei den ersten wieder verlieren:
 * die zweite Anfrage hat die Datei gelesen, bevor die erste sie geschrieben
 * hat, und ueberschreibt sie danach mit ihrem aelteren Stand. Der Betreiber
 * hat genau das erlebt - von vier gepflegten Spielern standen hinterher zwei
 * da, und er hat sich zu Recht geaergert.
 *
 * Deshalb wird nach dem Schreiben nachgesehen, ob der eigene Eintrag
 * wirklich dasteht. Fehlt er, wird frisch gelesen, die eigene Aenderung
 * daraufgesetzt und noch einmal geschrieben - bis zu dreimal. Das schliesst
 * das Fenster nicht mathematisch, aber es macht aus einem verlorenen
 * Eintrag einen sehr unwahrscheinlichen.
 */
async function schreibSicher(
  schluessel: string,
  aendere: (profile: Record<string, SpielerProfil>) => void,
): Promise<Record<string, SpielerProfil>> {
  let profile = await lies();
  for (let versuch = 0; versuch < 3; versuch += 1) {
    aendere(profile);
    await schreib(profile);
    const nachher = await lies();
    const soll = JSON.stringify(profile[schluessel] ?? null);
    if (JSON.stringify(nachher[schluessel] ?? null) === soll) return nachher;
    // Jemand war schneller - seinen Stand nehmen und die eigene Aenderung
    // erneut daraufsetzen.
    profile = nachher;
  }
  return profile;
}

export async function GET() {
  return NextResponse.json({ profile: await lies() });
}

/**
 * Ein Feld uebernehmen - Eingabe vor Alteintrag, Leeres bleibt leer.
 *
 * @param wert       was in der Anfrage stand (schon getrimmt)
 * @param angesprochen ob die Anfrage das Feld ueberhaupt enthielt
 * @param alt        was ein zusammengefuehrter Alteintrag wusste
 */
function uebernimm(
  feld: string, wert: string, angesprochen: boolean, alt?: string,
): Record<string, string> {
  if (wert) return { [feld]: wert };
  // Ausdruecklich geleert: nichts zurueckgeben, das Feld faellt weg.
  if (angesprochen) return {};
  // Gar nicht angesprochen: was der Alteintrag wusste, bleibt.
  return alt ? { [feld]: alt } : {};
}

export async function POST(request: Request) {
  const eingang = await request.json() as Partial<SpielerProfil>;
  const name = (eingang.name ?? '').trim();
  const id = (eingang.id ?? '').trim();
  if (!name && !id) {
    return NextResponse.json({ error: 'name oder id fehlt' }, { status: 400 });
  }

  const profile = await lies();
  const land = (eingang.land ?? '').trim().toUpperCase();
  const x = (eingang.x ?? '').trim().replace(/^@/, '');
  // Auch eine ganze Adresse darf hinein - daraus wird der blosse Kanalname.
  const twitch = (eingang.twitch ?? '').trim()
    .replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '')
    .replace(/^@/, '').replace(/\/.*$/, '');
  const region = (eingang.region ?? '').trim().toUpperCase();
  const anzeige = (eingang.anzeige ?? '').trim();

  /*
   * Welche Felder die Anfrage ueberhaupt anspricht.
   *
   * Am leeren String allein laesst sich nicht ablesen, ob jemand nichts
   * eingegeben oder etwas geloescht hat. Am fehlenden Feld schon. Die
   * Oberflaeche schickt beim Bearbeiten immer alle vier mit - dort ist ein
   * leeres Feld also eine Absicht und muss auch leeren.
   */
  const gesetzt = {
    land: eingang.land !== undefined,
    x: eingang.x !== undefined,
    twitch: eingang.twitch !== undefined,
    region: eingang.region !== undefined,
    anzeige: eingang.anzeige !== undefined,
  };

  // Die Konto-ID gewinnt. Ohne sie bleibt es beim Namensschluessel.
  const schluessel = id || namensSchluessel(name);

  /**
   * Einen alten, nur ueber den Namen gefuehrten Eintrag mitnehmen.
   *
   * Frueher lagen Profile unter dem Namen. Wurde derselbe Spieler spaeter
   * einmal mit seiner Konto-ID gespeichert, entstand ein zweiter Eintrag, und
   * der alte blieb liegen - beim Namen "peterbot" war das genau der Grund,
   * warum ein Nachahmer die Flagge des Profis bekam: sein Name passte auf den
   * herrenlosen Alteintrag.
   *
   * Wird jetzt mit ID gespeichert, wandert ein solcher Alteintrag mit und
   * verschwindet von seinem Namensplatz. Uebernommen wird nur, was im neuen
   * Eintrag nicht ohnehin gesetzt wird - die Eingabe geht immer vor.
   */
  const alterSchluessel = id ? namensSchluessel(name) : '';
  const alter = alterSchluessel && alterSchluessel !== schluessel
    && !profile[alterSchluessel]?.id
    ? profile[alterSchluessel] : undefined;

  const vorher = profile[schluessel] ?? alter;

  // Alle bekannten Namen mitfuehren, damit ein Spieler auch dann gefunden
  // wird, wenn zu einem Turnier keine Konto-ID vorliegt.
  const namen = [...new Set([
    ...(profile[schluessel]?.namen ?? []), ...(alter?.namen ?? []),
    alter?.name ?? '', name,
  ].filter(Boolean))];

  /*
   * Bleibt nichts uebrig, faellt der ganze Eintrag weg.
   *
   * Gerechnet wird mit dem, was danach wirklich dastuende - sonst bliebe
   * ein Eintrag stehen, der nur noch aus dem Namen besteht.
   */
  const bleibt = uebernimm('land', land, gesetzt.land, alter?.land).land
    || uebernimm('x', x, gesetzt.x, alter?.x).x
    || uebernimm('twitch', twitch, gesetzt.twitch, alter?.twitch).twitch
    || uebernimm('region', region, gesetzt.region, alter?.region).region
    || uebernimm('anzeige', anzeige, gesetzt.anzeige, alter?.anzeige).anzeige;

  if (!bleibt) {
    delete profile[schluessel];
  } else {
    profile[schluessel] = {
      ...(id ? { id } : {}),
      name: name || vorher?.name || schluessel,
      ...(namen.length ? { namen } : {}),
      /*
       * Was der Alteintrag wusste, fuellt nur die Luecken.
       *
       * "Luecke" heisst: die Anfrage spricht das Feld gar nicht an. Steht
       * es in der Anfrage, gilt die Anfrage - auch wenn sie leer ist.
       * Vorher gewann hier der Alteintrag ueber jedes geleerte Feld, und
       * ein geloeschter X-Tag kam nach dem Speichern wieder zum Vorschein.
       */
      ...uebernimm('land', land, gesetzt.land, alter?.land),
      ...uebernimm('x', x, gesetzt.x, alter?.x),
      ...uebernimm('twitch', twitch, gesetzt.twitch, alter?.twitch),
      ...uebernimm('region', region, gesetzt.region, alter?.region),
      ...uebernimm('anzeige', anzeige, gesetzt.anzeige, alter?.anzeige),
    };
  }

  // Der Alteintrag hat seinen Zweck erfuellt; bliebe er liegen, faenge er
  // weiter jeden Namensvetter ein.
  if (alter && alterSchluessel) delete profile[alterSchluessel];

  /*
   * Die eigene Aenderung festhalten, damit sie sich wiederholen laesst.
   *
   * schreibSicher() liest notfalls neu und setzt genau diese beiden Schritte
   * noch einmal darauf - siehe dort.
   */
  const meinEintrag = profile[schluessel];
  await schreibSicher(schluessel, (p) => {
    p[schluessel] = meinEintrag;
    if (alter && alterSchluessel) delete p[alterSchluessel];
  });
  /*
   * Die vorgerechneten Antworten des Player Center wegwerfen.
   *
   * Sie halten neunzig Minuten. Wer hier ein @-Konto eintraegt, will es
   * danach sehen und nicht nach der naechsten Frist - der Betreiber hat ein
   * Konto nach dem anderen gepflegt, und im Player Center blieb die Spalte
   * leer. Schlaegt das Wegwerfen fehl, ist das kein Grund, das Speichern
   * scheitern zu lassen.
   */
  void wirfWeg('center|');
  return NextResponse.json({ ok: true, schluessel, profile: profile[schluessel] ?? null });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = (searchParams.get('id') ?? '').trim();
  const name = (searchParams.get('name') ?? '').trim();
  const schluessel = id || namensSchluessel(name);
  if (!schluessel) return NextResponse.json({ error: 'id oder name fehlt' }, { status: 400 });

  const profile = await lies();
  delete profile[schluessel];
  await schreib(profile);
  /*
   * Die vorgerechneten Antworten des Player Center wegwerfen.
   *
   * Sie halten neunzig Minuten. Wer hier ein @-Konto eintraegt, will es
   * danach sehen und nicht nach der naechsten Frist - der Betreiber hat ein
   * Konto nach dem anderen gepflegt, und im Player Center blieb die Spalte
   * leer. Schlaegt das Wegwerfen fehl, ist das kein Grund, das Speichern
   * scheitern zu lassen.
   */
  void wirfWeg('center|');
  return NextResponse.json({ ok: true });
}
