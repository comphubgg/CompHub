/*
 * Der Schnitt des Videos "Introducing: Match Replays" (gelesen von szene.html).
 * Je Abschnitt: Takte [von, bis] (1 Takt = 1,92 s), Quelle = Marke in marken.json der echten Aufnahme (tools/replays-video/seite-aufnehmen.mjs) + Versatz (ab, s)
 * und Tempo (v), Rahmen-Lage, Kamera [Sekunde im Abschnitt, x, y, Zoom] und Ringe [von, bis, x, y, Radius] in Bildpunkten der Aufnahme, dazu der Text.
 * quer: Aufnahme 2400x1600 (Ansicht 1920x1280, Faktor 1,25). hoch: 1080x1920 (Handy-Ansicht 540x960, Faktor 2).
 * Aufgenommenes Game: FNCS Solos Finals EU, Day 2, Game 6 (27.10.2026) - /replays/S42_FNCSSolo_Final_Day2_EU/6.
 *
 * Alle Aussagen aus dem Code der Seite: app/replays/page.tsx ("Every game of an evaluated cup ... The addresses never change"), ReplayAnsicht.tsx
 * (Tempo 1x/4x/16x/64x, Zonen-Ring/naechste Zone/Sturm, Fenster ueber einem Zeichen mit Platz, Punkten, Elims, durch wen, Entfernung; Kill-Feed mit
 * Waffenart, Entfernung, Elim-Zaehler, Klick springt; 3D mit Pfosten und Wand; Spielerwerte: Damage, Taken, Hits, Headshots, In Storm, Revived, Reboots;
 * Kurve der Lebenden), SpielerEbene.tsx (Spieler waehlen: Leben, Schild, Inventar - BETA), app/events/[id]/page.tsx (REPLAY-Marke im Reiter Matches).
 */
