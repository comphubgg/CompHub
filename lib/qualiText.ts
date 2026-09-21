/*
 * Epics Teilnahmebedingungen in Saetze uebersetzen.
 *
 * In den Ereignisdaten steht, wer mitspielen darf - aber als Kennungen, die
 * niemand vorlesen wuerde:
 *
 *   requireAnyTokens        ["S39_FNCS_Division3_EU", "S40_FNCS_Division1_EU"]
 *   requireNoneTokensCaller ["S42_FNCS_Banned", "Permanent_Tournament_Ban"]
 *   metadata.minimumAccountLevel  350
 *
 * Der Betreiber wollte das unter Events lesbar haben: "was sich qualifiziert
 * beziehungsweise wie man sich qualifizieren kann". Also wird hier uebersetzt
 * und nicht durchgereicht.
 *
 * Was sich nicht sicher deuten laesst, bleibt weg. Eine erfundene Bedingung
 * waere schlimmer als eine fehlende - danach richtet sich jemand seinen Abend
 * ein.
 */

/** Eine Zeile der Uebersicht. */
export interface QualiZeile {
  /** "dabei", "gesperrt", "sonst" - danach richtet sich die Farbe. */
  art: 'dabei' | 'gesperrt' | 'sonst';
  text: string;
}

/**
 * Aus einer Token-Kennung einen Satz machen.
 *
 * Epic baut sie nach einem erkennbaren Muster: Saison, Wettbewerb, Division,
 * Region. Was nicht in das Muster passt, kommt unveraendert zurueck - lieber
 * eine Kennung im Klartext als eine falsche Uebersetzung.
 */
export function tokenText(token: string): string {
  const t = String(token ?? '').trim();
  if (!t) return '';

  // Sperren zuerst - sie sind die kuerzesten und eindeutigsten.
  if (/permanent_tournament_ban/i.test(t)) return 'permanently banned from tournaments';
  if (/_banned$/i.test(t) || /\bban\b/i.test(t)) return 'banned this season';
  if (/prizingrestriction/i.test(t)) return 'restricted from prizes';

  /*
   * Divisionssperren: wer in einer Division angetreten ist, darf in derselben
   * Ausgabe nicht in einer anderen antreten.
   */
  const sperre = /S(\d+)_FNCSDivisionLock_Division(\d+)Event(\d+)_([A-Z]+)/i.exec(t);
  if (sperre) {
    return `already locked into Division ${sperre[2]} (Event ${sperre[3]}, ${sperre[4].toUpperCase()})`;
  }

  const div = /S(\d+)_FNCS_Division(\d+)_([A-Z]+)/i.exec(t);
  if (div) return `Division ${div[2]} in Season ${div[1]} (${div[3].toUpperCase()})`;

  const platz = /S(\d+)_(.+?)_([A-Z]{2,4})$/.exec(t);
  if (platz) {
    const was = platz[2].replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
    return `${was} in Season ${platz[1]} (${platz[3].toUpperCase()})`;
  }

  return t;
}

/*
 * Die uebrigen Anforderungen, die Epic am Fenster fuehrt - lesbar.
 *
 * Bei den Ranked Cups standen sie roh auf der Seite: "eula:s42_rankedcup_rules",
 * "adps:g-a81a33a3b9a7", "current Ranking:ranked-br-combined:0". Was sich
 * nicht in einen Satz bringen laesst, bleibt weg - besser eine Zeile
 * weniger als eine Kennung, die niemand versteht.
 */
const RANG_TRACKS: Record<string, string> = {
  'ranked-br-combined': 'Ranked Battle Royale',
  'ranked-br': 'Ranked Battle Royale',
  'ranked-zb-combined': 'Ranked Zero Build',
  'ranked-zb': 'Ranked Zero Build',
  'ranked-blastberry-combined': 'Ranked Reload',
  'ranked_blastberry_build': 'Ranked Reload',
  'ranked_blastberry_nobuild': 'Ranked Reload Zero Build',
  'ranked-blastberry-nobuild': 'Ranked Reload Zero Build',
};
const RANG_STUFEN_22 = [
  'Bronze I', 'Bronze II', 'Bronze III', 'Silver I', 'Silver II', 'Silver III',
  'Gold I', 'Gold II', 'Gold III', 'Platinum I', 'Platinum II', 'Platinum III',
  'Diamond I', 'Diamond II', 'Diamond III', 'Elite I', 'Elite II', 'Elite III',
  'Champion I', 'Champion II', 'Champion III', 'Unreal',
];

