import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import {
  auswahl, bildFuer, gesamtSummen, heimatRegionen, liesVerzeichnis, SAISON_NAMEN,
  saisonName, startseite, summen, tagesbeste, verlauf, epicVerlauf,
  epicTurniere, istGrossesTurnier, istFinaleTag,
} from '@/lib/szeneStats';
import { DATEN_ORT } from '@/lib/datenOrt';

// Die Einzelwerte aus dem eigenen Archiv, zusammengerechnet.
//
//   GET                             -> was im Archiv liegt (Saisons, Regionen)
//   GET ?saison=S41&region=EU       -> alle Spieler dieser Auswahl, summiert
//   GET ?event=Escargo_Day1         -> nur dieser eine Spieltag
//   GET ?spieler=<epicId>           -> dazu der Verlauf Spieltag fuer Spieltag
//
// Gerechnet wird ueber die Epic-Konto-ID. Die Quelle wird in der Antwort
// benannt, damit sie in der Oberflaeche stehen kann - sie gehoert nicht uns.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const QUELLE = 'eucompetitive.com';

/**
 * Die eigenen Spielerprofile dazunehmen.
 *
 * Die Quelle fuehrt den Namen, unter dem jemand an dem Tag angetreten ist -
 * und Pros wechseln den staendig: derselbe Spieler heisst in einer Saison
 * "AURA shxrk", "aurora fv" und "shxrk". Wo ein gepflegtes Profil zu diesem
 * Konto vorliegt, gilt dessen Anzeigename und dessen Flagge; sonst der zuletzt
 * gesehene Turniername und keine Flagge.
 *
 * Nachgeschlagen wird ueber die Konto-ID, nie ueber den Namen - ein
 * Nachahmer traegt sonst die Flagge des Profis.
 */
interface Profil { id?: string; name: string; land?: string; x?: string; anzeige?: string }

let profile: Map<string, Profil> | null = null;
let profileStand = -1;

/**
 * Die Klarnamen und Laender aus der offenen Spielerliste der Quelle.
 *
 * Sie kennt zu viertausend Konten den Profinamen und das Land: das Konto
 * hinter "falcon peterbotǃ" heisst dort PETERBOT und traegt US, das hinter
 * "аurоra fv" heisst SHXRK. Ohne das stuende auf der Seite der Name, unter
 * dem jemand zufaellig an diesem Tag angetreten ist, und daneben die
 * Weltkugel.
 *
 * Es gilt als Grundlage, nicht als Wahrheit: ein selbst gepflegtes Profil
 * schlaegt sie immer. Von 106 Faellen, in denen beide ein Land fuehren,
 * stimmten 102 ueberein - die vier Abweichungen entscheidet der Nutzer.
 */
let szeneSpieler: Map<string, { name: string; land: string }> | null = null;
let szeneBis = 0;

async function liesSzeneSpieler() {
  if (szeneSpieler && Date.now() < szeneBis) return szeneSpieler;
  const karte = new Map<string, { name: string; land: string }>();
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'szene-quelle', 'spielerliste.json'), 'utf8')) as
      Array<{ ID?: string; NAME?: string; COUNTRY?: string }>;
    for (const p of roh) {
      if (!p.ID || !p.NAME) continue;
      karte.set(p.ID, { name: p.NAME, land: (p.COUNTRY || '').toUpperCase() });
    }
  } catch { /* keine Kopie da */ }
  szeneSpieler = karte;
  szeneBis = Date.now() + 5 * 60_000;
  return karte;
}

/**
 * Die Spielerbilder.
 *
 * scripts/spielerbilder-anlegen.mjs legt je Spieler eine Datei unter
 * public/spielerbilder/ an - zunaechst nur die Silhouette, spaeter das echte
 * Foto. Zugeordnet wird ueber die Konto-Id, nicht ueber den Dateinamen.
 */
/**
 * Wann eine Datei zuletzt geaendert wurde.
 *
 * Die gemerkten Karten hingen frueher an einer Uhr: eine Minute lang wurde
 * der alte Stand ausgeliefert. Wer als Admin einen Namen aendert, sieht
 * dann "gespeichert", geht zurueck und findet den alten Namen wieder - der
 * Eindruck, es sei nichts passiert.
 *
 * Jetzt haengt der Merker an der Aenderungszeit der Datei. Solange sich
 * nichts aendert, wird nicht neu gelesen; sobald etwas geschrieben wird,
 * greift es sofort.
 */
async function geaendert(datei: string): Promise<number> {
  try {
    return (await fs.stat(datei)).mtimeMs;
  } catch {
    return 0;
  }
}

