"""
Das tägliche TikTok-Video (Betreiber, 20.10.2026): ein kurzes Hochformat-Video (1080 x 1920, etwa 40 Sekunden) mit den fünf Ersten des Cups, der zuletzt zu Ende ging -
englische Stimme (edge-tts, kostenlos), selbst erzeugte Musik, Untertitel. Dieselbe Technik wie das Vorstellungsvideo (video-werkstatt), aber vollautomatisch und aus echten Daten.

  python scripts/tiktok/tagesvideo.py --ausgabe out [--base https://www.thecomphub.com] [--daten daten.json]

Ergebnis in out/: tiktok-<Datum>.mp4 und tiktok-<Datum>.json (Titel, Text zum Kopieren mit Hashtags, Dauer). Gibt es keinen brauchbaren Cup, entsteht nichts
(Ausgabe "kein Video", Rueckgabewert 0) - dann folgt der Ablauf einfach am naechsten Tag.

Gebraucht: Python 3.10+, edge-tts, numpy, playwright (+ Chromium), ffmpeg im Pfad (oder imageio-ffmpeg).
"""
import argparse, asyncio, functools, http.server, json, os, re, shutil, socketserver, subprocess, sys, tempfile, threading, time, urllib.request
from datetime import datetime, timezone
from pathlib import Path

HIER = Path(__file__).parent
WURZEL = HIER.parent.parent
STIMME = "en-US-AndrewNeural"
TEMPO = "-3%"
VOR, NACH = 0.55, 0.9
FPS = 30
REGION = {"EU": "Europe", "NAC": "N A Central", "NAW": "N A West", "BR": "Brazil", "ASIA": "Asia", "ME": "the Middle East", "OCE": "Oceania"}
ZAHL = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five"}


def ffmpeg():
    p = shutil.which("ffmpeg")
    if p:
        return p
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def dauer(ff, pfad):
    r = subprocess.run([ff, "-i", str(pfad), "-f", "null", "-"], capture_output=True, text=True)
    m = re.findall(r"time=(\d+):(\d+):([\d.]+)", r.stderr)
    h, mi, s = m[-1]
    return int(h) * 3600 + int(mi) * 60 + float(s)


def daten_holen(base, datei, anfrage=""):
    if datei:
        return json.loads(Path(datei).read_text(encoding="utf-8"))
    # Mit "anfrage" (z. B. "vorlage=top5&region=EU&liste=verdienst&jahr=2026") kommt ein eigenes Video statt des letzten Cups - siehe /admin/tiktok.
    adresse = base + "/api/tiktok-daten" + ("?" + anfrage.lstrip("?") if anfrage else "")
    # Die Ablage kann gedrosselt sein (GitHub-Limit je Stunde): bis zu zehn Versuche im Abstand von drei Minuten.
    for versuch in range(10):
        try:
            with urllib.request.urlopen(urllib.request.Request(adresse, headers={"User-Agent": "comphub-tiktok"}), timeout=150) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            print("Daten: Versuch", versuch + 1, "fehlgeschlagen:", str(e)[:100], flush=True)
            time.sleep(180)
    raise SystemExit("Die Daten waren nicht zu holen.")


_EINER = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
          "sixteen", "seventeen", "eighteen", "nineteen"]
_ZEHNER = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]