function anforderungText(s: string): string | null {
  if (/2fa|mfa|twofactor/i.test(s)) return 'Two-factor authentication switched on';
  if (/^eula:/i.test(s)) return 'Accepted the cup rules in game';
  // Interne Kennungen ohne Bedeutung fuer Spieler.
  if (/^adps:/i.test(s)) return null;
  const rang = s.match(/^currentRanking:([^:]+):(\d+)$/i);
  if (rang) {
    const track = RANG_TRACKS[rang[1]] ?? rang[1];
    const stufe = Number(rang[2]);
    return stufe > 0 && RANG_STUFEN_22[stufe]
      ? `${track}: at least ${RANG_STUFEN_22[stufe]} this season`
      : `${track}: a current rank this season (any tier)`;
  }
  return s.replace(/([a-z])([A-Z])/g, '$1 $2');
}

interface RohesFenster {
  requireAllTokens?: string[];
  requireAnyTokens?: string[];
  requireNoneTokensCaller?: string[];
  requireAllTokensCaller?: string[];
  requireAnyTokensCaller?: string[];
  additionalRequirements?: string[];
  teammateEligibility?: string;
  metadata?: Record<string, unknown>;
}

interface RohesEreignis {
  metadata?: Record<string, unknown>;
}

/**
 * Die lesbare Uebersicht zu einem Spieltag.
 *
 * Ereignis und Fenster zusammen: die Altersgrenze und die Kontostufe stehen
 * am Ereignis, die Tokens am einzelnen Fenster.
 */
export function qualiZeilen(
  ereignis: RohesEreignis | null, fenster: RohesFenster | null,
): QualiZeile[] {
  const raus: QualiZeile[] = [];
  const em = (ereignis?.metadata ?? {}) as Record<string, unknown>;
  const wm = (fenster?.metadata ?? {}) as Record<string, unknown>;

  const stufe = Number(em.minimumAccountLevel ?? 0);
  if (stufe > 0) {
    raus.push({ art: 'dabei', text: `Epic account level ${stufe} or higher` });
  }

  /*
   * Zwei-Faktor kommt als Anforderung am Fenster.
   *
   * Epic schreibt sie unterschiedlich; erkannt wird an "2fa" oder "mfa",
   * alles andere bleibt stehen, wie es dasteht.
   */
  for (const a of fenster?.additionalRequirements ?? []) {
    const s = String(a);
    const text = anforderungText(s);
    if (text) raus.push({ art: 'dabei', text });
  }

  const jede = (fenster?.requireAnyTokens ?? []).map(tokenText).filter(Boolean);
  if (jede.length) {
    raus.push({
      art: 'dabei',
      text: jede.length === 1
        ? `You need: ${jede[0]}`
        : `You need one of: ${jede.join(', ')}`,
    });
  }

  const alle = (fenster?.requireAllTokens ?? []).map(tokenText).filter(Boolean);
  if (alle.length) {
    raus.push({ art: 'dabei', text: `You also need: ${alle.join(', ')}` });
  }

  const keine = (fenster?.requireNoneTokensCaller ?? [])
    .map(tokenText).filter(Boolean);
  if (keine.length) {
    raus.push({ art: 'gesperrt', text: `Locked out if: ${keine.join(', ')}` });
  }

  /*
   * Wie lange ein Team zusammenbleiben muss.
   *
   * "Window" heisst: innerhalb eines Spieltags kein Wechsel; zwischen den
   * Runden geht es. "Event" heisst: fuer den ganzen Cup dasselbe Duo.
   */
  const teamSperre = String(em.TeamLockType ?? '');
  if (teamSperre) {
    raus.push({
      art: 'sonst',
      text: teamSperre.toLowerCase() === 'window'
        ? 'Team is locked for a match day; you may switch between rounds'
        : teamSperre.toLowerCase() === 'event'
          ? 'Team is locked for the whole cup'
          : `Team lock: ${teamSperre}`,
    });
  }

  const runde = String(wm.RoundType ?? '');
  if (runde) raus.push({ art: 'sonst', text: `Round type: ${runde}` });

  if (fenster?.teammateEligibility === 'all') {
    raus.push({ art: 'sonst', text: 'Any teammate may play, no shared requirement' });
  }

  return raus;
}
