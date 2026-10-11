/*
 * WebM (so schreibt der Chrome-Rekorder H.264 und Opus) in fragmentierten MP4 umpacken.
 *
 * Warum: ein Zuschauer spielt das POV ueber Media Source Extensions ab, und die wollen MP4-Fragmente. Der
 * Rekorder des Browsers liefert H.264 aber nur als WebM, dafuer laufend (alle ~100 ms ein Stueck, ohne
 * Neustart) und - anders als sein MP4 - ohne Wartezeit bis zum naechsten Schluesselbild. Das Umpacken
 * ist reine Buchhaltung: keine Neukodierung, kaum Rechenlast. Es laeuft im Browser des Profis, der Server
 * reicht die fertigen Fragmente nur durch.
 *
 * Was Chrome liefert (nachgemessen am 11.10.2026):
 *   - EBML-Kopf, Segment und Cluster mit unbekannter Laenge, Spuren: 1 = Video "V_MPEG4/ISO/AVC",
 *     2 = Audio "A_OPUS" (mit OpusHead als CodecPrivate);
 *   - das Video ohne CodecPrivate, die Bilder im Annex-B-Format (Startcodes), SPS/PPS vor jedem
 *     Schluesselbild im Strom;
 *   - SimpleBlocks mit Millisekunden-Zeit, Schluesselbild-Bit im Flag-Byte.
 *
 * Ergebnis: einmal ein Init-Segment (ftyp + moov), dann Fragmente (moof + mdat je Spur). Ein neues
 * Fragment beginnt an jedem Schluesselbild - dort kann ein spaeter dazukommender Zuschauer einsteigen.
 */

export type Ausgabe =
  | { art: 'init'; daten: Uint8Array; mime: string }
  | { art: 'fragment'; daten: Uint8Array; key: boolean };

interface Spur {
  nr: number; typ: number; codec: string; privat: Uint8Array | null;
  breite: number; hoehe: number; rate: number; kanaele: number;
}

interface Bild { t: number; daten: Uint8Array; key: boolean }
interface Probe { t: number; dauer: number; daten: Uint8Array; key: boolean }

const SPUR_VIDEO = 1;
const SPUR_AUDIO = 2;
const TAKT_VIDEO = 90_000;
const TAKT_AUDIO = 48_000;

/** Kopf-Elemente, in die der Parser hineingeht, statt sie zu ueberspringen. */
const DURCHLAESSIG = new Set([0x18538067, 0x1549a966, 0x1654ae6b, 0xae, 0x1f43b675, 0xa0, 0xe0, 0xe1]);
/** Blatt-Elemente, die gelesen werden. */
const GELESEN = new Set([0x2ad7b1, 0xd7, 0x83, 0x86, 0x63a2, 0xb0, 0xba, 0xb5, 0x9f, 0xe7, 0xa3, 0xa1]);

/* ------------------------------------------------------------------ Bytes */

const gleich = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

