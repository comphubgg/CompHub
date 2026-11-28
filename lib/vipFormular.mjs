/*
 * Das VIP-Anfrageformular in Discord (#get-access) - pruefen, was jemand eingetragen hat.
 *
 * Der Betreiber (28.11.2026): die meisten Anfragen waren Unsinn - "BENZHA." in jedem Feld, "reteteas"/"ganes",
 * "Sjsjj"/"Jejej"; nur Lyr7k hatte es richtig ausgefuellt. Er will:
 *   - getrennte Felder (X-Handle Pflicht, Twitch/TikTok/YouTube freiwillig), eine Folgen-Bestaetigung fuer @CompHub_gg,
 *   - NICHTS blockieren: jede abgeschickte Anfrage landet in #access-requests, auch Unsinn,
 *   - aber warnen: die Person sieht nach dem Absenden, was fehlt ("will very likely be declined") und kann ihre Anfrage
 *     verbessern; der Betreiber sieht in der Anfrage eine Markierung ("Low-effort answer: ...").
 *   - wer das Beispiel 1:1 abschreibt, bekommt "Please don't copy the example" - und die Anfrage die Markierung.
 *
 * Reines JavaScript ohne Abhaengigkeiten: lib/discord.ts nimmt es, und scripts/test/vipFormular.test.mjs prueft es mit den
 * echten Unsinns-Anfragen und der guten von Lyr7k. Alles, was Mitglieder lesen, ist englisch.
 */

/** Das Beispiel fuer "Why ..." - steht als Platzhalter im Formular (hoechstens 100 Zeichen, Discord). */
export const BEISPIEL = 'I stream Fortnite comp 4x a week and want the live overlays + stats for my viewers.';

/** Unser X-Konto. */
export const X_KONTO = 'CompHub_gg';

/** Unter so vielen Zeichen gilt eine Begruendung als zu kurz (nur Warnung, kein Hindernis). */
export const MIN_GRUND = 40;