const BILDER_DATEI = path.join(DATEN_ORT, 'spielerbilder.json');
let bilder: Map<string, { pfad: string; echt: boolean }> | null = null;
let bilderStand = -1;

async function liesBilder() {
  const stand = await geaendert(BILDER_DATEI);
  if (bilder && bilderStand === stand) return bilder;
  const karte = new Map<string, { pfad: string; echt: boolean }>();
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'spielerbilder.json'), 'utf8')) as
      Array<{ datei: string; epicId: string; echtesFoto?: boolean }>;
    /*
     * Nur echte Fotos werden ausgeliefert.
     *
     * 121 Eintraege zeigen auf ein und dieselbe Datei: eine graue Silhouette,
     * die aus der Szene-Quelle stammt und ueber jeden gelegt wurde, zu dem
     * dort kein Bild lag. Das ergab im Werkzeug zwei verschiedene Leerbilder
     * nebeneinander - bei diesen 121 die Silhouette, bei allen uebrigen das
     * Fragezeichen, das die Oberflaeche selbst zeichnet. Zwei Anblicke fuer
     * denselben Sachverhalt: "zu diesem Spieler haben wir kein Foto".
     *
     * Deshalb bleibt die Silhouette hier liegen. Wer kein wirkliches Foto
     * hat, bekommt gar keins - und damit ueberall dasselbe Fragezeichen.
     * Kodiert wird der Dateiname, damit auch Sonderzeichen durchkommen.
     */
    for (const e of roh) {
      if (!e.epicId || !e.echtesFoto) continue;
      karte.set(e.epicId, {
        pfad: `/spielerbilder/${encodeURIComponent(e.datei)}`,
        echt: true,
      });
    }
  } catch { /* noch keine angelegt */ }
  bilder = karte;
  bilderStand = stand;
  return karte;
}

