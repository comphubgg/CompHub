'use client';

/*
 * Das Kontaktformular.
 *
 * Wer im Werkzeug auf etwas stoesst - einen Fehler, eine fehlende Funktion,
 * eine Idee -, soll das an einer Stelle loswerden koennen, ohne den Umweg
 * ueber Discord oder eine Mailadresse, die er erst suchen muss.
 *
 * Bewusst knapp gehalten: Thema waehlen, beschreiben, Bild dazu, abschicken.
 * Ein Formular mit zwoelf Feldern fuellt niemand aus.
 */

import { useCallback, useEffect, useState } from 'react';
import DiscordKnopf from '@/app/components/DiscordKnopf';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { useZugang } from '@/app/lib/zugang';

/** Muss zu THEMEN in lib/kontakt.ts passen. */
const THEMEN = [
  { schluessel: 'support', titel: 'Support', was: 'Etwas geht nicht' },
  { schluessel: 'report', titel: 'Report', was: 'Jemand oder etwas melden' },
  { schluessel: 'feedback', titel: 'Feedback', was: 'Wie es sich anfühlt' },
  { schluessel: 'hilfe', titel: 'Hilfe', was: 'Ich komme nicht weiter' },
  { schluessel: 'idee', titel: 'Idee', was: 'Ein Vorschlag' },
  { schluessel: 'anderes', titel: 'Anderes', was: 'Betreff selbst schreiben' },
] as const;

const FELD = 'w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 '
  + 'text-sm text-slate-100 outline-none placeholder:text-slate-600 '
  + 'focus:border-sky-500';