const cat = (...teile: Uint8Array[]): Uint8Array => {
  let n = 0; for (const t of teile) n += t.length;
  const r = new Uint8Array(n); let o = 0;
  for (const t of teile) { r.set(t, o); o += t.length; }
  return r;
};
const u8 = (...n: number[]) => Uint8Array.from(n);
const u16 = (n: number) => u8((n >>> 8) & 255, n & 255);
const u32 = (n: number) => u8((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const u64 = (n: number) => cat(u32(Math.floor(n / 4294967296)), u32(n >>> 0));
const text = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
const nullen = (n: number) => new Uint8Array(n);

function box(typ: string, ...inhalt: Uint8Array[]): Uint8Array {
  const body = cat(...inhalt);
  return cat(u32(8 + body.length), text(typ), body);
}
const vollBox = (typ: string, version: number, flags: number, ...inhalt: Uint8Array[]) =>
  box(typ, u8(version, (flags >>> 16) & 255, (flags >>> 8) & 255, flags & 255), ...inhalt);

const MATRIX = cat(u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000));

/* ------------------------------------------------------------------ H.264 */

/** Annex-B-Strom in einzelne NAL-Einheiten (ohne Startcodes) teilen. */
function nalEinheiten(d: Uint8Array): Uint8Array[] {
  const stellen: Array<{ start: number; ende: number }> = [];
  let i = 0;
  while (i + 2 < d.length) {
    if (d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 1) {
      stellen.push({ start: i + 3, ende: d.length });
      if (stellen.length > 1) stellen[stellen.length - 2].ende = i > 0 && d[i - 1] === 0 ? i - 1 : i;
      i += 3;
    } else i += 1;
  }
  return stellen.map((s) => d.subarray(s.start, s.ende)).filter((n) => n.length > 0);
}

function avcC(sps: Uint8Array, pps: Uint8Array): Uint8Array {
  return box('avcC', u8(1, sps[1], sps[2], sps[3], 0xff, 0xe1), u16(sps.length), sps, u8(1), u16(pps.length), pps);
}

/** Dauer eines Opus-Pakets in 48-kHz-Schritten, aus dem ersten Byte (TOC). */
function opusDauer(p: Uint8Array): number {
  const toc = p[0]; const cfg = toc >> 3; const c = toc & 3;
  let ms: number;
  if (cfg < 12) ms = [10, 20, 40, 60][cfg % 4];
  else if (cfg < 16) ms = cfg % 2 === 0 ? 10 : 20;
  else ms = [2.5, 5, 10, 20][cfg % 4];
  const rahmen = c === 0 ? 1 : c === 3 ? (p[1] ?? 1) & 0x3f : 2;
  return Math.round(ms * 48 * Math.max(1, rahmen));
}

function dOps(privat: Uint8Array | null, kanaele: number): Uint8Array {
  // OpusHead: "OpusHead" version kanaele vorlauf(LE16) rate(LE32) verstaerkung(LE16) familie [Zuordnung]
  if (privat && privat.length >= 19 && String.fromCharCode(...privat.subarray(0, 8)) === 'OpusHead') {
    const dv = new DataView(privat.buffer, privat.byteOffset, privat.byteLength);
    const familie = privat[18];
    const kopf = cat(
      u8(0, privat[9]), u16(dv.getUint16(10, true)), u32(dv.getUint32(12, true)),
      u16(dv.getInt16(16, true) & 0xffff), u8(familie),
      familie !== 0 ? privat.subarray(19) : new Uint8Array(0),
    );
    return box('dOps', kopf);
  }
  return box('dOps', u8(0, kanaele || 2), u16(312), u32(48000), u16(0), u8(0));
}

/* ------------------------------------------------------------------ Init-Segment */

function initSegment(video: Spur, sps: Uint8Array, pps: Uint8Array, audio: Spur | null): Uint8Array {
  const ftyp = box('ftyp', text('isom'), u32(0x200), text('isom'), text('iso6'), text('mp41'));

  const spurKopf = (nr: number, laut: boolean, breite: number, hoehe: number) =>
    vollBox('tkhd', 0, 3, u32(0), u32(0), u32(nr), u32(0), u32(0), nullen(8), u16(0), u16(0), u16(laut ? 0x0100 : 0),
      u16(0), MATRIX, u32(breite * 65536), u32(hoehe * 65536));
  const medienKopf = (takt: number) => vollBox('mdhd', 0, 0, u32(0), u32(0), u32(takt), u32(0), u16(0x55c4), u16(0));
  const handler = (art: string, name: string) =>
    vollBox('hdlr', 0, 0, u32(0), text(art), nullen(12), text(name), u8(0));
  const dinf = box('dinf', vollBox('dref', 0, 0, u32(1), vollBox('url ', 0, 1)));
  const leer = [
    vollBox('stts', 0, 0, u32(0)), vollBox('stsc', 0, 0, u32(0)),
    vollBox('stsz', 0, 0, u32(0), u32(0)), vollBox('stco', 0, 0, u32(0)),
  ];

  const avc1 = box('avc1', nullen(6), u16(1), nullen(16), u16(video.breite), u16(video.hoehe),
    u32(0x00480000), u32(0x00480000), u32(0), u16(1), nullen(32), u16(0x0018), u16(0xffff), avcC(sps, pps));
  const trakV = box('trak', spurKopf(SPUR_VIDEO, false, video.breite, video.hoehe),
    box('mdia', medienKopf(TAKT_VIDEO), handler('vide', 'VideoHandler'),
      box('minf', vollBox('vmhd', 0, 1, u16(0), nullen(6)), dinf,
        box('stbl', vollBox('stsd', 0, 0, u32(1), avc1), ...leer))));

  let trakA: Uint8Array = new Uint8Array(0);
  if (audio) {
    const kanaele = audio.kanaele || 2;
    const opus = box('Opus', nullen(6), u16(1), nullen(8), u16(kanaele), u16(16), u16(0), u16(0), u32(48000 * 65536),
      dOps(audio.privat, kanaele));
    trakA = box('trak', spurKopf(SPUR_AUDIO, true, 0, 0),
      box('mdia', medienKopf(TAKT_AUDIO), handler('soun', 'SoundHandler'),
        box('minf', vollBox('smhd', 0, 0, u16(0), u16(0)), dinf,
          box('stbl', vollBox('stsd', 0, 0, u32(1), opus), ...leer))));
  }

  const trex = (nr: number) => vollBox('trex', 0, 0, u32(nr), u32(1), u32(0), u32(0), u32(0));
  const moov = box('moov',
    vollBox('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(0), u32(0x00010000), u16(0x0100), u16(0), nullen(8), MATRIX,
      nullen(24), u32(audio ? 3 : 2)),
    trakV, trakA,
    box('mvex', trex(SPUR_VIDEO), ...(audio ? [trex(SPUR_AUDIO)] : [])));
  return cat(ftyp, moov);
}

/* ------------------------------------------------------------------ Fragmente */

let folge = 0;

function fragment(nr: number, basis: number, proben: Probe[]): Uint8Array {
  const flagKey = 0x02000000;
  const flagDelta = 0x01010000;
  const trun = (offset: number) => vollBox('trun', 0, 0x000701, u32(proben.length), u32(offset),
    ...proben.map((p) => cat(u32(p.dauer), u32(p.daten.length), u32(p.key ? flagKey : flagDelta))));
  const moofMit = (offset: number) => box('moof',
    vollBox('mfhd', 0, 0, u32(++folge)),
    box('traf', vollBox('tfhd', 0, 0x020000, u32(nr)), vollBox('tfdt', 1, 0, u64(Math.max(0, basis))), trun(offset)));
  const vor = folge;
  const laenge = moofMit(0).length;
  folge = vor; // die Probe hat die Folgenummer schon hochgezaehlt
  const moof = moofMit(laenge + 8);
  return cat(moof, box('mdat', ...proben.map((p) => p.daten)));
}

/* ------------------------------------------------------------------ Der Umpacker */

export class WebmNachFmp4 {
  private puffer = new Uint8Array(0) as Uint8Array<ArrayBufferLike>;
  private skip = 0;
  private skala = 1_000_000;
  private spuren: Spur[] = [];
  private aktSpur: Spur | null = null;
  private clusterZeit = 0;

  private sps: Uint8Array | null = null;
  private pps: Uint8Array | null = null;
  private bereit = false;
  private neuesInit = false;
  private basis = 0;

  private vorher: Bild | null = null;
  private video: Probe[] = [];
  private audio: Probe[] = [];
  private aZeit = -1;
  private vFragmentStart = 0;
  private aFragmentStart = 0;

  constructor(private bei: (a: Ausgabe) => void) {}

  /** Die Zahl der Bilder, die bisher umgepackt wurden - fuer die Anzeige. */
  bilder = 0;

  fuettere(daten: Uint8Array): void {
    this.puffer = this.puffer.length ? cat(this.puffer, daten) : daten;
    this.lies();
    this.leere();
  }

  /** Alles Offene hinausschreiben (beim Beenden). */
  ende(): void {
    if (this.vorher && this.bereit) {
      this.video.push({ t: this.vorher.t, dauer: Math.round(TAKT_VIDEO / 30), daten: this.vorher.daten, key: this.vorher.key });
      this.vorher = null;
    }
    this.leere();
  }

  /* ------------------------------------------------------------ EBML lesen */

  private kopf(): { id: number; groesse: number; laenge: number } | null {
    const d = this.puffer;
    if (!d.length) return null;
    let idLen = 1; let m = 0x80;
    while (idLen <= 4 && !(d[0] & m)) { idLen += 1; m >>= 1; }
    if (idLen > 4 || d.length < idLen + 1) return null;
    let id = 0; for (let i = 0; i < idLen; i++) id = id * 256 + d[i];
    let sLen = 1; m = 0x80;
    while (sLen <= 8 && !(d[idLen] & m)) { sLen += 1; m >>= 1; }
    if (sLen > 8 || d.length < idLen + sLen) return null;
    let wert = d[idLen] & (m - 1); let unbekannt = wert === m - 1;
    for (let i = 1; i < sLen; i++) { wert = wert * 256 + d[idLen + i]; if (d[idLen + i] !== 255) unbekannt = false; }
    return { id, groesse: unbekannt ? -1 : wert, laenge: idLen + sLen };
  }

  private verwerfe(n: number) { this.puffer = this.puffer.subarray(n); }

  private lies(): void {
    for (;;) {
      if (this.skip > 0) {
        const n = Math.min(this.skip, this.puffer.length);
        this.verwerfe(n); this.skip -= n;
        if (this.skip > 0) return;
        continue;
      }
      const k = this.kopf();
      if (!k) return;
      if (DURCHLAESSIG.has(k.id)) {
        if (k.id === 0xae) {
          this.aktSpur = { nr: 0, typ: 0, codec: '', privat: null, breite: 0, hoehe: 0, rate: 48000, kanaele: 2 };
          this.spuren.push(this.aktSpur);
        }
        this.verwerfe(k.laenge);
        continue;
      }
      if (k.groesse < 0) { this.verwerfe(k.laenge); continue; }
      if (!GELESEN.has(k.id)) { this.verwerfe(k.laenge); this.skip = k.groesse; continue; }
      if (this.puffer.length < k.laenge + k.groesse) return;
      const inhalt = this.puffer.subarray(k.laenge, k.laenge + k.groesse);
      this.element(k.id, inhalt);
      this.puffer = this.puffer.subarray(k.laenge + k.groesse);
    }
  }

  private zahl(d: Uint8Array): number { let v = 0; for (const b of d) v = v * 256 + b; return v; }

  private element(id: number, d: Uint8Array): void {
    const s = this.aktSpur;
    switch (id) {
      case 0x2ad7b1: this.skala = this.zahl(d) || 1_000_000; break;
      case 0xd7: if (s) s.nr = this.zahl(d); break;
      case 0x83: if (s) s.typ = this.zahl(d); break;
      case 0x86: if (s) s.codec = String.fromCharCode(...d); break;
      case 0x63a2: if (s) s.privat = new Uint8Array(d); break;
      case 0xb0: if (s) s.breite = this.zahl(d); break;
      case 0xba: if (s) s.hoehe = this.zahl(d); break;
      case 0x9f: if (s) s.kanaele = this.zahl(d); break;
      case 0xb5: if (s) {
        const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
        s.rate = d.length === 8 ? dv.getFloat64(0) : dv.getFloat32(0);
      } break;
      case 0xe7: this.clusterZeit = this.zahl(d); break;
      case 0xa3: case 0xa1: this.block(d, id === 0xa3); break;
      default: break;
    }
  }

  private block(d: Uint8Array, einfach: boolean): void {
    // Spurnummer (Laengenwert), Zeit relativ zum Cluster (Int16), Flags, Nutzdaten.
    let n = 1; let m = 0x80;
    while (n <= 8 && !(d[0] & m)) { n += 1; m >>= 1; }
    let spur = d[0] & (m - 1); for (let i = 1; i < n; i++) spur = spur * 256 + d[i];
    const rel = (d[n] << 8 | d[n + 1]) << 16 >> 16;
    const flags = d[n + 2];
    const nutz = d.subarray(n + 3);
    const t = ((this.clusterZeit + rel) * this.skala) / 1_000_000; // Millisekunden
    const art = this.spuren.find((x) => x.nr === spur);
    if (!art || !nutz.length) return;
    if (art.typ === SPUR_VIDEO) this.bild(t, nutz, einfach ? (flags & 0x80) !== 0 : false);
    else if (art.typ === SPUR_AUDIO) this.ton(t, nutz);
  }

  /* ------------------------------------------------------------ Bilder und Ton */

  private bild(tMs: number, roh: Uint8Array, keyFlag: boolean): void {
    const teile: Uint8Array[] = [];
    let key = keyFlag;
    for (const nal of nalEinheiten(roh)) {
      const art = nal[0] & 0x1f;
      if (art === 7) {
        // Aendert sich die Bildgroesse (das geteilte Fenster wird groesser), kommt ein anderes SPS: neues Init noetig.
        if (this.sps && this.bereit && !gleich(this.sps, nal)) { this.sps = new Uint8Array(nal); this.pps = null; this.neuesInit = true; }
        else this.sps ??= new Uint8Array(nal);
        continue;
      }
      if (art === 8) { if (this.neuesInit || !this.pps) this.pps = new Uint8Array(nal); continue; }
      if (art === 9 || art === 6) continue;
      if (art === 5) key = true;
      teile.push(u32(nal.length), nal);
    }
    if (!teile.length) return;
    const daten = cat(...teile);
    const t = Math.round(tMs * (TAKT_VIDEO / 1000));

    if (!this.bereit) {
      // Der Anfang ist das erste Schluesselbild, bei dem SPS und PPS bekannt sind.
      if (!key || !this.sps || !this.pps) return;
      const v = this.spuren.find((x) => x.typ === SPUR_VIDEO);
      if (!v) return;
      const a = this.spuren.find((x) => x.typ === SPUR_AUDIO) ?? null;
      this.basis = t;
      this.bereit = true;
      const cs = [this.sps[1], this.sps[2], this.sps[3]].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      this.bei({
        art: 'init', daten: initSegment(v, this.sps, this.pps, a),
        mime: `video/mp4; codecs="avc1.${cs}${a ? ',opus' : ''}"`,
      });
    }

    if (this.neuesInit && key && this.sps && this.pps) {
      // Alles Bisherige hinausschreiben, dann das neue Init - der Server trennt die Zuschauer, die holen sich den Neuanfang.
      if (this.vorher) { this.video.push({ t: this.vorher.t, dauer: Math.max(1, t - this.basis - this.vorher.t), daten: this.vorher.daten, key: this.vorher.key }); this.vorher = null; }
      this.leere();
      const v = this.spuren.find((x) => x.typ === SPUR_VIDEO);
      const a = this.spuren.find((x) => x.typ === SPUR_AUDIO) ?? null;
      if (v) {
        const cs = [this.sps[1], this.sps[2], this.sps[3]].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
        this.bei({ art: 'init', daten: initSegment(v, this.sps, this.pps, a), mime: `video/mp4; codecs="avc1.${cs}${a ? ',opus' : ''}"` });
      }
      this.neuesInit = false;
    }

    const jetzt: Bild = { t: t - this.basis, daten, key };
    if (this.vorher) {
      this.video.push({ t: this.vorher.t, dauer: Math.max(1, jetzt.t - this.vorher.t), daten: this.vorher.daten, key: this.vorher.key });
    }
    // Ab einem Schluesselbild beginnt ein neues Fragment - dort steigt ein spaeter Zuschauer ein.
    if (jetzt.key && this.video.length) this.leere();
    this.vorher = jetzt;
    this.bilder += 1;
  }

  private ton(tMs: number, paket: Uint8Array): void {
    if (!this.bereit) return;
    const t = Math.round((tMs * TAKT_AUDIO) / 1000) - Math.round((this.basis / TAKT_VIDEO) * TAKT_AUDIO);
    if (t < -TAKT_AUDIO / 50) return; // vor dem Anfang
    if (this.aZeit < 0 || Math.abs(this.aZeit - t) > TAKT_AUDIO * 0.12) this.aZeit = Math.max(0, t);
    const dauer = opusDauer(paket);
    this.audio.push({ t: this.aZeit, dauer, daten: new Uint8Array(paket), key: true });
    this.aZeit += dauer;
  }

  /** Was bisher fertig ist, als ein Fragment hinausgeben (je Spur ein moof + mdat). */
  private leere(): void {
    if (!this.bereit) return;
    const teile: Uint8Array[] = [];
    let key = false;
    if (this.video.length) {
      key = this.video[0].key;
      teile.push(fragment(SPUR_VIDEO, this.video[0].t, this.video));
      this.video = [];
    }
    if (this.audio.length) {
      teile.push(fragment(SPUR_AUDIO, this.audio[0].t, this.audio));
      this.audio = [];
    }
    if (teile.length) this.bei({ art: 'fragment', daten: cat(...teile), key });
  }
}
