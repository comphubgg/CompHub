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
    /*
     * Die FNCS Global Championship 2026 (Antwerpen, 26. und 27. September).
     *
     * Der Hintergrund ist Epics eigene Banner-Grafik, aus der Logo und
     * Schrift heraus sind (public/overlay/globals/fncs-breit.jpg, gebaut aus
     * den Raendern des Banners). Darueber liegt dieselbe schwarze Folie, die
     * der Deckkraft-Regler steuert - der Betreiber: "ein bisschen
     * transparent, plus eine schwarze Folie darueber". Die Schrift wird
     * golden, das Blau ist das des FNCS-Logos (#0e47de, aus dem Logo
     * gelesen).
     */
    {
      id: 'globals',
      titel: 'FNCS Globals',
      beschreibung: 'Kristall und Gold der Global Championship 2026',
      werte: {
        grund: '#05070f', grund2: '#0e47de', schrift: '#ffffff',
        leise: '#ffd766', akzent: '#f5c542',
        bild: "url('globals/fncs-breit.jpg')",
      },
    },
    /*
     * Die Aussehen der anderen Turnierreihen (Betreiber, 1.10.2026: "extra
     * eins fuer Performance Cups, extra eins fuer Division Cups usw.").
     * Die Farben sind die der Kacheln, die Epic fuer die Cups verwendet; das
     * Muster ist ein CSS-Verlauf, keine Grafik von Epic. Dieselben Farben wie
     * public/overlay/themen.css.
     */
    {
      id: 'performance',
      titel: 'Performance Cup',
      beschreibung: 'Tuerkis mit schwarzer Schraege - Performance Evaluation',
      werte: {
        grund: '#04302d', grund2: '#14a89b', schrift: '#ffffff',
        leise: '#7ff5ec', akzent: '#2ad1cc',
        bild: 'linear-gradient(162deg, transparent 0 68%, rgba(0,0,0,.38) 68.2% 80%, transparent 80.2%), linear-gradient(118deg, #0a5f58 0%, #14a89b 34%, #2ad1cc 52%, #12988b 70%, #0a5a54 100%)',
      },
    },
    {
      id: 'division',
      titel: 'Division Cup',
      beschreibung: 'Mint und Chromblau - die Division Cups',
      werte: {
        grund: '#08203f', grund2: '#2f86d6', schrift: '#ffffff',
        leise: '#a6f2de', akzent: '#7fd8c0',
        bild: 'linear-gradient(200deg, rgba(231,240,255,.20) 0 14%, transparent 14.2%), linear-gradient(120deg, #1556b8 0%, #2f86d6 34%, #4fb3b0 68%, #7fd8c0 100%)',
      },
    },
    {
      id: 'cash',
      titel: 'Cash Cup',
      beschreibung: 'Blau ueber Violett zu Magenta - die Cash Cups',
      werte: {
        grund: '#160a38', grund2: '#5b4fe0', schrift: '#ffffff',
        leise: '#f5d0fe', akzent: '#e879f9',
        bild: 'linear-gradient(200deg, rgba(255,255,255,.16) 0 12%, transparent 12.2%), linear-gradient(120deg, #0b4fd8 0%, #5b4fe0 38%, #9a3fdc 68%, #c112c9 100%)',
      },
    },
    {
      id: 'reload',
      titel: 'Reload',
      beschreibung: 'Nachtblau mit Gold - Reload und Reload Championship',
      werte: {
        grund: '#040817', grund2: '#1a2a6a', schrift: '#ffffff',
        leise: '#f0cd78', akzent: '#e0b455',
        bild: 'repeating-linear-gradient(0deg, rgba(120,150,255,.11) 0 1px, transparent 1px 34px), repeating-linear-gradient(90deg, rgba(120,150,255,.11) 0 1px, transparent 1px 34px), linear-gradient(160deg, #040817 0%, #0b1740 56%, #1a2a6a 100%)',
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