def zahl_wort(n):
    """Eine Zahl als englische Woerter - damit die Stimme "1058" nicht wie eine Jahreszahl ("ten fifty-eight") liest."""
    n = int(n)
    if n < 20:
        return _EINER[n]
    if n < 100:
        return _ZEHNER[n // 10] + ("-" + _EINER[n % 10] if n % 10 else "")
    if n < 1000:
        return _EINER[n // 100] + " hundred" + (" " + zahl_wort(n % 100) if n % 100 else "")
    if n < 1_000_000:
        return zahl_wort(n // 1000) + " thousand" + (" " + zahl_wort(n % 1000) if n % 1000 else "")
    return str(n)


def drehbuch(d):
    zeilen = sorted(d["zeilen"], key=lambda z: -z["rang"])  # Platz 5 zuerst
    region = REGION.get(d["region"], d["region"])
    # Vorspann: der Cup, dann Spieltag und Stufe ("Performance Evaluation Cup Trios, Event 8, Finals, Europe"), wie sie auch gross im Bild stehen.
    wer = ", ".join(x for x in (d.get("cupName") or d["titel"], d.get("spieltag"), d.get("stufe"), region) if x)
    szenen = [{"id": "intro", "text": d.get("introSatz") or f"Fresh results. {re.sub(r'[^A-Za-z0-9 .,&-]', ' ', wer)}. Here are the top five."}]
    for z in zeilen:
        wort = ZAHL.get(z["rang"], str(z["rang"]))
        pt = zahl_wort(z["punkte"]) if z.get("punkte") is not None else ""
        if z.get("satz"):
            text = z["satz"]
        elif z["rang"] == 1:
            text = f"And the winner. {z['gesprochen']}, with {pt} points."
        else:
            text = f"Number {wort}. {z['gesprochen']}, with {pt} points."
        szenen.append({"id": f"r{z['rang']}", "text": text})
    szenen.append({"id": "outro", "text": d.get("outroSatz") or "Full results, maps and stats on thecomphub dot com. A new recap every day.", "mindestens": 6.5})
    return szenen


PIPER_MODELL = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high/en_US-ryan-high.onnx"


def piper_modell(ordner):
    """Das Stimmmodell von Piper (offline, kostenlos) - wird nur geholt, wenn edge-tts nicht antwortet."""
    modell = ordner / "ryan.onnx"
    if not modell.exists():
        for ende, ziel in ((".onnx", modell), (".onnx.json", ordner / "ryan.onnx.json")):
            urllib.request.urlretrieve(PIPER_MODELL.replace(".onnx", ende) if ende != ".onnx" else PIPER_MODELL, ziel)
    return modell


ALIAS = {}   # gesprochener Name (klein) -> Anzeigename; gefuellt aus den Zeilen (Feld "aussprache", lib/aussprache.ts)


def aliase_aus(d):
    for z in d.get("zeilen") or []:
        for gesprochen, anzeige in z.get("aussprache") or []:
            ALIAS[gesprochen.lower()] = anzeige


def untertitel(woerter):
    """Die Untertitel zeigen den Namen, wie er geschrieben wird (Shark -> SHXRK), auch wenn die Stimme ihn anders spricht."""
    if not ALIAS:
        return woerter
    raus = []
    for w in woerter:
        m = re.match(r"^(.*?)([.,;:!?]*)$", w["w"])
        kern, satz = m.group(1), m.group(2)
        raus.append({**w, "w": ALIAS[kern.lower()] + satz} if kern.lower() in ALIAS else w)
    return raus


def worte_ohne_zeiten(text, d):
    """Piper liefert keine Wortzeiten: sie werden nach Laenge der Woerter auf die Sprechdauer verteilt (Satzzeichen bekommen eine kleine Pause)."""
    woerter = text.split()
    gewicht = [len(w) + (5 if w[-1] in ".,;:!?" else 0) + 1 for w in woerter]
    summe = sum(gewicht)
    t, raus = 0.0, []
    for w, g in zip(woerter, gewicht):
        dauer_w = d * g / summe
        raus.append({"w": w, "t": round(t, 3), "d": round(dauer_w * (0.82 if w[-1] in ".,;:!?" else 0.95), 3)})
        t += dauer_w
    return raus


async def eine_stimme_edge(text, mp3):
    import edge_tts
    woerter = []
    c = edge_tts.Communicate(text, STIMME, rate=TEMPO, boundary="WordBoundary")
    with open(mp3, "wb") as f:
        async for chunk in c.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                woerter.append({"w": chunk["text"], "t": chunk["offset"] / 1e7, "d": chunk["duration"] / 1e7})
    if not woerter:
        raise RuntimeError("edge-tts lieferte keine Woerter")
    return woerter


async def sprechen(szenen, ordner, ff):
    """Je Szene eine Tondatei und die Wortzeiten. Zuerst Microsofts Stimme (edge-tts); antwortet sie nicht (manche Rechenzentren werden abgewiesen), springt Piper ein."""
    stimme = "piper" if os.environ.get("TIKTOK_STIMME") == "piper" else "edge"   # TIKTOK_STIMME=piper: zum Ausprobieren des Rueckfalls
    if stimme == "piper":
        return await sprechen_piper(szenen, ordner, ff)
    tl, beginn = [], 0.0
    for s in szenen:
        woerter = None
        if stimme == "edge":
            for versuch in range(2):
                try:
                    datei = ordner / f"{s['id']}.mp3"
                    woerter = await asyncio.wait_for(eine_stimme_edge(s["text"], datei), timeout=45)
                    break
                except BaseException as e:  # noqa: BLE001 - auch ein Zeitablauf (TimeoutError) zaehlt als "keine Antwort"
                    if isinstance(e, (KeyboardInterrupt, SystemExit)):
                        raise
                    print("edge-tts:", s["id"], "Versuch", versuch + 1, type(e).__name__, str(e)[:80], flush=True)
                    await asyncio.sleep(5)
            if woerter is None:
                print("edge-tts antwortet nicht - Piper uebernimmt (alle Szenen mit derselben Stimme).", flush=True)
                stimme = "piper"
                tl, beginn = [], 0.0
                return await sprechen_piper(szenen, ordner, ff)
        d = dauer(ff, datei)
        laenge = max(VOR + d + NACH, s.get("mindestens", 0))
        tl.append({"id": s["id"], "start": round(beginn, 3), "laenge": round(laenge, 3), "audio": datei.name, "audioStart": VOR, "audioDauer": round(d, 3), "woerter": untertitel(woerter)})
        beginn += laenge - 0.5
    return {"fps": FPS, "gesamt": round(beginn + 0.5, 3), "szenen": tl, "stimme": "edge-tts"}


async def sprechen_piper(szenen, ordner, ff):
    modell = piper_modell(ordner)
    tl, beginn = [], 0.0
    for s in szenen:
        wav = ordner / f"{s['id']}.wav"
        subprocess.run([sys.executable, "-m", "piper", "-m", str(modell), "-f", str(wav)], input=s["text"].encode("utf-8"), check=True, capture_output=True)
        d = dauer(ff, wav)
        laenge = max(VOR + d + NACH, s.get("mindestens", 0))
        tl.append({"id": s["id"], "start": round(beginn, 3), "laenge": round(laenge, 3), "audio": wav.name, "audioStart": VOR, "audioDauer": round(d, 3), "woerter": untertitel(worte_ohne_zeiten(s["text"], d))})
        beginn += laenge - 0.5
    return {"fps": FPS, "gesamt": round(beginn + 0.5, 3), "szenen": tl, "stimme": "piper"}


def server(port):
    class Still(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = functools.partial(Still, directory=str(WURZEL))
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def rendern(tl, daten, frames, port=8791):
    from playwright.sync_api import sync_playwright
    server(port)
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--font-render-hinting=none", "--disable-lcd-text"])
        ctx = b.new_context(viewport={"width": 1080, "height": 1920}, device_scale_factor=1)
        s = ctx.new_page()
        s.on("pageerror", lambda e: print("[FEHLER]", e, flush=True))
        s.add_init_script("window.TIMELINE = " + json.dumps(tl) + "; window.DATEN = " + json.dumps(daten) + "; window.BASIS = ''; window.FORMAT = 'hoch';")
        s.goto(f"http://127.0.0.1:{port}/scripts/tiktok/film-tag.html", wait_until="domcontentloaded", timeout=60000)
        # Bilder, die nicht kommen (Foto-Adresse antwortet nicht), halten die Seite nicht ewig auf: nach 90 Sekunden wird trotzdem gezeichnet.
        try:
            s.wait_for_function("window.bereit === true", timeout=90000)
        except Exception as e:  # noqa: BLE001
            print("Seite nicht ganz bereit, es geht trotzdem los:", str(e)[:80], flush=True)
        n = int(tl["gesamt"] * FPS) + 1
        for i in range(n):
            s.evaluate(f"render({i / FPS})")
            s.screenshot(path=str(frames / f"f{i:05d}.jpg"), type="jpeg", quality=92)
            if i % 300 == 0:
                print(f"  Bild {i}/{n}", flush=True)
        b.close()
    return n


def mischen(ff, tl, ordner, musik, ton):
    eing = ["-i", str(musik)]
    teile = []
    for i, s in enumerate(tl["szenen"], start=1):
        eing += ["-i", str(ordner / s["audio"])]
        ms = int(round((s["start"] + s["audioStart"]) * 1000))
        teile.append(f"[{i}:a]aresample=44100,adelay={ms}|{ms},volume=1.25[s{i}]")
    n = len(tl["szenen"])
    namen = "".join(f"[s{i}]" for i in range(1, n + 1))
    g = tl["gesamt"]
    fc = ";".join(teile) + ";"
    fc += f"{namen}amix=inputs={n}:normalize=0,aformat=channel_layouts=stereo,apad=whole_dur={g + 1.0},asplit=2[v1][v2];"
    fc += "[0:a]aformat=channel_layouts=stereo[m];[m][v1]sidechaincompress=threshold=0.02:ratio=9:attack=25:release=500:makeup=1[md];[md]volume=0.8[md2];"
    fc += "[md2][v2]amix=inputs=2:normalize=0,alimiter=limit=0.95,loudnorm=I=-15:TP=-1.5:LRA=9[aus]"
    r = subprocess.run([ff, "-y", *eing, "-filter_complex", fc, "-map", "[aus]", "-t", str(g + 0.5), "-c:a", "aac", "-b:a", "192k", str(ton)], capture_output=True, text=True)
    if r.returncode:
        raise SystemExit("Ton-Mischung fehlgeschlagen:\n" + r.stderr[-1500:])


def text_zum_kopieren(d):
    if d.get("text"):
        return d["text"]
    z = sorted(d["zeilen"], key=lambda x: x["rang"])
    zeilen = [f"{x['rang']}. {' & '.join(x['namen'])} - {x['punkte']} pts" for x in z]
    region = d["region"]
    kopf = d["titel"] if not d.get("cupName") else " · ".join(x for x in (d["cupName"], " ".join(y for y in (d.get("spieltag"), d.get("stufe")) if y)) if x)
    modus = {"Solos": "#solos", "Duos": "#duos", "Trios": "#trios", "Squads": "#squads"}.get(d.get("modus") or "", "")
    return (f"🏆 {kopf} ({region}) - top 5\n\n" + "\n".join(zeilen)
            + f"\n\nFull results, maps and stats: thecomphub.com\n\n#fortnite #fortnitecompetitive #fncs #esports #comphub" + (f" {modus}" if modus else ""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ausgabe", default="tiktok-out")
    ap.add_argument("--base", default="https://www.thecomphub.com")
    ap.add_argument("--daten", default=None, help="fertige Daten (JSON) statt der Abfrage - zum Ausprobieren")
    ap.add_argument("--anfrage", default=os.environ.get("TIKTOK_ANFRAGE", ""), help="Abfrage fuer ein eigenes Video, z. B. vorlage=top5&region=EU&liste=verdienst&jahr=2026")
    a = ap.parse_args()
    aus = Path(a.ausgabe)
    aus.mkdir(parents=True, exist_ok=True)

    d = daten_holen(a.base, a.daten, a.anfrage)
    if d.get("keinCup") or not d.get("zeilen"):
        print("kein Video:", d.get("grund", "keine Daten"), flush=True)
        return
    ff = ffmpeg()
    aliase_aus(d)
    datum = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    print("Cup:", d["titel"], d["region"], "-", len(d["zeilen"]), "Plaetze", flush=True)

    with tempfile.TemporaryDirectory(prefix="tiktok-") as tmp:
        tmp = Path(tmp)
        t0 = time.time()
        tl = asyncio.run(sprechen(drehbuch(d), tmp, ff))
        print(f"Stimme: {tl.get('stimme')} ({time.time() - t0:.0f}s), Film {tl['gesamt']:.1f}s", flush=True)
        tlpfad = tmp / "timeline.json"
        tlpfad.write_text(json.dumps(tl), encoding="utf-8")
        musik = tmp / "musik.wav"
        subprocess.run([sys.executable, str(HIER / "musik.py"), str(tlpfad), str(musik)], check=True)
        ton = tmp / "ton.m4a"
        mischen(ff, tl, tmp, musik, ton)
        frames = tmp / "frames"
        frames.mkdir()
        print("Musik und Ton fertig, Bilder werden gezeichnet ...", flush=True)
        t0 = time.time()
        n = rendern(tl, d, frames)
        print(f"Bilder: {n} ({time.time() - t0:.0f}s)", flush=True)
        kennung = re.sub(r"[^a-z0-9-]+", "-", str(d.get("dateiName") or "").lower()).strip("-")
        mp4 = aus / f"tiktok-{datum}{'-' + kennung if kennung else ''}.mp4"
        r = subprocess.run([ff, "-y", "-framerate", str(FPS), "-i", str(frames / "f%05d.jpg"), "-i", str(ton),
                            "-vf", "scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-profile:v", "high",
                            "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-r", str(FPS),
                            "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-shortest", "-movflags", "+faststart", str(mp4)], capture_output=True, text=True)
        if r.returncode:
            raise SystemExit("Video fehlgeschlagen:\n" + r.stderr[-1500:])

    info = {"stimme": tl.get("stimme"), "datum": datum, "titel": d["titel"], "cupName": d.get("cupName"), "spieltag": d.get("spieltag"), "stufe": d.get("stufe"), "modus": d.get("modus"), "marken": d.get("marken") or [], "vorlage": d.get("vorlage") or "letzter", "region": d["region"], "cupDatum": d.get("datum"), "dauer": round(tl["gesamt"], 1), "text": text_zum_kopieren(d),
            "seite": d.get("seite"), "video": mp4.name, "mb": round(mp4.stat().st_size / 1e6, 1)}
    (aus / f"{mp4.stem}.json").write_text(json.dumps(info, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"fertig: {mp4.name} ({info['mb']} MB, {info['dauer']} s)", flush=True)


if __name__ == "__main__":
    main()