const PROFIL_DATEI = path.join(DATEN_ORT, 'spieler-profile.json');
async function liesProfile(): Promise<Map<string, Profil>> {
  const stand = await geaendert(PROFIL_DATEI);
  if (profile && profileStand === stand) return profile;
  const karte = new Map<string, Profil>();
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'spieler-profile.json'), 'utf8')) as Record<string, Profil>;
    for (const [schluessel, pr] of Object.entries(roh)) {
      const id = pr.id || (/^[0-9a-f]{32}$/i.test(schluessel) ? schluessel : '');
      if (id) karte.set(id, pr);
    }
  } catch { /* noch keine Profile gepflegt */ }
  profile = karte;
  profileStand = stand;
  return karte;
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const saison = p.get('saison') ?? undefined;
  const region = p.get('region') ?? undefined;
  const event = p.get('event') ?? undefined;
  // Mehrere Spieltage auf einmal - fuer die Summe einer Turnierreihe.
  const events = (p.get('events') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const spieler = p.get('spieler') ?? undefined;
  const sortieren = p.get('sort') ?? 'elims';
  const grenze = Math.min(2000, Math.max(1, parseInt(p.get('limit') ?? '200', 10) || 200));
  const suche = (p.get('q') ?? '').trim().toLowerCase();

  try {
    if (p.get('ansicht') === 'start') {
      const daten = await startseite(saison);
      const gepflegt = await liesProfile();
      const bildZu = await liesBilder();
      const heimat = await heimatRegionen();
      const szene = await liesSzeneSpieler();
      const schmuecken = (s: { epicId: string; name: string } | null) => (s ? {
        ...s,
        anzeige: gepflegt.get(s.epicId)?.anzeige || gepflegt.get(s.epicId)?.name
          || szene.get(s.epicId)?.name || s.name,
        gepflegt: Boolean(gepflegt.get(s.epicId)?.anzeige || gepflegt.get(s.epicId)?.name),
        land: gepflegt.get(s.epicId)?.land || szene.get(s.epicId)?.land || null,
        bild: bildZu.get(s.epicId)?.pfad ?? null,
        echtesFoto: bildZu.get(s.epicId)?.echt ?? false,
        heimat: heimat.get(s.epicId) ?? '',
      } : null);

      /**
       * Die Spieler mit Foto, nach Heimatregion sortiert.
       *
       * Zwei Abschnitte der Startseite leben davon: die Profilkarten, die
       * regionweise durchwechseln, und die Duelle. Beide zeigen nur, wer ein
       * echtes Foto hat - eine graue Silhouette taugt fuer keins von beidem.
       *
       * Die Region ist die Heimatregion des Kontos ueber das ganze Archiv,
       * nicht die des einzelnen Spieltags: sonst stuende jemand, der einmal
       * in einer fremden Region angetreten ist, unter der falschen Flagge.
       *
       * Gerechnet wird ueber das ganze Archiv, nicht ueber die oben gewaehlte
       * Saison. Eine frisch begonnene Saison hat zwei Spieltage - dort haette
       * kaum jemand genug Matches, und beide Abschnitte blieben leer, obwohl
       * die Daten vorhanden sind. Die Bestenlisten darueber zeigen ohnehin
       * die laufende Saison.
       */
      // Erst sortieren, dann schmuecken: das Schmuecken macht aus der Summe
      // ein Anzeigeobjekt, und danach ist nicht mehr zu sortieren.
      const mitFoto = (await gesamtSummen())
        .filter((x) => bildZu.get(x.epicId)?.echt && x.matches >= 10)
        .sort((a, b) => b.elims - a.elims);

      const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'OCE', 'ME', 'ASIA'];
      const profile = REGIONEN.map((r) => ({
        region: r,
        spieler: mitFoto
          .filter((x) => (heimat.get(x.epicId) ?? '') === r)
          .slice(0, 5)
          .map((x) => schmuecken(x)!),
      })).filter((g) => g.spieler.length > 0);

      /**
       * Die Duelle.
       *
       * Gepaart wird innerhalb einer Region und moeglichst weit oben: wer
       * gegeneinander antritt, soll auch vergleichbar sein. Ein Duell
       * zwischen dem Ersten Europas und dem Fuenfzigsten Asiens sagt nichts.
       */
      const duelle: Array<{ links: unknown; rechts: unknown }> = [];
      for (const g of profile) {
        const feld = mitFoto.filter((x) => (heimat.get(x.epicId) ?? '') === g.region);
        for (let i = 0; i + 1 < feld.length && duelle.length < 15; i += 2) {
          duelle.push({ links: schmuecken(feld[i]), rechts: schmuecken(feld[i + 1]) });
        }
      }

      return NextResponse.json({
        success: true, quelle: QUELLE,
        profile,
        duelle: duelle.slice(0, 15),
        ...(daten ? {
          saison: daten.saison,
          kacheln: (() => {
            const alle = daten.kacheln.map((k) => ({ ...k, spitze: schmuecken(k.spitze) }));
            // Nur wer ein Foto hat: eine Karte, deren halbe Flaeche eine
            // graue Silhouette ist, taugt nicht als Aufmacher. Gibt es noch
            // gar keine Fotos, wird nicht gefiltert - lieber Silhouetten als
            // eine leere Seite.
            const mitBild = alle.filter((k) => k.spitze?.echtesFoto);
            // Jeden Spieler nur einmal: dieselben Namen fuehren mehrere
            // Spieltage an, und der Wechsel zeigte sonst dreimal dasselbe
            // Gesicht hintereinander.
            const gesehen = new Set<string>();
            const einmalig = (mitBild.length ? mitBild : alle).filter((k) => {
              const id = k.spitze?.epicId;
              if (!id || gesehen.has(id)) return false;
              gesehen.add(id);
              return true;
            });
            return einmalig.slice(0, 15);
          })(),
          listen: daten.listen.map((l) => ({
            ...l, plaetze: l.plaetze.map((x) => schmuecken(x)),
          })),
        } : {}),
      });
    }

    /**
     * Alle Spieler, zu denen ein echtes Foto vorliegt.
     *
     * Unabhaengig von Saison und Region - die Frage lautet hier nicht "wer
     * hat gut gespielt", sondern "von wem habe ich ueberhaupt ein Bild".
     */
    /**
     * Die Suche in der Kopfzeile.
     *
     * Sie sucht ueber das ganze Archiv, nicht nur ueber die oben gewaehlte
     * Saison - wer einen Namen eintippt, will diesen Spieler finden und
     * nicht erst herausfinden muessen, in welcher Saison er zuletzt
     * angetreten ist.
     *
     * Gesucht wird auf zwei Wegen: im Anzeigenamen und in allen Namen, unter
     * denen das Konto je angetreten ist. Wer "vico" tippt, findet auch "big
     * Vico".
     */
    if (p.get('ansicht') === 'suche') {
      const q = suche;
      if (q.length < 2) {
        return NextResponse.json({ success: true, quelle: QUELLE, spieler: [] });
      }
      const gepflegt = await liesProfile();
      const szene = await liesSzeneSpieler();
      const bildZu = await liesBilder();
      const heimat = await heimatRegionen();

      const treffer = (await gesamtSummen())
        .map((x) => {
          const pr = gepflegt.get(x.epicId);
          const sz = szene.get(x.epicId);
          const anzeige = pr?.anzeige || pr?.name || sz?.name || x.name;
          return { x, anzeige, pr, sz };
        })
        .filter(({ x, anzeige }) =>
          anzeige.toLowerCase().includes(q)
          || x.namen.some((n) => n.toLowerCase().includes(q)))
        // Wer mehr gespielt hat, steht oben: bei "twi" ist der gesuchte
        // Spieler der mit Hunderten Matches, nicht ein gleichnamiges Konto
        // mit dreien.
        .sort((a, b) => b.x.matches - a.x.matches)
        .slice(0, 8)
        .map(({ x, anzeige, pr, sz }) => ({
          ...x,
          anzeige,
          gepflegt: Boolean(pr?.anzeige || pr?.name),
          land: pr?.land || sz?.land || null,
          x: pr?.x ?? null,
          bild: bildZu.get(x.epicId)?.pfad ?? null,
          echtesFoto: bildZu.get(x.epicId)?.echt ?? false,
          heimat: heimat.get(x.epicId) ?? '',
        }));

      return NextResponse.json({ success: true, quelle: QUELLE, spieler: treffer });
    }

    if (p.get('ansicht') === 'bilder') {
      const bildZu = await liesBilder();
      const gepflegt = await liesProfile();
      const szene = await liesSzeneSpieler();
      const heimat = await heimatRegionen();

      /**
       * Wer wichtig ist, steht oben.
       *
       * Gemessen ueber das ganze Archiv, nicht ueber eine Saison: gefragt ist
       * nicht, wer gerade gut spielt, sondern von wem ein Bild fehlt, das
       * fehlen wuerde. Als Mass dienen die Eliminierungen ueber alles - wer
       * viele hat, ist entweder stark oder lange dabei, und beides macht ihn
       * fuer die Sammlung wichtig.
       *
       * Konten mit weniger als zwanzig Matches bleiben draussen; sonst
       * stuenden in der Liste der Fehlenden tausende Karteileichen.
       */
      // Wer ein Foto hat, ist immer dabei - auch mit wenigen Matches.
      //
      // Die Schwelle von zwanzig Matches haelt die Liste der Fehlenden frei
      // von Karteileichen. Auf die Gruppe "mit Bild" darf sie aber nicht
      // wirken: sonst verschwindet ein Foto aus der Ansicht, nur weil es auf
      // einem Konto mit wenig Spielzeit sitzt - und man sucht es, obwohl es
      // laengst da ist.
      const feld = (await gesamtSummen())
        .filter((x) => x.matches >= 20 || bildZu.get(x.epicId)?.echt)
        .sort((a2, b2) => b2.elims - a2.elims);

      const spieler = feld.map((x) => {
        const pr = gepflegt.get(x.epicId);
        const sz = szene.get(x.epicId);
        const b3 = bildZu.get(x.epicId);
        return {
          epicId: x.epicId,
          anzeige: pr?.anzeige || pr?.name || sz?.name || x.name,
          gepflegt: Boolean(pr?.anzeige || pr?.name),
          land: pr?.land || sz?.land || null,
          heimat: heimat.get(x.epicId) ?? '',
          bild: b3?.echt ? b3.pfad : null,
          echtesFoto: Boolean(b3?.echt),
          matches: x.matches,
          events: x.events,
          elims: x.elims,
          damage: x.damage,
          quote: x.quote,
        };
      });

      return NextResponse.json({
        success: true, quelle: QUELLE, spieler,
        mit: spieler.filter((x) => x.echtesFoto).length,
        ohne: spieler.filter((x) => !x.echtesFoto).length,
      });
    }

    // Die Spieltage einer Saison, fuer die Turnieruebersicht.
    if (p.get('ansicht') === 'turniere') {
      const alle = await liesVerzeichnis();
      const gefiltert = alle
        .filter((e) => (!saison || e.season === saison)
                    && (!region || e.region === region));

      /*
       * Dazu die Spieltage, die nur Epic kennt.
       *
       * Die Szene-Quelle veroeffentlicht ihre Einzelwerte erst ein bis zwei
       * Tage nach dem Cup. Bis dahin fehlte das Turnier hier vollstaendig -
       * ein Finale, das gestern gelaufen ist, stand nicht in der Statistik.
       * Epic fuehrt das Fenster sofort, und Platz, Punkte und Matches sind
       * echte Werte. Sie tragen "nurEpic", damit die Kachel dazuschreiben
       * kann, was noch fehlt.
       */
      const nurEpic = await epicTurniere({ saison, region });

      /*
       * Nur die grossen Finale - so wollte es der Betreiber.
       *
       * "unter der Statistik page ... sollen nur Finale kommen plus nur
       * Performance Cups und Divisions Cups für Division eins Finale ...
       * aber keine Division vier, drei, zwei oder irgendwelche Duo Reload
       * Victory Cups". Die Uebersicht soll die Szene abbilden, nicht jeden
       * offenen Cup mit zehntausend Teilnehmern.
       *
       * Mit "?alle=1" kommt trotzdem die volle Liste - die Daten sind ja
       * da, sie stehen nur nicht im Weg.
       */
      const ohneFilter = p.get('alle') === '1';
      const gross = [...gefiltert, ...nurEpic].filter((t) => {
        if (ohneFilter) return true;
        if (!istGrossesTurnier(t.name)) return false;
        return istFinaleTag(t.name,
          'istFinale' in t ? (t as { istFinale?: boolean }).istFinale : undefined,
          (t as { windowId?: string }).windowId);
      });

      const zusammen = gross
        .sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0));

      const turniere = [];
      for (const t of zusammen) {
        turniere.push({ ...t, bild: await bildFuer(t.name), saisonName: saisonName(t.season) });
      }
      return NextResponse.json({ success: true, quelle: QUELLE, turniere });
    }

    if (!saison && !region && !event && !events.length && !spieler) {
      return NextResponse.json({ success: true, quelle: QUELLE, ...(await auswahl()) });
    }

    const filter = { saison, region, event, events: events.length ? events : undefined };
    const { spieler: alle, spieltage } = await summen(filter);

    if (spieler) {
      const eintrag = alle.find((s) => s.epicId === spieler);

      /**
       * Wo steht dieser Spieler im Feld?
       *
       * Das Vorbild zeigt an dieser Stelle Punktwerte wie "FIREPOWER 99/100,
       * Top 1%" - abgeleitet aus seinem Rating, das wir nicht haben. Was sich
       * aber ohne jede Annahme rechnen laesst, ist der Rang: wie viele der
       * Mitspieler liegen unter ihm? Aus neun solchen Raengen wird ein Wert
       * von null bis hundert, und der bedeutet genau das, was danebensteht -
       * keine geheime Formel.
       *
       * Zwei Festlegungen halten den Vergleich ehrlich:
       *
       * Verglichen wird gegen das gesamte Archiv, nicht gegen die oben
       * gewaehlte Saison. Eine Saison mit zwei Spieltagen enthaelt fast
       * niemanden mit genug Matches - dort stuende sonst ueberall eine Null.
       *
       * Und verglichen wird je Match, nicht in Summe. Sonst gewaenne allein,
       * wer oefter angetreten ist.
       */
      const gesamt = await gesamtSummen();
      const gEintrag = gesamt.find((s) => s.epicId === spieler);
      const feld = gesamt.filter((s) => s.matches >= 10);
      const rang = (wert: number, holen: (s: typeof gesamt[number]) => number) => {
        if (!feld.length) return 0;
        const drunter = feld.filter((s) => holen(s) < wert).length;
        return Math.round((drunter / feld.length) * 100);
      };
      /** Denselben Wert je Match - fuer den Spieler wie fuer das Feld. */
      const jeMatch = (holen: (s: typeof gesamt[number]) => number) =>
        (s: typeof gesamt[number]) => (s.matches > 0 ? holen(s) / s.matches : 0);
      const rangJe = (holen: (s: typeof gesamt[number]) => number) => {
        if (!gEintrag) return 0;
        const pro = jeMatch(holen);
        return rang(pro(gEintrag), pro);
      };
      const perzentile = gEintrag ? {
        elims: rangJe((s) => s.elims),
        damage: rangJe((s) => s.damage),
        headshots: rangJe((s) => s.headshots),
        mats: rangJe((s) => s.mats),
        builds: rangJe((s) => s.builds),
        timeAlive: rangJe((s) => s.timeAlive),
        reboots: rangJe((s) => s.reboots),
        // Quote und Trefferquote sind schon Verhaeltnisse - die bleiben, wie
        // sie sind, sonst teilte man zweimal.
        quote: rang(gEintrag.quote, (s) => s.quote),
        genauigkeit: rang(gEintrag.genauigkeit, (s) => s.genauigkeit),
        feldgroesse: feld.length,
      } : null;

      /**
       * Die Grand-Finals-Platzierungen aus der offenen Spielerliste.
       *
       * Sie fuehrt je Saison den erreichten Platz - null heisst, es gab keine
       * Teilnahme. Daraus entsteht dieselbe Tafel, die das Vorbild unter
       * "FNCS" zeigt.
       */
      const szeneListe = JSON.parse(await fs.readFile(
        path.join(DATEN_ORT, 'szene-quelle', 'spielerliste.json'), 'utf8')) as
        Array<Record<string, string | number>>;
      const eintragQuelle = szeneListe.find((x) => x.ID === spieler);
      const fncs = eintragQuelle ? {
        titel: Number(eintragQuelle.FNCS_WINS ?? 0),
        saisons: Object.entries(eintragQuelle)
          .filter(([k]) => /^(CH\d|GLOBALS|ALL_STAR|GRAND_ROYALE|INVITATIONAL)/.test(k))
          .map(([k, v]) => ({ saison: k.replace(/_/g, ' '), platz: Number(v) || 0 })),
      } : null;
      /**
       * Die Tage, an denen er der Staerkste war.
       *
       * Beim Vorbild heisst diese Marke "EVENT MVP" und richtet sich nach
       * ihrem Rating. Hier zaehlt, was in den Dateien steht: die meisten
       * Eliminierungen eines Spieltags.
       */
      const tage = (await tagesbeste()).get(spieler) ?? [];
      const tagesbest = tage
        .map((t) => ({ ...t, saisonName: saisonName(t.season) }))
        .sort((a, b) => b.elims - a.elims);

      /**
       * Zu den FNCS-Siegen so viel wie moeglich.
       *
       * Die offene Spielerliste fuehrt nur Saison und Platz. Alles Weitere -
       * Turniername, Werte - laesst sich nur dort ergaenzen, wo das eigene
       * Archiv die Saison ueberhaupt enthaelt; das sind CH7 S1 bis S4. Ein
       * Titel aus CH5 bleibt deshalb leer, und das steht dann auch als
       * Strich in der Zeile statt als geratene Zahl.
       *
       * Rating und Mitspieler stehen in keiner der beiden Quellen und
       * bleiben grundsaetzlich leer.
       */
      const kennungZu = new Map(Object.entries(SAISON_NAMEN)
        .map(([k, name]) => [name.replace(/\s+/g, '').toUpperCase(), k]));
      const verzeichnis = await liesVerzeichnis();

      const fncsDetail = async (saisonLabel: string) => {
        const kennung = kennungZu.get(saisonLabel.replace(/\s+/g, '').toUpperCase());
        if (!kennung) return null;
        const tage = verzeichnis.filter((e) => e.season === kennung
          && /grand\s*final/i.test(e.name));
        if (!tage.length) return null;

        const zeilenDazu = (await verlauf(spieler, { saison: kennung }))
          .filter((z) => /grand\s*final/i.test(z.event));
        if (!zeilenDazu.length) return null;

        const n = (holen: (w: typeof zeilenDazu[number]['werte']) => number) =>
          zeilenDazu.reduce((summe, z) => summe + (holen(z.werte) || 0), 0);
        // Die Mitspieler stehen in Epics Bestenliste zu diesen Tagen - im
        // Verlauf sind sie deshalb schon aufgeloest. Genommen wird der Tag
        // mit den meisten Namen: an Tag zwei eines Grand Finals fehlt
        // gelegentlich ein Eintrag.
        const mitTeam = [...zeilenDazu]
          .sort((a2, b2) => b2.mitspieler.length - a2.mitspieler.length)[0];

        return {
          turnier: zeilenDazu[0].event.replace(/\s*-\s*Day\s*\d+$/i, ''),
          mitspieler: mitTeam.mitspieler,
          elims: n((w) => w.eliminations),
          damage: Math.round(n((w) => w.damageDealt)),
          builds: n((w) => w.woodBuildsPlaced) + n((w) => w.stoneBuildsPlaced)
            + n((w) => w.metalBuildsPlaced),
          mats: n((w) => w.woodFarmed) + n((w) => w.stoneFarmed)
            + n((w) => w.metalFarmed),
        };
      };

      const fncsSiegeRoh = fncs
        ? await Promise.all(fncs.saisons.filter((x) => x.platz === 1)
          .map(async (x) => ({ saison: x.saison, ...(await fncsDetail(x.saison)) })))
        : [];

      /**
       * Die Mitspieler der FNCS-Siege mit Namen versehen.
       *
       * Sie kommen als Konto-Ids aus Epics Bestenliste; die Namen holt
       * dieselbe Zuordnung, die auch die Turnierliste benutzt.
       */
      const fncsSiege = await Promise.all(fncsSiegeRoh.map(async (x) => {
        const ids: string[] = (x as { mitspieler?: string[] }).mitspieler ?? [];
        const namen = await Promise.all(ids.map(async (id) => {
          const pr2 = (await liesProfile()).get(id);
          const sz2 = (await liesSzeneSpieler()).get(id);
          return {
            epicId: id,
            name: pr2?.anzeige || pr2?.name || sz2?.name || id.slice(0, 8),
            land: pr2?.land || sz2?.land || null,
          };
        }));
        return { ...x, mitspieler: namen };
      }));

      /**
       * Wo der Spieler im Feld steht - regional und weltweit.
       *
       * Das Vorbild fuehrt dafuer "Regional Ranking" und "Global Ranking".
       * Beide Zahlen lassen sich abzaehlen: die Liste nach Eliminierungen
       * sortieren und nachsehen, an welcher Stelle er steht. Regional heisst
       * dabei: unter denen mit derselben Heimatregion, nicht unter denen,
       * die zufaellig einmal dort angetreten sind.
       *
       * Gezaehlt wird ueber denselben Zeitraum, der oben gewaehlt ist - bei
       * "alle Saisons" also ueber das ganze Archiv.
       */
      const heimatKarte = await heimatRegionen();
      const meineRegion = heimatKarte.get(spieler) ?? '';
      const nachElims = [...alle].sort((a2, b2) => b2.elims - a2.elims);
      const rangGlobal = nachElims.findIndex((x) => x.epicId === spieler) + 1;
      const regional = nachElims.filter(
        (x) => (heimatKarte.get(x.epicId) ?? '') === meineRegion);
      const rangRegional = regional.findIndex((x) => x.epicId === spieler) + 1;

      const pr = (await liesProfile()).get(spieler);
      const rohZeilen = await verlauf(spieler, { saison, region });

      /**
       * Dazu die Spieltage, die nur Epic kennt.
       *
       * Die Quelle veroeffentlicht ein bis zwei Tage spaeter, manche Cups
       * gar nicht. Solange fehlte das Turnier im Profil ganz - obwohl es
       * gelaufen ist und Epic Platz und Mitspieler herausgibt. Diese Zeilen
       * tragen kein einziges Werteld: Schaden, Material und Bauteile kennt
       * Epic nicht, und die Eliminierungen dort gelten fuers ganze Team.
       */
      const rohEpic = await epicVerlauf(spieler, { saison, region });

      /**
       * Die Mitspieler mit Namen und Flagge versehen.
       *
       * Im Abzug stehen nur Konto-Ids - Namen wechseln von Turnier zu
       * Turnier, die Id nicht. Der Anzeigename kommt deshalb erst hier
       * dazu, aus denselben Quellen wie beim Spieler selbst: gepflegtes
       * Profil, sonst die Szeneliste, sonst der Turniername.
       */
      const namensQuelle = await liesSzeneSpieler();
      const nameZu = new Map<string, { name: string; land: string | null }>();
      for (const z of [...rohZeilen, ...rohEpic]) {
        for (const id of z.mitspieler) {
          if (nameZu.has(id)) continue;
          const pr2 = (await liesProfile()).get(id);
          const sz2 = namensQuelle.get(id);
          const ausArchiv = alle.find((x) => x.epicId === id)?.name;
          nameZu.set(id, {
            name: pr2?.anzeige || pr2?.name || sz2?.name || ausArchiv || id.slice(0, 8),
            land: pr2?.land || sz2?.land || null,
          });
        }
      }
      const zeilen = rohZeilen.map((z) => ({
        ...z,
        mitspieler: z.mitspieler.map((id) => ({
          epicId: id,
          name: nameZu.get(id)?.name ?? id.slice(0, 8),
          land: nameZu.get(id)?.land ?? null,
        })),
      }));

      const epicZeilen = rohEpic.map((z) => ({
        ...z,
        mitspieler: z.mitspieler.map((id) => ({
          epicId: id,
          name: nameZu.get(id)?.name ?? id.slice(0, 8),
          land: nameZu.get(id)?.land ?? null,
        })),
      }));

      /**
       * Ein Bild je Saison fuer die Bannerzeile ueber der Turnierliste.
       *
       * Zuerst stand dort die Grafik irgendeines Cups aus der Saison. Das war
       * falsch: ueber "Chapter 7 Season 3" prangte das Bild der Reload
       * Championship, und wer die Seite liest, haelt das fuer die Saison.
       *
       * Eine echte Saisongrafik gibt Epic nicht heraus. Deshalb kommt sie
       * jetzt aus public/saisonbilder/ - dort eine Datei S41.jpg oder
       * CH7S3.jpg ablegen, und sie erscheint. Liegt nichts da, bleibt das
       * Banner ohne Bild, statt ein fremdes zu zeigen.
       */
      const saisonBilder: Record<string, string | null> = {};
      const ORDNER = path.join(process.cwd(), 'public', 'saisonbilder');
      for (const kennung of new Set(
        [...zeilen, ...epicZeilen].map((z) => z.season))) {
        const kurz = saisonName(kennung).replace(/\s+/g, '');
        let gefunden: string | null = null;
        for (const stamm of [kennung, kurz]) {
          for (const endung of ['jpg', 'jpeg', 'png', 'webp']) {
            try {
              await fs.access(path.join(ORDNER, `${stamm}.${endung}`));
              gefunden = `/saisonbilder/${stamm}.${endung}`;
              break;
            } catch { /* weiter suchen */ }
          }
          if (gefunden) break;
        }
        saisonBilder[kennung] = gefunden;
      }
      return NextResponse.json({
        success: true, quelle: QUELLE,
        spieler: eintrag ? {
          ...eintrag,
          anzeige: pr?.anzeige || pr?.name
            || (await liesSzeneSpieler()).get(spieler)?.name || eintrag.name,
          gepflegt: Boolean(pr?.anzeige || pr?.name),
          land: pr?.land || (await liesSzeneSpieler()).get(spieler)?.land || null,
          x: pr?.x ?? null,
          bild: (await liesBilder()).get(spieler)?.pfad ?? null,
          heimat: (await heimatRegionen()).get(spieler) ?? '',
        } : null,
        perzentile,
        rang: rangGlobal > 0 ? {
          global: rangGlobal, globalVon: nachElims.length,
          regional: rangRegional > 0 ? rangRegional : null,
          regionalVon: regional.length,
          region: meineRegion,
        } : null,
        tagesbest,
        fncsSiege,
        saisonBilder,
        saisonNamen: Object.fromEntries(
          [...new Set([...zeilen, ...epicZeilen].map((z) => z.season))]
            .map((k) => [k, saisonName(k)])),
        fncs,
        verlauf: zeilen,
        epicZeilen,
      });
    }

    // Sortieren nach dem verlangten Feld. Unbekanntes faellt auf die
    // Eliminierungen zurueck, statt eine leere Liste zu liefern.
    const feld = (['elims', 'damage', 'matches', 'headshots', 'hits', 'assists',
      'quote', 'genauigkeit', 'mats', 'builds', 'timeAlive', 'elimsProMatch',
      'damageProMatch', 'events'].includes(sortieren) ? sortieren : 'elims') as
      keyof typeof alle[number];

    const gefiltert = suche
      ? alle.filter((s) => s.namen.some((n) => n.toLowerCase().includes(suche)))
      : alle;

    const sortiert = [...gefiltert].sort((a, b) =>
      Number(b[feld]) - Number(a[feld]));

    const gepflegt = await liesProfile();
    const bildZu = await liesBilder();
    const heimat = await heimatRegionen();
    const szene = await liesSzeneSpieler();
    const mitProfil = sortiert.slice(0, grenze).map((s) => {
      const pr = gepflegt.get(s.epicId);
      const sz = szene.get(s.epicId);
      return {
        ...s,
        anzeige: pr?.anzeige || pr?.name || sz?.name || s.name,
        // Von Hand gesetzt? Dann wird der Name unveraendert gezeigt - kein
        // Abschleifen, keine Sonderzeichen-Kosmetik.
        gepflegt: Boolean(pr?.anzeige || pr?.name),
        land: pr?.land || sz?.land || null,
        x: pr?.x ?? null,
        bild: bildZu.get(s.epicId)?.pfad ?? null,
        echtesFoto: bildZu.get(s.epicId)?.echt ?? false,
        // Nicht die Region des Spieltags, sondern die des Kontos.
        heimat: heimat.get(s.epicId) ?? s.regionen[0] ?? '',
      };
    });

    return NextResponse.json({
      success: true,
      quelle: QUELLE,
      spieltage,
      gesamt: gefiltert.length,
      sort: feld,
      spieler: mitProfil,
    });
  } catch (fehler) {
    return NextResponse.json(
      { success: false, error: (fehler as Error).message }, { status: 500 });
  }
}