/** Kleinbuchstaben, nur Buchstaben und Ziffern - "BENZHA." und "benzha" sind dasselbe. */
export function kern(s) {
  return String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Wie kern, aber Woerter bleiben durch ein Leerzeichen getrennt (fuer den Vergleich mit dem Beispiel). */
function worte(s) {
  return String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Aehnlichkeit zweier Texte 0..1 (Dice ueber Buchstaben-Dreiergruppen). */
export function aehnlich(a, b) {
  const x = worte(a); const y = worte(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const gruppen = (s) => {
    const m = new Map();
    const t = ` ${s} `;
    for (let i = 0; i + 3 <= t.length; i += 1) { const g = t.slice(i, i + 3); m.set(g, (m.get(g) ?? 0) + 1); }
    return m;
  };
  const gx = gruppen(x); const gy = gruppen(y);
  let gemeinsam = 0; let nx = 0; let ny = 0;
  for (const n of gx.values()) nx += n;
  for (const n of gy.values()) ny += n;
  for (const [g, n] of gx) gemeinsam += Math.min(n, gy.get(g) ?? 0);
  return (2 * gemeinsam) / (nx + ny);
}

/* ------------------------------------------------------------------ X-Handle */

/** Pfade auf x.com, die kein Konto sind. */
const X_KEIN_KONTO = new Set(['home', 'i', 'intent', 'search', 'explore', 'settings', 'messages', 'notifications', 'share', 'hashtag', 'login', 'signup', 'tos', 'privacy']);

/**
 * Das X-Handle aus einer Eingabe: "@name", "name", "x.com/name", "https://twitter.com/name?s=21" ...
 * X-Benutzernamen: 1-15 Zeichen, nur Buchstaben, Ziffern und Unterstrich (neue Konten mindestens 4 - alte kuerzere gibt es).
 *   -> { handle } oder { fehler: 'leer' | 'andere-plattform' | 'format' | 'unseres' }
 */
export function xHandle(roh) {
  let s = String(roh ?? '').trim();
  if (!s) return { fehler: 'leer' };
  s = s.split(/\s+/)[0];
  if (/(twitch\.tv|tiktok\.com|youtube\.com|youtu\.be|instagram\.com|kick\.com|discord\.gg)/i.test(s)) return { fehler: 'andere-plattform' };
  const url = /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/@?([^/?#\s]+)/i.exec(s);
  let h = url ? url[1] : s.replace(/^@+/, '');
  h = h.replace(/[/?#].*$/, '');
  if (url && X_KEIN_KONTO.has(h.toLowerCase())) return { fehler: 'format' };
  if (!/^[A-Za-z0-9_]{1,15}$/.test(h)) return { fehler: 'format' };
  if (h.toLowerCase() === X_KONTO.toLowerCase()) return { fehler: 'unseres' };
  return { handle: h };
}

/* ------------------------------------------------- Twitch / TikTok / YouTube */

/** decodeURI ohne Ausnahme bei kaputter Kodierung. */
function decodeURISafe(s) {
  try { return decodeURI(s); } catch { return s; }
}

const PLATTFORMEN = [
  { name: 'Twitch', wort: /^twitch$/i, url: /(?:^|\/\/|\.)twitch\.tv\/([A-Za-z0-9_]{3,25})/i, name_ok: /^[A-Za-z0-9_]{3,25}$/, link: (h) => `https://www.twitch.tv/${h}`, zeige: (h) => `twitch.tv/${h}` },
  { name: 'TikTok', wort: /^tik ?tok$/i, url: /(?:^|\/\/|\.)tiktok\.com\/@([A-Za-z0-9_.]{2,24})/i, name_ok: /^[A-Za-z0-9_.]{2,24}$/, link: (h) => `https://www.tiktok.com/@${h}`, zeige: (h) => `tiktok.com/@${h}` },
  { name: 'YouTube', wort: /^(you ?tube|yt)$/i, url: /(?:^|\/\/|\.)youtube\.com\/(@[A-Za-z0-9_.-]{3,30}|c\/[A-Za-z0-9_.-]+|channel\/[A-Za-z0-9_-]+|user\/[A-Za-z0-9_.-]+)/i, name_ok: /^@?[A-Za-z0-9_.-]{3,30}$/, link: (h) => `https://www.youtube.com/${h.startsWith('@') || h.includes('/') ? h : `@${h}`}`, zeige: (h) => `youtube.com/${h.startsWith('@') || h.includes('/') ? h : `@${h}`}` },
  { name: 'Kick', wort: /^kick$/i, url: /(?:^|\/\/|\.)kick\.com\/([A-Za-z0-9_-]{3,25})/i, name_ok: /^[A-Za-z0-9_-]{3,25}$/, link: (h) => `https://kick.com/${h}`, zeige: (h) => `kick.com/${h}` },
];

/**
 * Die weiteren Kanaele, eine Zeile je Kanal: "https://www.twitch.tv/lyr7k", "twitch.tv/lyr7k", "Twitch: lyr7k", "tiktok @lyr7k.fnr".
 *   -> [{ plattform, link, zeige }] fuer Erkanntes, [{ plattform: null, text }] fuer den Rest (z. B. "BENZHA." ohne Plattform).
 *
 * @param {string | null | undefined} roh
 * @returns {Array<{ plattform: string | null, link?: string, zeige?: string, text?: string }>}
 */
export function kanaeleAus(roh) {
  /** @type {Array<{ plattform: string | null, link?: string, zeige?: string, text?: string }>} */
  const raus = [];
  for (const zeile of String(roh ?? '').split(/\r?\n|,(?=\s*(?:https?:|www\.|twitch|tiktok|youtube|kick))/i)) {
    const z = zeile.trim();
    if (!z) continue;
    let treffer = null;
    for (const p of PLATTFORMEN) {
      const u = p.url.exec(z);
      if (u) { treffer = { plattform: p.name, link: p.link(u[1]), zeige: p.zeige(u[1]) }; break; }
      const w = /^([A-Za-z ]{2,8})\s*[:\-–]?\s*@?(\S+)$/.exec(z);
      if (w && p.wort.test(w[1].trim()) && p.name_ok.test(w[2])) {
        const h = p.name === 'YouTube' ? (w[2].startsWith('@') ? w[2] : `@${w[2]}`) : w[2].replace(/^@/, '');
        treffer = { plattform: p.name, link: p.link(h), zeige: p.zeige(h) }; break;
      }
    }
    if (!treffer && /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(z)) treffer = { plattform: 'Link', link: encodeURI(decodeURISafe(z)).replace(/\(/g, '%28').replace(/\)/g, '%29'), zeige: z.replace(/^https?:\/\/(www\.)?/i, '').slice(0, 60) };
    raus.push(treffer ?? { plattform: null, text: z.slice(0, 100) });
  }
  return raus.slice(0, 8);
}

/* ------------------------------------------------------- Tastatur-Gemansche */

const REIHEN = ['qwertzuiop', 'qwertyuiop', 'asdfghjkl', 'yxcvbnm', 'zxcvbnm', '1234567890'];
const VOKAL = /[aeiouyäöü]/;

/**
 * Sieht der Text nach wahllos getippten Tasten aus? Sprachunabhaengig (Lyr7k schrieb deutsch und Umgangssprache - das ist
 * kein Unsinn): wenige verschiedene Buchstaben ("Sjsjj", "Jejej"), ein kurzes Muster immer wieder ("asdasdasd"),
 * Tastenreihen ("asdfgh", "qwerty"), Woerter ohne Vokal, oder dasselbe Wort immer wieder.
 */
export function gemansche(text) {
  const b = String(text ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}]+/gu, '');
  if (b.length < 3) return false;
  const verschieden = new Set(b).size;
  if (b.length >= 4 && verschieden <= 3) return true;
  // Ein kurzes Muster (1-4 Zeichen), das fast den ganzen Text ausmacht.
  for (let u = 1; u <= 4 && u * 2 < b.length; u += 1) {
    const einheit = b.slice(0, u);
    let gleich = 0;
    for (let i = 0; i < b.length; i += 1) if (b[i] === einheit[i % u]) gleich += 1;
    if (b.length >= 6 && gleich / b.length >= 0.85) return true;
  }
  // Tastenreihen: Zeichen in Laeufen von mindestens 4 benachbarten Tasten.
  let inReihe = 0; let lauf = 1;
  const nachbar = (a, c) => REIHEN.some((r) => { const i = r.indexOf(a); const j = r.indexOf(c); return i >= 0 && j >= 0 && Math.abs(i - j) === 1; });
  for (let i = 1; i <= b.length; i += 1) {
    if (i < b.length && nachbar(b[i - 1], b[i])) { lauf += 1; continue; }
    if (lauf >= 4) inReihe += lauf;
    lauf = 1;
  }
  if (inReihe / b.length >= 0.5) return true;
  const w = String(text ?? '').toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  const lang = w.filter((x) => x.length >= 4);
  const ohneVokal = lang.filter((x) => !VOKAL.test(x.normalize('NFKD').replace(/[̀-ͯ]/g, '')));
  if ((ohneVokal.length >= 2 && ohneVokal.length / lang.length >= 0.5) || (w.length === 1 && ohneVokal.length === 1)) return true;
  if (w.length >= 3 && new Set(w).size / w.length <= 0.34) return true;
  return false;
}

/* ------------------------------------------------------------ die Pruefung */

/**
 * Alles pruefen. Nichts davon haelt die Anfrage auf - es sind Hinweise.
 *   felder: { name, x, kanaele, grund, folgt }
 *   -> { x: handle|null, kanaele: [...], hinweise: [{ code, nutzer, admin }] }
 *      nutzer: was die Person liest (englisch, sagt genau, was zu aendern ist)
 *      admin:  die kurze Markierung in der Anfrage fuer den Betreiber
 *
 * @param {{ name?: string, x?: string, kanaele?: string, grund?: string, folgt?: boolean }} felder
 * @returns {{ x: string | null, kanaele: ReturnType<typeof kanaeleAus>, hinweise: Array<{ code: string, nutzer: string, admin: string }> }}
 */
export function pruefeAnfrage(felder) {
  const name = String(felder?.name ?? '').trim();
  const xRoh = String(felder?.x ?? '').trim();
  const kanaeleRoh = String(felder?.kanaele ?? '').trim();
  const grund = String(felder?.grund ?? '').trim();
  /** @type {Array<{ code: string, nutzer: string, admin: string }>} */
  const hinweise = [];
  const dazu = (code, nutzer, admin) => { if (!hinweise.some((h) => h.code === code)) hinweise.push({ code, nutzer, admin }); };

  const xe = xHandle(xRoh);
  const kanaele = kanaeleAus(kanaeleRoh);

  // Dasselbe in mehreren Feldern ("BENZHA." in Name, Socials und Why).
  const kg = kern(grund);
  const andere = [kern(name), kern(xRoh), xe.handle ? kern(xe.handle) : '', ...kanaele.map((k) => kern(k.text ?? ''))].filter(Boolean);
  if (kg && andere.includes(kg)) {
    dazu('gleich', 'You wrote the same thing in several fields. Each field asks for something different - please answer each one.',
      'Same text in several fields');
  }

  // Das Beispiel abgeschrieben.
  if (kg && (aehnlich(grund, BEISPIEL) >= 0.75 || (kg.length >= 20 && kern(BEISPIEL).includes(kg)))) {
    dazu('beispiel', "Please don't copy the example - write your own reason.", 'Copied the example answer');
  }

  if (!kg) {
    dazu('grund-leer', 'Please tell us why you want VIP access and what you will use it for.', 'No reason given');
  } else if (gemansche(grund)) {
    dazu('gemansche', 'Your reason looks like random keys. Please write a real sentence about what you will use VIP for.',
      'Reason looks like keyboard mashing');
  }
  if (kg && grund.length < MIN_GRUND && !hinweise.some((h) => h.code === 'gleich' || h.code === 'gemansche')) {
    dazu('kurz', `Your reason is very short (${grund.length} characters). Write at least a sentence or two (${MIN_GRUND}+ characters): what you will use VIP for and who you are.`,
      `Very short reason (${grund.length} chars)`);
  }

  if (xe.fehler === 'leer') {
    dazu('x-leer', 'Please add your X (Twitter) handle, e.g. @yourname.', 'No X handle');
  } else if (xe.fehler === 'unseres') {
    dazu('x-unseres', `@${X_KONTO} is our account - please enter your own X handle.`, `Entered @${X_KONTO} as their own X handle`);
  } else if (xe.fehler === 'andere-plattform') {
    dazu('x-falsch', 'The X field is for your X (Twitter) handle only, e.g. @yourname. Put Twitch, TikTok or YouTube in the field below it.',
      'X field holds another platform');
  } else if (xe.fehler) {
    dazu('x-format', `"${xRoh.slice(0, 40)}" is not a valid X username. X names have 1-15 letters, numbers or underscores, e.g. @your_name.`,
      'X handle is not a valid username');
  }

  const ohnePlattform = kanaele.filter((k) => !k.plattform);
  if (ohnePlattform.length) {
    dazu('kanal-unklar', 'Under Twitch / TikTok / YouTube, write each channel as a link (twitch.tv/yourname) or as "Twitch: yourname" so we can open it.',
      `Unclear channel: ${ohnePlattform.map((k) => k.text).join(', ').slice(0, 60)}`);
  }

  if (felder?.folgt === false) {
    dazu('folgt-nicht', `VIP is only for people who follow @${X_KONTO} on X. Please follow us and tick the box.`,
      `Did not confirm following @${X_KONTO}`);
  }

  return { x: xe.handle ?? null, kanaele, hinweise };
}
