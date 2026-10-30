"""
TikToks aus den Twitch-Clips der verbundenen VIP-Streamer (Aufgabe 167, lib/tiktokClips, .github/workflows/tiktok-clips.yml).

Der Auftrag (app/api/tiktok-clips/auftrag) nennt je Streamer die besten Clips der letzten 24 Stunden mit Download-Adresse und wo seine Facecam sitzt.
Jeder Clip wird hochkant geschnitten (1080 x 1920):
  - mit Facecam: oben die Facecam (ein Viertel des Bildes aus ihrer Ecke, auf volle Breite), darunter das Spiel aus der Bildmitte;
  - ohne Facecam: das ganze Bild in der Mitte, dahinter dasselbe verschwommen.
Der Titel des Clips steht als Zeile ueber dem Spiel. Ausgabe wie bei den Tagesvideos (MP4 + JSON) - so erscheinen sie in /admin/tiktok.

  python scripts/tiktok/clips.py --auftrag auftrag.json --ausgabe tiktok-out
"""

import argparse
import json
import pathlib
import subprocess
import urllib.request
from datetime import datetime, timezone

import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SCHRIFT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# Wo die Facecam sitzt: Ausschnitt (x, y) als Anteil der Bildgroesse, Breite und Hoehe je ein Viertel.
ECKEN = {
    "oben-links": ("0", "0"),
    "oben-rechts": ("iw*0.75", "0"),
    "unten-links": ("0", "ih*0.75"),
    "unten-rechts": ("iw*0.75", "ih*0.75"),
}


def filter_fuer(ecke: str, textdatei: str) -> str:
    titel = (f"drawtext=fontfile={SCHRIFT}:textfile='{textdatei}':fontcolor=white:fontsize=54:line_spacing=8"
             f":box=1:boxcolor=black@0.6:boxborderw=22:x=(w-text_w)/2")
    if ecke in ECKEN:
        x, y = ECKEN[ecke]
        return (f"[0:v]split=2[a][b];"
                f"[a]crop=iw*0.25:ih*0.25:{x}:{y},scale=1080:608[cam];"
                f"[b]crop=ih*1080/1312:ih:(iw-ih*1080/1312)/2:0,scale=1080:1312[spiel];"
                f"[cam][spiel]vstack=inputs=2,{titel}:y=640,format=yuv420p[v]")
    return (f"[0:v]split=2[a][b];"
            f"[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:2[grund];"
            f"[b]scale=1080:-2[mitte];"
            f"[grund][mitte]overlay=(W-w)/2:(H-h)/2,{titel}:y=420,format=yuv420p[v]")


def umbrechen(text: str, breite: int = 26) -> str:
    worte, zeilen, zeile = text.split(), [], ""
    for w in worte:
        if len(zeile) + len(w) + 1 > breite and zeile:
            zeilen.append(zeile)
            zeile = w
        else:
            zeile = f"{zeile} {w}".strip()
    if zeile:
        zeilen.append(zeile)
    return "\n".join(zeilen[:3])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--auftrag", required=True)
    ap.add_argument("--ausgabe", default="tiktok-out")
    a = ap.parse_args()
    aus = pathlib.Path(a.ausgabe)
    aus.mkdir(parents=True, exist_ok=True)
    auftrag = json.loads(pathlib.Path(a.auftrag).read_text(encoding="utf-8"))
    datum = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    n = 0
    for s in auftrag.get("streamer", []):
        if s.get("fehler"):
            print(f"{s['login']}: {s['fehler']}", flush=True)
        for c in s.get("clips", []):
            stamm = f"{datum}-clip-{s['login']}-{c['id'][:40]}"
            roh = aus / f"{stamm}-roh.mp4"
            mp4 = aus / f"{stamm}.mp4"
            text = aus / f"{stamm}.txt"
            try:
                urllib.request.urlretrieve(c["url"], roh)
            except Exception as e:  # noqa: BLE001 - ein Clip darf die anderen nicht aufhalten
                print(f"{c['id']}: Download gescheitert ({e})", flush=True)
                continue
            text.write_text(umbrechen(c["titel"] or s["name"]), encoding="utf-8")
            befehl = [FFMPEG, "-y", "-loglevel", "error", "-i", str(roh), "-filter_complex", filter_fuer(s.get("facecam", "keine"), text.as_posix()),
                      "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "160k",
                      "-movflags", "+faststart", str(mp4)]
            erg = subprocess.run(befehl, capture_output=True, text=True)
            roh.unlink(missing_ok=True)
            text.unlink(missing_ok=True)
            if erg.returncode != 0 or not mp4.exists():
                print(f"{c['id']}: Schnitt gescheitert: {erg.stderr[-400:]}", flush=True)
                continue
            beschreibung = f"{c['titel']}\n\nClip from {s['name']}'s stream (twitch.tv/{s['login']}).\n\n#fortnite #fortnitecompetitive #{s['login']} #twitch #comphub"
            info = {"datum": datum, "titel": c["titel"] or s["name"], "region": s["name"], "dauer": round(float(c.get("dauer") or 0), 1),
                    "windowId": f"clip-{c['id']}", "marken": ["Clip", s["name"]], "vorlage": "clip", "text": beschreibung,
                    "seite": f"https://www.twitch.tv/{s['login']}", "video": mp4.name}
            (aus / f"{stamm}.json").write_text(json.dumps(info, ensure_ascii=False, indent=1), encoding="utf-8")
            n += 1
            print(f"{s['login']}: {c['titel']!r} geschnitten", flush=True)
    print(f"{n} Clip-Videos", flush=True)


if __name__ == "__main__":
    main()