(() => {
  const TQ = { lage: [90, 310, 500] };          // Text links, Rahmen rechts (quer)
  const TH = { lage: [80, 66, 920] };          // Text oben, Handy darunter (hoch)
  const LQ = [1245, 560, 1220, -5, 0];
  const LH = [540, 1150, 760, 0, 0];
  const texte = {
    hook: { k: 'Match Replays', h: 'Every game, played back.', p: 'Rebuilt from the <b>server replay</b> of each game — zones, fights and players on the real map.' },
    ueb: { k: 'All replays', h: 'Cup. Day. Game.', p: 'Every analysed cup in one place. Each game has its own page — <b>and its address never changes.</b>' },
    play: { k: 'Playback', h: 'Watch it unfold.', p: 'Players alive, game clock, zone phase and storm timer — at <b>1×, 4×, 16× or 64×</b>.' },
    kampf: { k: 'Fights', h: 'Where every fight happened.', p: 'Every elimination is marked on the map. Hover it: <b>who, placement, points, elims — by whom and from how far.</b>' },
    spieler: { k: 'Players', h: 'Follow any player.', p: 'Click a player: <b>health, shield and inventory</b>, moving across the map. Click another to switch.', tg: 'Beta · moves between known positions' },
    zonen: { k: 'Zones', h: 'Every storm circle.', p: 'All zones of the game: the ring now, the next one dashed, the storm in purple. <b>Jump zone by zone</b> — or watch them close.' },
    d3: { k: '2D · 3D', h: 'Tilt it into 3D.', p: 'Posts for eliminations, a wall for the zone.' },
    feed: { k: 'Kill feed', h: 'The full kill feed.', p: 'Every knock and elimination — <b>weapon type, distance and elim count</b>. Click one to jump right there.' },
    werte: { k: 'Match stats', h: 'Every player, every number.', p: '<b>Damage dealt and taken, hits, headshots, time in storm, revives, reboots</b> — plus all zones and players alive over time.' },
    event: { k: 'Cup pages', h: 'Right on the cup page.', p: 'In the <b>Matches</b> tab, every game with a replay carries the <b>REPLAY</b> tag.' },
  };
  const mit = (t, l) => ({ ...t, lage: l.lage });
  // [Takte, Marke, ab, v, Text, Kamera quer, Kamera hoch, Ringe quer, Ringe hoch]
  const A = [
    [[4, 8], 'abspielen', 0.5, 1, 'hook',
      [[0, 1200, 800, 1.05], [7.7, 1200, 760, 1.25]],
      [[0, 540, 760, 1], [7.7, 540, 640, 1.15]]],
    [[8, 15], 'uebersicht', 0, 0.97, 'ueb',
      [[0, 1200, 800, 1], [6.6, 1200, 800, 1], [7.8, 1776, 680, 1.8], [9.9, 1776, 680, 1.8], [10.9, 1200, 800, 1]],
      [[0, 540, 960, 1], [7.4, 540, 960, 1], [8.4, 540, 800, 1.45], [9.9, 540, 800, 1.45], [10.9, 540, 960, 1]],
      [[8.0, 10.0, 1776, 680, 110]], [[8.6, 10.2, 540, 804, 110]]],
    [[15, 22], 'karte', -1.0, 0.92, 'play',
      [[0, 1200, 800, 1.1], [2.6, 1200, 800, 1.1], [3.6, 730, 112, 2.6], [6.4, 730, 112, 2.6], [7.4, 1200, 1400, 2.2], [10.4, 1200, 1400, 2.2], [11.6, 1200, 800, 1.1]],
      [[0, 540, 760, 1], [2.6, 540, 760, 1], [3.6, 420, 184, 2.0], [6.4, 420, 184, 2.0], [7.4, 540, 880, 1.25], [10.4, 540, 880, 1.25], [11.6, 540, 760, 1]],
      [[3.9, 6.3, 730, 112, 270], [7.8, 10.2, 954, 1336, 70]], [[3.9, 6.3, 420, 184, 260]]],
    [[22, 28], 'kampf-zoom', -0.6, 0.85, 'kampf',
      [[0, 1200, 800, 1.1], [2.7, 1200, 800, 1.1], [3.7, 1110, 800, 2.3], [10.4, 1110, 800, 2.3], [11.5, 1200, 800, 1.3]],
      [[0, 540, 760, 1], [2.7, 540, 760, 1], [3.7, 640, 520, 1.9], [10.4, 640, 520, 1.9], [11.5, 540, 760, 1.1]],
      [[3.4, 7.0, 1116, 864, 45]], []],
    [[28, 36], 'spieler-gewaehlt', -1.4, 0.92, 'spieler',
      [[0, 1200, 800, 1.1], [1.6, 1200, 800, 1.1], [2.6, 1200, 1300, 2.0], [6.0, 1200, 1300, 2.0], [7.0, 1200, 800, 1.1]],
      [[0, 540, 760, 1], [1.6, 540, 760, 1], [2.6, 540, 880, 1.2], [6.0, 540, 880, 1.2], [7.0, 540, 760, 1]],
      [[0.9, 2.3, 732, 874, 55]], []],
    [[36, 45], 'zonen-knopf', -0.3, 1.1, 'zonen',
      [[0, 1200, 800, 1], [0.9, 1000, 1150, 1.7], [5.4, 1000, 1150, 1.7], [6.4, 1200, 800, 1], [8.8, 1200, 800, 1.1], [17.2, 1200, 820, 1.25]],
      [[0, 540, 960, 1], [0.9, 640, 1060, 1.6], [5.4, 640, 1060, 1.6], [6.4, 540, 960, 1], [8.8, 540, 760, 1], [17.2, 540, 700, 1.15]],
      [[1.1, 5.5, 955, 1298, 95]], [[1.1, 5.5, 788, 1088, 85]]],
    [[45, 48], 'dreid', -1.2, 1, 'd3',
      [[0, 1200, 800, 1.05], [5.7, 1200, 820, 1.2]],
      [[0, 540, 800, 1], [5.7, 540, 700, 1.15]]],
    [[48, 56], 'killfeed', -1.0, 1, 'feed',
      [[0, 1200, 800, 1], [1.2, 720, 560, 1.9], [7.8, 720, 560, 1.9], [8.8, 1000, 500, 1.5]],
      [[0, 540, 960, 1], [1.2, 540, 800, 1.35], [15, 540, 800, 1.35]]],
    [[56, 63], 'kurve', -0.5, 0.95, 'werte',
      [[0, 1200, 780, 1.5], [4.4, 1200, 780, 1.5], [5.2, 1200, 520, 1.35], [8.6, 1200, 520, 1.35], [9.4, 1200, 1150, 1.4]],
      [[0, 540, 690, 1.5], [4.4, 540, 690, 1.5], [5.2, 540, 620, 1.3], [8.6, 540, 620, 1.3], [9.4, 540, 1240, 1.3]]],
    [[63, 69], 'event-matches', 0, 0.78, 'event',
      [[0, 1200, 800, 1], [2.2, 1200, 800, 1], [3.6, 1200, 880, 1.3]],
      [[0, 540, 960, 1], [2.2, 540, 960, 1], [3.6, 540, 900, 1.15]],
      [[5.9, 10.6, 866, 865, 70]], [[5.9, 10.6, 940, 590, 65]]],
  ];
  const bau = (hoch) => ({
    ende: 74, outro: 69,
    // Musik (ton.py): Drop beim ersten Bild der Seite, volle Drums ab der Uebersicht, Arp bis zu den Zonen, Breakdown bei 3D, Wiedereinstieg beim Kill-Feed, Outro.
    musik: { S2: 4 * 1.92, S3: 8 * 1.92, STEP0: 15 * 1.92, STEP_END: 45 * 1.92, S4: 45 * 1.92, S5: 48 * 1.92, S6: 69 * 1.92 },
    abschnitte: A.map(([takte, m, ab, v, tx, kq, kh, rq, rh]) => ({
      takte, quelle: { m, ab, v }, lage: hoch ? LH : LQ, kamera: hoch ? kh : kq, ringe: (hoch ? rh : rq) ?? [], text: mit(texte[tx], hoch ? TH : TQ),
    })),
  });
  window.SCHNITT_DATEN = { quer: bau(false), hoch: bau(true) };
})();
