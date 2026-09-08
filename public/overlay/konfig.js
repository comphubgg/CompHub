/*
 * Die Einstellungen eines Overlays holen - und im Auge behalten.
 *
 * Jedes Overlay traegt in seiner Adresse nur noch eine Kennung. Was es
 * zeichnen soll, steht auf dem Server unter /api/overlay-config und wird von
 * hier aus im Takt nachgesehen. Erhoeht sich der Stand, ruft dieses Bauteil
 * die Zeichenfunktion mit den neuen Einstellungen auf - ohne dass in OBS
 * jemand die Browserquelle anfassen muss.
 *
 * Einmal geschrieben statt in jeder Overlay-Datei noch einmal: sonst haette
 * das Standings-Overlay in einer Woche einen anderen Takt als das
 * Qual-Overlay, ohne dass es jemandem auffaellt.
 */
(function (global) {
  'use strict';

  /** Wie oft nachgesehen wird, ob im Dashboard etwas geaendert wurde. */
  const NACHSEHEN_MS = 5000;

  function starte({ standard, anwenden }) {
    const P = new URLSearchParams(location.search);
    const id = P.get('id') || '';

    /*
     * Die Vorschau im Dashboard.
     *
     * Sie zeigte bisher denselben gespeicherten Stand wie OBS - wer einen
     * Regler bewegte, sah davon nichts, bis er gespeichert hatte. Der
     * Betreiber wollte es umgekehrt: "die Previews sollen live updated
     * werden, und erst wenn ich Apply druecke, soll's auf OBS uebernommen
     * werden."
     *
     * Deshalb dieser Weg: steht in der Adresse ein "vorschau", gilt genau
     * das, was darin steht, und es wird nicht beim Server nachgefragt. Das
     * Overlay in OBS traegt diesen Parameter nie - es kennt nur seine
     * Kennung und bleibt damit unberuehrt, solange nicht gespeichert wird.
     */
    const vorschau = P.get('vorschau');
    if (vorschau) {
      try {
        anwenden(Object.assign({}, standard, JSON.parse(vorschau)), server0());
      } catch (e) {
        anwenden(Object.assign({}, standard), server0());
      }
      return;
    }
    /*
     * Wo der Server steht.
     *
     * In OBS laeuft das Overlay unter derselben Adresse wie die Seite, also
     * genuegt der eigene Ursprung. Nur wer die Datei von der Platte oeffnet,
     * braucht die Angabe - dafuer bleibt der Parameter.
     */
    const server = server0();

    let stand = -1;
    let laeuft = false;

    async function nachsehen() {
      if (!id) {
        // Ohne Kennung gilt, was in der Datei steht - so zeigt ein Overlay,
        // dessen Kennung verlorengeht, wenigstens etwas Sinnvolles.
        if (!laeuft) { laeuft = true; anwenden(Object.assign({}, standard), server); }
        return;
      }
      try {
        const r = await fetch(
          server + '/api/overlay-config?id=' + encodeURIComponent(id),
          { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (j.stand === stand) return;
        stand = j.stand;
        laeuft = true;
        anwenden(Object.assign({}, standard, j.config || {}), server);
      } catch (e) {
        /* Netz weg - beim naechsten Mal wieder. Das Overlay bleibt stehen,
           statt eine Fehlermeldung ueber den Stream zu legen. */
      }
    }

    nachsehen();
    setInterval(nachsehen, NACHSEHEN_MS);
  }

  /**
   * Der Wechsel zwischen sichtbar und verborgen.
   *
   * Der Betreiber wollte es so: "jede fuenf Minuten fuenf Minuten lang wird's
   * nicht angezeigt, dann wird's fuer zehn Sekunden eingeblendet". Steht die
   * Pause auf null, bleibt das Overlay einfach stehen.
   *
   * Gibt eine Funktion zurueck, die den vorigen Takt abraeumt - sonst liefen
   * nach der dritten Aenderung drei Uhren nebeneinander.
   */
  /** Wo der Server steht - fuer beide Zweige derselbe Weg. */
  function server0() {
    const P = new URLSearchParams(location.search);
    return P.get('server') || location.origin;
  }

  function blenden(element, pausiertSek, sichtbarSek, beimZeigen) {
    let uhr = null;
    const abraeumen = () => { if (uhr) { clearTimeout(uhr); uhr = null; } };

    if (!pausiertSek) {
      element.style.display = '';
      if (beimZeigen) beimZeigen();
      return abraeumen;
    }

    const zeigen = () => {
      element.style.display = '';
      if (beimZeigen) beimZeigen();
      uhr = setTimeout(verstecken, Math.max(2, sichtbarSek) * 1000);
    };
    const verstecken = () => {
      element.style.display = 'none';
      uhr = setTimeout(zeigen, Math.max(5, pausiertSek) * 1000);
    };
    zeigen();
    return abraeumen;
  }

  global.OverlayKonfig = { starte, blenden };
})(window);
