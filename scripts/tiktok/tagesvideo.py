"""
Das tägliche TikTok-Video (Betreiber, 20.10.2026): ein kurzes Hochformat-Video (1080 x 1920, etwa 40 Sekunden) mit den fünf Ersten des Cups, der zuletzt zu Ende ging -
englische Stimme (edge-tts, kostenlos), selbst erzeugte Musik, Untertitel. Dieselbe Technik wie das Vorstellungsvideo (video-werkstatt), aber vollautomatisch und aus echten Daten.

  python scripts/tiktok/tagesvideo.py --ausgabe out [--base https://www.thecomphub.com] [--daten daten.json]

Ergebnis in out/: tiktok-<Datum>.mp4 und tiktok-<Datum>.json (Titel, Text zum Kopieren mit Hashtags, Dauer). Gibt es keinen brauchbaren Cup, entsteht nichts
(Ausgabe "kein Video", Rueckgabewert 0) - dann folgt der Ablauf einfach am naechsten Tag.

Gebraucht: Python 3.10+, edge-tts, numpy, playwright (+ Chromium), ffmpeg im Pfad (oder imageio-ffmpeg).
"""
import argparse, asyncio, functools, http.server, json, re, shutil, socketserver, subprocess, sys, tempfile, threading, time, urllib.request
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


def daten_holen(base, datei):
    if datei:
        return json.loads(Path(datei).read_text(encoding="utf-8"))
    # Die Ablage kann gedrosselt sein (GitHub-Limit je Stunde): bis zu zehn Versuche im Abstand von drei Minuten.
    for versuch in range(10):
        try:
            with urllib.request.urlopen(urllib.request.Request(base + "/api/tiktok-daten", headers={"User-Agent": "comphub-tiktok"}), timeout=150) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            print("Daten: Versuch", versuch + 1, "fehlgeschlagen:", str(e)[:100], flush=True)
            time.sleep(180)
    raise SystemExit("Die Daten waren nicht zu holen.")


def drehbuch(d):
    zeilen = sorted(d["zeilen"], key=lambda z: -z["rang"])  # Platz 5 zuerst
    region = REGION.get(d["region"], d["region"])
    szenen = [{"id": "intro", "text": f"Fresh results. {re.sub(r'[^A-Za-z0-9 .,&-]', ' ', d['titel'])}, {region}. Here are the top five."}]
    for z in zeilen:
        wort = ZAHL.get(z["rang"], str(z["rang"]))
        pt = z["punkte"]
        if z["rang"] == 1:
            text = f"And the winner. {z['gesprochen']}, with {pt} points."
        else:
            text = f"Number {wort}. {z['gesprochen']}, with {pt} points."
        szenen.append({"id": f"r{z['rang']}", "text": text})
    szenen.append({"id": "outro", "text": "Full results, maps and stats on thecomphub dot com. A new recap every day.", "mindestens": 6.5})
    return szenen


async def sprechen(szenen, ordner, ff):
    import edge_tts
    tl, beginn = [], 0.0
    for s in szenen:
        mp3 = ordner / f"{s['id']}.mp3"
        woerter = []
        c = edge_tts.Communicate(s["text"], STIMME, rate=TEMPO, boundary="WordBoundary")
        with open(mp3, "wb") as f:
            async for chunk in c.stream():
                if chunk["type"] == "audio":
                    f.write(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    woerter.append({"w": chunk["text"], "t": chunk["offset"] / 1e7, "d": chunk["duration"] / 1e7})
        d = dauer(ff, mp3)
        laenge = max(VOR + d + NACH, s.get("mindestens", 0))
        tl.append({"id": s["id"], "start": round(beginn, 3), "laenge": round(laenge, 3), "audio": mp3.name, "audioStart": VOR, "audioDauer": round(d, 3), "woerter": woerter})
        beginn += laenge - 0.5
    gesamt = beginn + 0.5
    return {"fps": FPS, "gesamt": round(gesamt, 3), "szenen": tl}


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
        s.goto(f"http://127.0.0.1:{port}/scripts/tiktok/film-tag.html", wait_until="load")
        s.wait_for_function("window.bereit === true", timeout=180000)
        n = int(tl["gesamt"] * FPS) + 1
        for i in range(n):
            s.evaluate(f"render({i / FPS})")
            s.screenshot(path=str(frames / f"f{i:05d}.jpg"), type="jpeg", quality=92)
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
    z = sorted(d["zeilen"], key=lambda x: x["rang"])
    zeilen = [f"{x['rang']}. {' & '.join(x['namen'])} - {x['punkte']} pts" for x in z]
    region = d["region"]
    return (f"🏆 {d['titel']} ({region}) - top 5\n\n" + "\n".join(zeilen)
            + f"\n\nFull results, maps and stats: thecomphub.com\n\n#fortnite #fortnitecompetitive #fncs #esports #comphub")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ausgabe", default="tiktok-out")
    ap.add_argument("--base", default="https://www.thecomphub.com")
    ap.add_argument("--daten", default=None, help="fertige Daten (JSON) statt der Abfrage - zum Ausprobieren")
    a = ap.parse_args()
    aus = Path(a.ausgabe)
    aus.mkdir(parents=True, exist_ok=True)

    d = daten_holen(a.base, a.daten)
    if d.get("keinCup") or not d.get("zeilen"):
        print("kein Video:", d.get("grund", "keine Daten"), flush=True)
        return
    ff = ffmpeg()
    datum = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    print("Cup:", d["titel"], d["region"], "-", len(d["zeilen"]), "Plaetze", flush=True)

    with tempfile.TemporaryDirectory(prefix="tiktok-") as tmp:
        tmp = Path(tmp)
        tl = asyncio.run(sprechen(drehbuch(d), tmp, ff))
        tlpfad = tmp / "timeline.json"
        tlpfad.write_text(json.dumps(tl), encoding="utf-8")
        musik = tmp / "musik.wav"
        subprocess.run([sys.executable, str(HIER / "musik.py"), str(tlpfad), str(musik)], check=True)
        ton = tmp / "ton.m4a"
        mischen(ff, tl, tmp, musik, ton)
        frames = tmp / "frames"
        frames.mkdir()
        n = rendern(tl, d, frames)
        print("Bilder:", n, flush=True)
        mp4 = aus / f"tiktok-{datum}.mp4"
        r = subprocess.run([ff, "-y", "-framerate", str(FPS), "-i", str(frames / "f%05d.jpg"), "-i", str(ton),
                            "-vf", "scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-profile:v", "high",
                            "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-r", str(FPS),
                            "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-shortest", "-movflags", "+faststart", str(mp4)], capture_output=True, text=True)
        if r.returncode:
            raise SystemExit("Video fehlgeschlagen:\n" + r.stderr[-1500:])

    info = {"datum": datum, "titel": d["titel"], "region": d["region"], "cupDatum": d.get("datum"), "dauer": round(tl["gesamt"], 1), "text": text_zum_kopieren(d),
            "seite": d.get("seite"), "video": mp4.name, "mb": round(mp4.stat().st_size / 1e6, 1)}
    (aus / f"tiktok-{datum}.json").write_text(json.dumps(info, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"fertig: {mp4.name} ({info['mb']} MB, {info['dauer']} s)", flush=True)


if __name__ == "__main__":
    main()