export default function KontaktSeite() {
  const t = useT();
  const zugang = useZugang();

  const [thema, setThema] = useState<string>('support');
  const [eigenesThema, setEigenesThema] = useState('');
  const [text, setText] = useState('');
  const [bilder, setBilder] = useState<string[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');
  const [gesendet, setGesendet] = useState(false);

  /*
   * Die Adresse fuer eine Rueckfrage.
   *
   * Vorgeschlagen wird die des Kontos, aber sie ist zu aendern: nicht jeder
   * liest dort mit, und die alten VIP-Zugaenge haben ueberhaupt keine
   * hinterlegt - bei denen stand im Posteingang bisher ein Strich, und der
   * Betreiber konnte nur im Werkzeug antworten.
   *
   * Freiwillig. Wer nichts angibt, bekommt die Antwort im Gespraech; das
   * funktioniert weiterhin und ist fuer viele der bequemere Weg.
   */
  const [antwortMail, setAntwortMail] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const j = await (await fetch('/api/konto')).json();
        if (j?.konto?.email) setAntwortMail(j.konto.email);
      } catch { /* dann bleibt das Feld leer */ }
    })();
  }, []);

  /**
   * Ein Bild aufnehmen - aus der Dateiwahl oder aus der Zwischenablage.
   *
   * Strg+V ist der Weg, den die meisten nehmen: Bildschirmausschnitt machen,
   * ins Formular einfuegen, fertig. Eine Datei erst speichern zu muessen,
   * haelt Leute davon ab, ueberhaupt ein Bild mitzuschicken.
   */
  const nimmDatei = useCallback((datei: File) => {
    if (!datei.type.startsWith('image/')) return;
    if (datei.size > 5 * 1024 * 1024) {
      setFehler(t('Ein Bild ist zu groß — höchstens 5 MB.'));
      return;
    }
    const leser = new FileReader();
    leser.onload = () => setBilder((a) => (a.length >= 4 ? a : [...a, String(leser.result)]));
    leser.readAsDataURL(datei);
  }, [t]);

  useEffect(() => {
    const rein = (e: ClipboardEvent) => {
      const datei = [...(e.clipboardData?.items ?? [])]
        .find((i) => i.type.startsWith('image/'))?.getAsFile();
      if (datei) { e.preventDefault(); nimmDatei(datei); }
    };
    window.addEventListener('paste', rein);
    return () => window.removeEventListener('paste', rein);
  }, [nimmDatei]);

  async function senden() {
    setFehler('');
    if (text.trim().length < 10) {
      setFehler(t('Bitte beschreibe kurz, worum es geht.'));
      return;
    }
    if (thema === 'anderes' && !eigenesThema.trim()) {
      setFehler(t('Bitte schreib dazu, worum es geht.'));
      return;
    }
    setLaeuft(true);
    try {
      const r = await fetch('/api/kontakt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thema, eigenesThema, text, bilder, email: antwortMail }),
      });
      const j = await r.json();
      if (!r.ok) { setFehler(t(j?.fehler || 'Das ging nicht.')); return; }
      setGesendet(true);
    } catch {
      setFehler(t('Keine Verbindung zum Server.'));
    } finally { setLaeuft(false); }
  }

  /* --------------------------------------------------------------- Anzeige */

  if (zugang.laedt) {
    return <main className="flex-1 bg-zinc-950" />;
  }

  /*
   * Ohne Konto geht es nicht - aber freundlich gesagt.
   *
   * Der Grund ist nicht Buerokratie: zu einer Meldung gehoert jemand, den
   * man zurueckfragen kann. Eine anonyme Meldung ohne Rueckweg hilft
   * niemandem.
   */
  if (!zugang.nutzer && !zugang.vip && !zugang.admin) {
    return (
      <main className="relative isolate flex flex-1 items-center justify-center overflow-hidden bg-zinc-950 px-4 py-20 text-slate-100">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/3 -z-10 h-80 w-[640px] -translate-x-1/2 rounded-full bg-sky-500/[0.14] blur-[110px]" />
        <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/90 p-8 text-center shadow-[0_24px_60px_rgba(15,23,42,.25)] backdrop-blur-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/CompHub-Logo-frei.png" alt="" className="mx-auto mb-5 h-14 w-auto" />
          <h1 className="schrift-anzeige text-3xl font-extrabold tracking-tight"><T>Kontakt</T></h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            <T>Zum Schreiben brauchst du ein Konto — damit wir dir antworten
            können.</T>
          </p>
          <Link href="/sign-in"
            className="mt-6 inline-block rounded-full bg-sky-500 px-7 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:-translate-y-0.5 hover:bg-sky-400">
            <T>Zur Anmeldung</T>
          </Link>
        </div>
      </main>
    );
  }

  if (gesendet) {
    return (
      <main className="relative isolate flex flex-1 items-center justify-center overflow-hidden bg-zinc-950 px-4 py-20 text-slate-100">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/3 -z-10 h-80 w-[640px] -translate-x-1/2 rounded-full bg-sky-500/[0.14] blur-[110px]" />
        <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/90 p-8 text-center shadow-[0_24px_60px_rgba(15,23,42,.25)] backdrop-blur-xl">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center
                          rounded-full bg-sky-500/15 text-2xl text-sky-500">✓</div>
          <h1 className="schrift-anzeige text-3xl font-extrabold tracking-tight"><T>Angekommen</T></h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            <T>Danke — die Meldung liegt jetzt beim Betreiber. Auf Antwort
            wartest du an der Adresse deines Kontos.</T>
          </p>
          <button
            onClick={() => {
              setGesendet(false); setText(''); setBilder([]);
              setEigenesThema(''); setThema('support');
            }}
            className="mt-6 rounded-full border border-zinc-700 px-7 py-3 text-sm font-bold
                       text-slate-300 transition hover:border-sky-500 hover:text-sky-500">
            <T>Noch etwas schreiben</T>
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="relative isolate flex-1 overflow-hidden bg-zinc-950 px-4 py-12 text-slate-100">
      <div aria-hidden className="pointer-events-none absolute left-1/4 top-0 -z-10 h-96 w-[720px] -translate-x-1/2 rounded-full bg-sky-500/[0.12] blur-[120px]" />
      <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        {/* ------------------------------------------------ Links: was hier passiert */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-500"><T>Kontakt</T></p>
          <h1 className="schrift-anzeige mt-2 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl"><T>Sag uns, was fehlt.</T></h1>
          <p className="mt-4 max-w-sm text-base text-slate-400">
            <T>Etwas geht nicht, fehlt oder ließe sich besser machen? Schreib es
            hier auf.</T>
          </p>
          <ul className="mt-7 space-y-3 text-sm text-slate-300">
            {['Die Nachricht geht direkt an den Betreiber.', 'Ein Screenshot hilft oft mehr als drei Sätze.', 'Für schnelle Fragen: der Discord.'].map((z) => (
              <li key={z} className="flex items-start gap-3">
                <span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sky-500 text-[11px] font-black text-white">✓</span>
                <span><T>{z}</T></span>
              </li>
            ))}
          </ul>
          <div className="mt-7"><DiscordKnopf art="rand" /></div>
        </aside>

        {/* ------------------------------------------------ Rechts: das Formular */}
        <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-[0_14px_40px_rgba(15,23,42,.14)] sm:p-8">

        {/* Worum es geht - als Kacheln, nicht als Klappliste. Man sieht auf
            einen Blick, was zur Auswahl steht. */}
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {THEMEN.map((x) => (
            <button key={x.schluessel} type="button"
              onClick={() => setThema(x.schluessel)}
              className={`rounded-2xl border px-3 py-2.5 text-left transition ${
                thema === x.schluessel
                  ? 'border-sky-500 bg-sky-500/10'
                  : 'border-zinc-700 hover:border-zinc-500'}`}>
              <div className={`text-sm font-semibold ${
                thema === x.schluessel ? 'text-sky-400' : 'text-slate-200'}`}>
                <T>{x.titel}</T>
              </div>
              <div className="mt-0.5 text-[11px] leading-snug text-slate-500">
                <T>{x.was}</T>
              </div>
            </button>
          ))}
        </div>

        {thema === 'anderes' && (
          <label className="mb-4 block text-xs text-slate-500">
            <T>Worum geht es?</T>
            <input value={eigenesThema} maxLength={120}
              onChange={(e) => setEigenesThema(e.target.value)}
              placeholder={t('In ein paar Worten')}
              className={`${FELD} mt-1`} />
          </label>
        )}

        <label className="mb-4 block text-xs text-slate-500">
          <T>E-Mail für Rückfragen</T>{' '}
          <span className="text-slate-600"><T>(freiwillig)</T></span>
          <input value={antwortMail} type="email" inputMode="email"
            onChange={(e) => setAntwortMail(e.target.value)}
            placeholder={t('damit dich eine Antwort auch per Mail erreicht')}
            className={`${FELD} mt-1`} />
        </label>

        <label className="mb-4 block text-xs text-slate-500">
          <T>Beschreibung</T>
          <textarea value={text} rows={8} maxLength={5000}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('Was ist passiert, und was hättest du erwartet?')}
            className={`${FELD} mt-1 resize-y leading-relaxed`} />
          <span className="mt-1 block text-right text-[10px] text-slate-600">
            {text.length} / 5000
          </span>
        </label>

        {/* Bilder - eingefuegt oder gewaehlt. */}
        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500">
              <T>Bilder</T>{' '}
              <span className="text-slate-600">
                <T>(Strg+V fügt einen Screenshot ein)</T>
              </span>
            </span>
            {bilder.length < 4 && (
              <label className="cursor-pointer rounded-lg border border-dashed
                                border-zinc-700 px-3 py-1 text-[11px] text-slate-400
                                transition hover:border-sky-600 hover:text-sky-400">
                <T>Datei wählen</T>
                <input type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => {
                    for (const d of Array.from(e.target.files ?? [])) nimmDatei(d);
                    e.target.value = '';
                  }} />
              </label>
            )}
          </div>

          {bilder.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-4
                          text-center text-[11px] text-slate-600">
              <T>Kein Bild — ein Screenshot hilft oft mehr als drei Sätze.</T>
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {bilder.map((b, i) => (
                <div key={i} className="relative overflow-hidden rounded-lg
                                        border border-zinc-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b} alt="" className="h-24 w-full object-cover" />
                  <button type="button"
                    onClick={() => setBilder((a) => a.filter((_, j) => j !== i))}
                    className="absolute right-1 top-1 rounded bg-zinc-950/80 px-1.5
                               text-xs text-slate-300 transition hover:text-red-400">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {fehler && (
          <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/5
                        px-3 py-2 text-xs text-red-400">{fehler}</p>
        )}

        <div className="flex items-center gap-3">
          <button onClick={() => void senden()} disabled={laeuft}
            className="rounded-full bg-sky-500 px-8 py-3 text-sm font-bold
                       text-white shadow-lg shadow-sky-500/20 transition hover:-translate-y-0.5 hover:bg-sky-400 disabled:opacity-50">
            {laeuft ? <T>wird gesendet …</T> : <T>Senden</T>}
          </button>
          <span className="text-[11px] text-slate-600">
            <T>Geht direkt an den Betreiber.</T>
          </span>
        </div>
        </section>
      </div>
    </main>
  );
}
