/*
 * Fertige Vorlagen fuer das Banner.
 *
 * Statt fuenf einzelner Farbwaehler, einer Rundung, einer Schraege und eines
 * Innenabstands gibt es hier eine Handvoll fertiger Bilder, die jeweils
 * zusammenpassen. Wer eine waehlt, ist fertig - und muss nicht erst lernen,
 * welche Farbe wohin gehoert.
 *
 * Die Liste wird an zwei Stellen gebraucht: im Banner selbst und im
 * Konfigurator, der die Vorschau zeigt. Deshalb liegt sie hier und nicht in
 * einer der beiden Seiten.
 */
(function (global) {
  const VORLAGEN = [
    {
      id: 'nacht',
      titel: 'Nacht',
      beschreibung: 'Dunkelblau, ruhig — passt auf fast jeden Stream',
      werte: {
        grund: '#0d1b3a', grund2: '#16264f', schrift: '#ffffff',
        leise: '#93a4c8', akzent: '#38bdf8',
      },
    },
    {
      id: 'kohle',
      titel: 'Kohle',
      beschreibung: 'Fast schwarz, der Akzent traegt die Farbe',
      werte: {
        grund: '#0b0b0e', grund2: '#17171d', schrift: '#ffffff',
        leise: '#8b8b96', akzent: '#38bdf8',
      },
    },
    {
      id: 'eis',
      titel: 'Eis',
      beschreibung: 'Helles Blau, kraeftiger Kontrast',
      werte: {
        grund: '#0b3d7a', grund2: '#0a4f9c', schrift: '#ffffff',
        leise: '#b6d4f5', akzent: '#7dd3fc',
      },
    },
    {
      id: 'glut',
      titel: 'Glut',
      beschreibung: 'Warm, fuer Finaltage',
      werte: {
        grund: '#2a0f0f', grund2: '#451717', schrift: '#ffffff',
        leise: '#d9a9a9', akzent: '#fb923c',
      },
    },
    {
      id: 'rein',
      titel: 'Rein',
      beschreibung: 'Hell, fuer helle Szenen',
      werte: {
        grund: '#f4f6fb', grund2: '#e3e8f2', schrift: '#111827',
        leise: '#5b6478', akzent: '#0284c7',
      },
    },
  ];

  function nach(id) {
    return VORLAGEN.find((v) => v.id === id) || VORLAGEN[0];
  }

  /** Die Farben einer Vorlage auf ein Element schreiben. */
  function anwenden(el, id) {
    const v = nach(id);
    for (const [k, wert] of Object.entries(v.werte)) {
      el.style.setProperty('--' + k, wert);
    }
    return v;
  }

  global.Vorlagen = { liste: VORLAGEN, nach, anwenden };
}(typeof window !== 'undefined' ? window : globalThis));
