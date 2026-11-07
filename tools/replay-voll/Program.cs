// Ein Server-Replay vollstaendig auslesen und kompakt als JSON ausgeben.
//
//   dotnet ReplayVoll.dll <datei.replay>            -> Auswertung auf stdout
//   dotnet ReplayVoll.dll --probe <datei.replay>    -> was der Leser ueberhaupt liefert
//
// Grundlage fuer die Replay-Seite (/admin/replay): die Zonen jedes Games (Mitte,
// Radius, Zeiten), der Kill-Feed mit Ort und Zeit, die Spieler mit Team, Platz,
// Todeszeit und -ort. Laufwege liefert der Leser bei aktuellen Replays nicht
// (Locations bleiben leer, geprueft am 28.9.2026 mit Globals Day 1) - deshalb
// stehen hier keine. Epic haelt ein Replay 31 Tage; was hier herauskommt,
// bleibt am Release fuer immer.
using System.Reflection;
using FortniteReplayReader;
using FortniteReplayReader.Models;
using FortniteReplayReader.Models.NetFieldExports.RPC;
using Unreal.Core.Contracts;
using Unreal.Core.Attributes;
using Unreal.Core.Models.Enums;
using Newtonsoft.Json;

// --typen: was die Bibliothek aus dem Netzwerk-Strom lesen kann (jede Klasse unter NetFieldExports mit ihren Eigenschaften) - zum Suchen nach weiteren Werten.
if (args.Length > 0 && args[0] == "--bauer") {
  var bt = typeof(FortniteReplayBuilder);
  foreach (var m in bt.GetMethods(BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)) Console.WriteLine("M " + m.Name + "(" + string.Join(", ", m.GetParameters().Select(p => p.ParameterType.Name + " " + p.Name)) + ")");
  foreach (var fl in bt.GetFields(BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)) Console.WriteLine("F " + fl.Name + " : " + fl.FieldType.ToString().Replace("System.Collections.Generic.", ""));
  return;
}
if (args.Length > 0 && args[0] == "--typen") {
  foreach (var t in typeof(FortniteReplayReader.Models.PlayerData).Assembly.GetTypes().Where(t => (t.Namespace ?? "").StartsWith("FortniteReplayReader.Models.NetFieldExports")).OrderBy(t => t.FullName)) {
    var eig = t.GetProperties().Select(p => p.Name).ToList();
    Console.WriteLine($"{t.Name}: {string.Join(", ", eig)}");
  }
  return;
}
// --erkunden: zaehlt, welche Gruppen des Netzwerk-Stroms in einem Replay vorkommen, und zeigt Beispiele (zum Suchen nach weiteren Werten je Spieler).
if (args.Length > 1 && args[0] == "--orte") {
  var op = new Ortsprobe();
  op.ReadReplay(args[1]);
  Console.WriteLine("== ZAEHLER"); foreach (var kv in op.Zaehl.OrderBy(x => x.Key)) Console.WriteLine($"{kv.Value,8} {kv.Key}");
  Console.WriteLine($"== ORTE je Spieler: {op.Orte.Count} Spieler, Median {op.Orte.Values.Select(l => l.Count).OrderBy(x => x).ElementAtOrDefault(op.Orte.Count / 2)} Orte");
  var bsp = op.Orte.OrderByDescending(kv => kv.Value.Count).FirstOrDefault();
  if (bsp.Value is not null) foreach (var o in bsp.Value.Take(25)) Console.WriteLine($"   {bsp.Key}: t={o[0]:0.0} x={o[1]:0} y={o[2]:0} z={o[3]:0}");
  Console.WriteLine($"== LEBEN je Spieler: {op.Leben.Count} Spieler, Median {op.Leben.Values.Select(l => l.Count).OrderBy(x => x).ElementAtOrDefault(op.Leben.Count / 2)} Werte");
  var lb = op.Leben.OrderByDescending(kv => kv.Value.Count).FirstOrDefault();
  if (lb.Value is not null) foreach (var o in lb.Value.Take(30)) Console.WriteLine($"   {lb.Key}: t={o[0]:0.0} hp={o[1]} schild={o[2]} max={o[3]}");
  Console.WriteLine($"== WAFFEN: {op.Waffen.Count} Spieler, {op.WaffeVonAkteur.Count} Waffen-Akteure");
  var wf = op.Waffen.OrderByDescending(kv => kv.Value.Count).FirstOrDefault();
  if (wf.Value is not null) foreach (var w in wf.Value.Take(10)) Console.WriteLine($"   {wf.Key}: {w}");
  foreach (var kv in op.WaffeVonAkteur.Take(8)) Console.WriteLine($"   akteur {kv.Key}: {kv.Value}");
  Console.WriteLine("== LOOT"); foreach (var l in op.Loot.Take(12)) Console.WriteLine("   " + l);
  Console.WriteLine($"== PFADE: {op.PfadVonAkteur.Count}");
  foreach (var g in op.Waffen.Values.SelectMany(l => l.Select(x => uint.TryParse(x.Split('|')[1], out var u) ? u : 0u)).Distinct().Take(25)) Console.WriteLine($"   waffe {g}: {op.PfadVonAkteur.GetValueOrDefault(g) ?? "?"}");
  foreach (var grp in op.PfadVonAkteur.Values.GroupBy(x => x).OrderByDescending(x => x.Count()).Take(40)) Console.WriteLine($"   {grp.Count(),6} {grp.Key}");
  Console.WriteLine("== PROBEN"); foreach (var p in op.Proben) Console.WriteLine("   " + (p.Length > 500 ? p[..500] : p));
  return;
}
if (args.Length > 1 && args[0] == "--erkunden") {
  var erk = new Erkunder();
  erk.ReadReplay(args[1]);
  erk.Bericht();
  return;
}
/*
 * Dauerlauf (7.11.2026): ein frisch gestarteter Leser laeuft die ersten Sekunden als ungeoptimierter Code - 5,6 s statt 2,9 s je Match. Mit --dienst bleibt der Prozess an: je Zeile auf stdin
 * ein Replay, das Ergebnis landet in <datei>.json, und es kommt eine Zeile zurueck. Stuerzt ein Replay ab (siehe unten), endet der Prozess; der Aufrufer startet einen neuen.
 */
if (args.Length > 0 && args[0] == "--dienst") {
  var ausgabe = Console.Out;
  while (Console.In.ReadLine() is string zeile) {
    if (zeile.Length == 0) continue;
    using (var ziel = new StreamWriter(zeile + ".json")) { Console.SetOut(ziel); EinLauf(new[] { zeile }); }
    Console.SetOut(ausgabe);
    ausgabe.WriteLine("fertig");
    ausgabe.Flush();
  }
  return;
}
EinLauf(args);

static void EinLauf(string[] args) {
var probe = args.Length > 1 && args[0] == "--probe";
var datei = probe ? args[1] : args[0];
/*
 * Einzelne Replays bringen die Bibliothek zum Absturz ("Index was outside the bounds of the array" in ReadNetFieldExports, 14.10.2026: drei Matches
 * der Solo Victory Cup, Runde 2). Ein schwaecherer Lesemodus hilft dabei nicht - ohne den Netzwerk-Strom gibt es keine Spieler. Der Fehler wird deshalb
 * nur klar gemeldet (Exit-Code 1), statt als Absturz des ganzen Prozesses.
 */
SchadenLeser reader;
FortniteReplay replay;
/*
 * Eine Wache gegen haengende Replays (26.10.2026): einzelne Matches (FNCS Solo Last Chance NAW) hielten den Leser ueber zehn Minuten fest, ohne zu enden - vier
 * Matches nacheinander blockierten so die ganze Schleife. Nach REPLAY_SEKUNDEN (Standard 150, ein gewoehnliches Match braucht 3 bis 10) endet der Prozess mit Code 3.
 */
var grenzeSek = int.TryParse(Environment.GetEnvironmentVariable("REPLAY_SEKUNDEN"), out var gs0) && gs0 > 0 ? gs0 : 150;
var wache = new System.Threading.Timer(_ => { Console.Error.WriteLine($"Zeitlimit: der Leser kam in {grenzeSek} s nicht zum Ende"); Environment.Exit(3); }, null, grenzeSek * 1000, Timeout.Infinite);
try {
  reader = new SchadenLeser();
  replay = reader.ReadReplay(datei);
  wache.Dispose();
} catch (Exception e) {
  Console.Error.WriteLine($"{e.GetType().Name}: {e.Message}");
  Environment.Exit(1);
  return;
}
var einst = new JsonSerializerSettings { ReferenceLoopHandling = ReferenceLoopHandling.Ignore, NullValueHandling = NullValueHandling.Ignore };

if (probe) {
  // Was der Leser ueberhaupt kennt: jede Eigenschaft des Replays (mit
  // Anzahl, wo es eine Sammlung ist) und des ersten Spielers mit Wert -
  // gesucht sind Schaden, Treffer, Material je Spieler (Osirion zeigt sie).
  static object Beschreibe(object? o) {
    if (o is null) return "null";
    if (o is string str) return str.Length > 80 ? str[..80] : str;
    if (o is System.Collections.ICollection c) return $"Sammlung[{c.Count}]";
    if (o is System.Collections.IEnumerable e && o is not string) { var n = 0; foreach (var _ in e) n++; return $"Folge[{n}]"; }
    return o.ToString() ?? "";
  }
  var sp = replay.PlayerData.Where(p => !p.IsBot).ToList();
  var ersteR = replay.GetType().GetProperties().ToDictionary(p => p.Name, p => { try { return Beschreibe(p.GetValue(replay)); } catch (Exception ex) { return "fehler " + ex.GetType().Name; } });
  var erster = sp.FirstOrDefault();
  var ersteS = erster?.GetType().GetProperties().ToDictionary(p => p.Name, p => { try { return Beschreibe(p.GetValue(erster)); } catch (Exception ex) { return "fehler " + ex.GetType().Name; } });
  var gs = replay.GameData;
  var ersteG = gs?.GetType().GetProperties().ToDictionary(p => p.Name, p => { try { return Beschreibe(p.GetValue(gs)); } catch (Exception ex) { return "fehler " + ex.GetType().Name; } });
  Console.WriteLine(JsonConvert.SerializeObject(new {
    Spieler = sp.Count, MitOrten = sp.Count(p => (p.Locations?.Count ?? 0) > 0),
    Zonen = replay.MapData?.SafeZones?.Count ?? -1,
    Replay = ersteR, ErsterSpieler = ersteS, Spiel = ersteG,
  }, Formatting.Indented, einst));
  return;
}

static double? R(double? v) => v.HasValue ? Math.Round(v.Value, 1) : null;

var spieler = replay.PlayerData.Select(p => new {
  id = p.Id, epic = p.EpicId?.ToLowerInvariant(), name = p.PlayerName, bot = p.IsBot ? true : (bool?)null,
  team = p.TeamIndex, platz = p.Placement, kills = p.Kills, teamKills = p.TeamKills,
  tod = R(p.DeathTimeDouble), todX = R(p.DeathLocation?.X), todY = R(p.DeathLocation?.Y),
  todUrsache = p.DeathCause, plattform = p.Platform, abbruch = p.Disconnected == true ? true : (bool?)null,
}).ToList();

var feed = replay.KillFeed.Select(k => new {
  t = R(k.ReplicatedWorldTimeSecondsDouble), opfer = k.PlayerId, taeter = k.FinisherOrDowner,
  art = k.IsRevived ? "auf" : k.IsDowned ? "unten" : "tot",
  x = R(k.DeathLocation?.X), y = R(k.DeathLocation?.Y), ursache = k.DeathCause, abstand = R(k.Distance),
}).ToList();

var zonen = (replay.MapData?.SafeZones ?? Enumerable.Empty<FortniteReplayReader.Models.SafeZone>()).Select(z => new {
  radius = R(z.Radius), naechsterRadius = R(z.NextRadius),
  x = R(z.NextCenter?.X), y = R(z.NextCenter?.Y),
  schrumpftAb = R(z.StartShrinkTime), schrumpftBis = R(z.FinishShrinkTime),
}).ToList();

// Schaden je Spieler aus den Schadens-Ereignissen (siehe SchadenLeser unten).
var busAb = (double?)replay.GameData?.AircraftStartTime ?? reader.BusErkennen(replay.PlayerData.Count(p => !p.IsBot));
// Zeiten am Boden je Spieler aus dem Kill-Feed: umgehauen -> aufgestanden oder tot.
foreach (var g in replay.KillFeed.Where(k => k.PlayerId is not null).GroupBy(k => k.PlayerId.Value)) {
  var liste = new List<(double, double)>(); double? ab = null;
  foreach (var k in g.OrderBy(k => k.ReplicatedWorldTimeSecondsDouble ?? 0)) {
    var t = k.ReplicatedWorldTimeSecondsDouble ?? 0;
    if (k.IsDowned && !k.IsRevived) { ab ??= t; continue; }
    if (ab is not null) { liste.Add((ab.Value, t)); ab = null; }
  }
  if (ab is not null) liste.Add((ab.Value, double.MaxValue));
  reader.AmBoden[g.Key] = liste;
}
reader.Zaehle(busAb);
// Ursache 50 im Kill-Feed heisst "zurueck im Spiel". Wiederbelebt: der Spieler lag davor am Boden (letzter Eintrag "umgehauen"); rebootet: er war davor
// tot (Reboot am Van, "aufgestanden"; in Modi mit Wiederkehr wie Reload der Neustart nach dem Tod).
var wiederbelebt = new Dictionary<int, int>(); var rebootet = new Dictionary<int, int>();
foreach (var g in replay.KillFeed.Where(k => k.PlayerId is not null).GroupBy(k => k.PlayerId.Value)) {
  var vorher = "";
  foreach (var k in g.OrderBy(k => k.ReplicatedWorldTimeSecondsDouble ?? 0)) {
    var art = k.IsRevived ? "auf" : k.IsDowned ? "unten" : "tot";
    if (art == "auf" || (art == "tot" && k.DeathCause == 50)) {
      if (art == "tot" && vorher == "unten") wiederbelebt[g.Key] = wiederbelebt.GetValueOrDefault(g.Key) + 1;
      else rebootet[g.Key] = rebootet.GetValueOrDefault(g.Key) + 1;
    }
    vorher = art;
  }
}
var zusatz = reader.Zusatz(busAb, R(replay.GameData?.MatchEndTime), replay.PlayerData.Where(p => p.Id is not null && p.DeathTimeDouble is not null).ToDictionary(p => p.Id.Value, p => p.DeathTimeDouble.Value), wiederbelebt, rebootet)
  .Select(kv => new { id = kv.Key, sturmSek = Math.Round(kv.Value.SturmSek, 1), wiederbelebt = kv.Value.Wiederbelebt, rebootet = kv.Value.Rebootet }).ToList();
var schaden = reader.Je.Select(kv => new {
  id = kv.Key, gemacht = Math.Round(kv.Value.Gemacht), gemachtOhneBoden = Math.Round(reader.OhneBodenGemacht(kv.Key)), gemachtOhneFatal = Math.Round(reader.OhneFatalGemacht(kv.Key)), genommen = Math.Round(kv.Value.Genommen),
  treffer = kv.Value.Treffer, krit = kv.Value.Krit, schild = Math.Round(kv.Value.AufSchild),
}).ToList();

// Der Bus (Betreiber, 29.10.2026: "die Busroute ... wo der Bus durchgeflogen ist, wo wer rausgesprungen ist"): Start, Flugrichtung (Yaw in Grad),
// Geschwindigkeit je Sekunde und die Zeiten bis Absprung-Beginn, Absprung-Ende und Flugende (Sekunden ab dem Start des Fluges).
var bus = (replay.MapData?.BattleBusFlightPaths ?? Enumerable.Empty<FortniteReplayReader.Models.BattleBus>())
  .Where(b => b.FlightStartLocation is not null)
  .Select(b => new {
    x = R(b.FlightStartLocation.X), y = R(b.FlightStartLocation.Y), yaw = R(b.FlightStartRotation?.Yaw), tempo = R(b.FlightSpeed),
    sprungAb = R(b.TimeTillDropStart), sprungBis = R(b.TimeTillDropEnd), flugBis = R(b.TimeTillFlightEnd), t = R(b.ReplicatedFlightTimestamp),
  }).Cast<object>().ToList();
// Leer bei aktuellen Replays - dann aus dem GameState (SchadenLeser.BusWerte).
if (bus.Count == 0 && reader.BusWerte.TryGetValue("FlightStartLocation", out var startObj) && startObj is Unreal.Core.Models.FVector start) {
  double? Zahl(string k) => reader.BusWerte.TryGetValue(k, out var v) ? Convert.ToDouble(v) : null;
  var dreh = reader.BusWerte.TryGetValue("FlightStartRotation", out var dr) && dr is Unreal.Core.Models.FRotator rot ? (double?)rot.Yaw : null;
  bus.Add(new {
    x = R(start.X), y = R(start.Y), yaw = R(dreh), tempo = R(Zahl("FlightSpeed")),
    sprungAb = R(Zahl("TimeTillDropStart")), sprungBis = R(Zahl("TimeTillDropEnd")), flugBis = R(Zahl("TimeTillFlightEnd")), t = R(Zahl("AircraftStartTime")),
  });
}
var gd = replay.GameData;
Console.WriteLine(JsonConvert.SerializeObject(new {
  bus = bus.Count > 0 ? bus : null,
  version = 3,
  treffer = reader.TrefferListe(busAb),
  nachgetragen = reader.Nachgetragen,
  schaden, schadenEreignisse = reader.Ereignisse, schadenZugeordnet = reader.Zugeordnet, schadenVorDemBus = reader.VorDemBus, schadenAufBoden = reader.AufBoden,
  busAb,
  figuren = reader.Figuren.Select(f => new { id = f.id, t = Math.Round(f.t, 1) }).ToList(),
  schadenRoh = reader.Roh.Count > 0 ? reader.Roh : null,
  match = gd?.GameSessionId, beginn = gd?.UtcTimeStartedMatch, ende = R(gd?.MatchEndTime),
  playlist = gd?.CurrentPlaylist, runde = gd?.TournamentRound, sieger = gd?.WinningTeam,
  karte = replay.Info?.FriendlyName, laenge = replay.Info?.LengthInMs,
  spieler, feed, zonen, zusatz,
  bau = reader.Bauten.Count > 0 ? reader.Bauten.Select(kv => new { team = kv.Key, holz = kv.Value.Holz, stein = kv.Value.Stein, metall = kv.Value.Metall, wand = kv.Value.Wand, boden = kv.Value.Boden, treppe = kv.Value.Treppe, dach = kv.Value.Dach, sonst = kv.Value.Sonst, besitzer = kv.Value.MitBesitzer, bearbeitet = kv.Value.Bearbeitet }).ToList() : null,
  // Fuer die 2D-Ansicht (30.10.2026): Orte [Zeit, x, y] und Lebenspunkte [Zeit, HP] je Spieler, Loot [Zeit, Spieler, Gegenstand, x, y, aufgehoben 1/0].
  extra = reader.ExtraFertig(replay.PlayerData.Where(p => p.Id is not null && p.TeamIndex is not null).GroupBy(p => p.Id.Value).ToDictionary(g => g.Key, g => (int)g.First().TeamIndex.Value)), inventarEintraege = reader.InventarEintraege, inventarOhneMenge = reader.InventarOhneMenge, orte = reader.Orte, leben = reader.Leben, loot = reader.Loot, lootNamen = reader.LootNamen, schuesse = reader.Schuesse, hand = reader.Hand, waffenNamen = reader.WaffenNamen, blick = reader.Blick,
}, Formatting.None, einst));
}

/*
 * Schaden je Spieler - aus den Schadens-Ereignissen des Replays.
 *
 * Der Betreiber (29.9.2026): Damage und Ratio "fuer jeden einzelnen Cup",
 * nicht nur dort, wo die Szene-Quelle Werte veroeffentlicht. Der Leser
 * kennt das Ereignis (NetMulticast_Athena_BatchedDamageCues auf der Figur
 * des Schuetzen: getroffenes Ziel, Hoehe, Kopftreffer, Schild), gibt es aber
 * nicht heraus. Hier wird es abgefangen: der Kanal nennt den Schuetzen, das
 * Ziel (HitActor) den Getroffenen; beide loest die Zuordnung des Lesers auf.
 * Treffer auf Mitspieler und auf Nicht-Spieler zaehlen nicht.
 */
class SchadenLeser : ReplayReader {
  static readonly ParseMode Modus = Enum.TryParse<ParseMode>(Environment.GetEnvironmentVariable("REPLAY_MODUS"), true, out var pm) ? pm : ParseMode.Full;
  // Die Gruppen der gebauten Teile laedt die Bibliothek nur im Modus Debug; darin bricht sie aber bei jedem unbekannten Ereignis ab. Deshalb danach zurueck.
  public SchadenLeser() : base(null, ParseMode.Debug) {
    typeof(ReplayReader).BaseType?.GetField("_parseMode", BindingFlags.NonPublic | BindingFlags.Instance)?.SetValue(this, Modus);
  }

  public sealed class Schaden { public double Gemacht, Genommen, AufSchild; public int Treffer, Krit; }
  public readonly Dictionary<int, Schaden> Je = new();
  public int Ereignisse, Zugeordnet;

  static readonly MethodInfo VonFigur = typeof(FortniteReplayBuilder).GetMethod("TryGetPlayerDataFromPawn", BindingFlags.NonPublic | BindingFlags.Instance);
  static readonly MethodInfo VonAkteur = typeof(FortniteReplayBuilder).GetMethod("TryGetPlayerDataFromActor", BindingFlags.NonPublic | BindingFlags.Instance);

  // Die Zuordnung des Lesers ist privat - ueber Reflection.
  static readonly FieldInfo BauerFeld = typeof(ReplayReader).GetField("Builder", BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Instance);
  object Bauer => BauerFeld?.GetValue(this);
  FortniteReplayBuilder bauerFest;
  FortniteReplayBuilder BauerSchnell => bauerFest ??= Bauer as FortniteReplayBuilder;
  delegate bool SpielerSuche(FortniteReplayBuilder b, uint wert, out PlayerData p);
  static readonly SpielerSuche FigurSuche = VonFigur.CreateDelegate<SpielerSuche>();
  static readonly SpielerSuche AkteurSuche = VonAkteur.CreateDelegate<SpielerSuche>();

  // Die Spieler, wie der Leser sie fuehrt: je Kanal des Spielerzustands (dort liegen auch HealthSet und Co.).
  static readonly FieldInfo SpielerFeld = typeof(FortniteReplayBuilder).GetField("_players", BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Instance);
  PlayerData VomZustand(uint kanal) {
    var b = Bauer;
    if (b is null || SpielerFeld?.GetValue(b) is not Dictionary<uint, PlayerData> d) return null;
    return d.TryGetValue(kanal, out var pd) ? pd : null;
  }
  PlayerData Hole(MethodInfo m, uint wert) {
    var b = BauerSchnell;
    var suche = m == VonFigur ? FigurSuche : m == VonAkteur ? AkteurSuche : null;
    if (suche is null || b is null) return null;
    try { return suche(b, wert, out var p) ? p : null; } catch { return null; }
  }
  Schaden Fuer(int id) { if (!Je.TryGetValue(id, out var s)) Je[id] = s = new Schaden(); return s; }

  static readonly int RohZeilen = int.TryParse(Environment.GetEnvironmentVariable("SCHADEN_ROH"), out var n) ? n : 0;
  public readonly List<string> Roh = new();

  /*
   * Welche Kanaele gerade Spielerfiguren tragen - selbst gefuehrt.
   *
   * Die Zuordnung des Lesers (Kanal -> Spieler) bleibt stehen, wenn ein
   * Kanal geschlossen und fuer ein anderes Objekt wiederverwendet wird. Erste
   * Gegenprobe am 29.9.2026: so landeten Spitzhackenschlaege auf Baeume und
   * Waende (50 und 100 je Schlag) bei Spielern, und der Schaden lag um ein
   * Vielfaches zu hoch. Gezaehlt wird jetzt nur, wo beide Seiten in diesem
   * Moment eine Spielerfigur sind.
   */
  readonly Dictionary<uint, uint> kanalAkteur = new();
  readonly HashSet<uint> figurKanaele = new();
  readonly Dictionary<uint, uint> figurVonAkteur = new();
  /*
   * Welche Figur (Akteur-Kennung) zu welchem Spieler gehoerte - dauerhaft (28.10.2026). Trifft ein Schuss eine Figur, deren Kanal gerade geschlossen ist
   * (sie war fuer die Aufzeichnung kurz nicht relevant), ging der Treffer verloren: an den FNCS Solos Finals Day 2 EU fehlten so im Median 9 % des Schadens.
   * Die Kennung einer Figur wird nicht fuer ein anderes Objekt wiederverwendet (anders als der Kanal - siehe oben); mit ihr: Median 97,7 % von Epics Wert.
   */
  readonly Dictionary<uint, int> spielerVonAkteur = new();
  /// Wann ein Spieler eine neue Figur bekam (Absprung, Reboot) - fuer die Solo Clutch Points.
  public readonly List<(int id, double t)> Figuren = new();
  readonly HashSet<uint> figurGemeldet = new();

  /*
   * Zeit im Sturm je Spieler (14.10.2026): PlayerPawn.bIsInAnyStorm mit Zeitstempel, gezaehlt ab dem Start des Busses bis zum Tod, zum Ausscheiden der
   * Figur oder zum Ende. An den sechs Spielen eines Finals (Division 1 Week 4) gegen die Werte der Szene-Quelle geprueft: 100 von 100 Spielern
   * innerhalb von 2 % oder 3 Sekunden, mittlere Abweichung 0,9 s.
   *
   * Wiederbelebt und Rebootet (14.10.2026): der Kill-Feed fuehrt beides mit der Ursache 50 - ein Spieler, der vom Boden wieder aufsteht (Eintrag "tot"
   * mit Ursache 50, kein Tod), und einer, der nach seinem Tod per Reboot zurueckkommt (Eintrag "auf"). Gegen "rebootsAndRevives" der Szene-Quelle
   * (die Summe aus beidem, gezaehlt beim Zurueckgeholten) an drei Finals geprueft: Duo EU 47 gegen 46, 99 von 100 Spielern genau gleich; Duo NAC
   * 61 gegen 62, 99 von 100; Trio-Event NAC 91 gegen 92, 98 von 99; Solo 0 gegen 0.
   *
   * Nicht uebernommen, weil die Gegenprobe es nicht traegt: Heilung (nur bei Duo-Finals passend, Solo 16 %, Trio 9 % daneben), Sturmschaden aus
   * Sturmzeit mal Rate (4,6 % mittlere Abweichung, die Raten je Phase lassen sich nicht sauber festlegen), Schaden erlitten aus HealthSet, Schild
   * (im Strom null), Assists (je nach Zeitfenster 40 bis 68 von 100 Spielern genau, keine eindeutige Zaehlweise), Weg (zu wenige Ortsangaben:
   * die Positionen der Figuren sind in EncryptedPawnReplayData verschluesselt). Ein 3,5 MB grosser Ereignisblock "sessionG0" je Match ist nicht lesbar und unbekannten
   * Inhalts - ihn zu entschluesseln ist nicht Sache dieses Werkzeugs. Material, Schuesse und gelungene Edits stehen offen im Strom (siehe InventarAbschliessen).
   */
  public readonly List<(int id, double t, bool an)> SturmListe = new();
  readonly HashSet<int> imSturm = new();
  readonly Dictionary<uint, int> figurSpieler = new();

  protected override void OnChannelOpened(uint channelIndex, Unreal.Core.Models.NetworkGUID actor) {
    base.OnChannelOpened(channelIndex, actor);
    if (actor is not null) kanalAkteur[channelIndex] = actor.Value;
    BauMerken(channelIndex);
    // Der Bauplan hinter dem Kanal (B_SMG_BoneRattler_Athena_C, DefaultBuildingTool_C ...) - so wird aus PlayerPawn.CurrentWeapon die Waffe in der Hand.
    try {
      var ak = Channels[channelIndex]?.Actor;
      var arch = ak?.GetType().GetProperty("Archetype")?.GetValue(ak);
      var archWert = arch?.GetType().GetProperty("Value")?.GetValue(arch);
      var karte = PfadKarte();
      if (actor is not null && archWert is not null && karte is not null && karte.Contains(archWert)) pfadVonAkteur[actor.Value] = karte[archWert]?.ToString();
    } catch { }
  }
  readonly Dictionary<uint, string> pfadVonAkteur = new();

  /*
   * Gebaute Teile (Betreiber, 5.11.2026: "Build Placed, Holz, Metal getrennt"). Jedes Teil ist ein Akteur mit dem Bauplan PBWA_<W|S|M>1_<Form>; die Gruppen dazu liest die
   * Bibliothek nur im Modus Debug (siehe Konstruktor). Gezaehlt wird beim ersten Export, der ein Team traegt, und nur, was ein Spieler gesetzt hat.
   */
  public sealed class Bau { public int Holz, Stein, Metall, Wand, Boden, Treppe, Dach, Sonst, MitBesitzer, Bearbeitet; }
  public readonly Dictionary<int, Bau> Bauten = new();
  readonly Dictionary<uint, (char stoff, string form)> bauKanal = new();
  readonly HashSet<uint> bauGezaehlt = new();
  static readonly System.Text.RegularExpressions.Regex BauMuster = new("PBWA_([WSM])1_([A-Za-z]+)");
  void BauMerken(uint kanal) {
    bauKanal.Remove(kanal); bauGezaehlt.Remove(kanal);
    try {
      var ak = Channels[kanal]?.Actor;
      var arch = ak?.GetType().GetProperty("Archetype")?.GetValue(ak);
      var wert = arch?.GetType().GetProperty("Value")?.GetValue(arch);
      var karte = PfadKarte();
      if (wert is null || karte is null || !karte.Contains(wert)) return;
      var m = BauMuster.Match(karte[wert]?.ToString() ?? "");
      if (m.Success) bauKanal[kanal] = (m.Groups[1].Value[0], m.Groups[2].Value);
    } catch { }
  }
  void BauNotieren(uint kanal, INetFieldExportGroup g) {
    if (!bauKanal.TryGetValue(kanal, out var teil)) return;
    var t = g.GetType();
    if (t.GetProperty("TeamIndex")?.GetValue(g) is not object teamWert) return;
    var team = Convert.ToInt32(teamWert);
    if (!Bauten.TryGetValue(team, out var b)) Bauten[team] = b = new Bau();
    if (t.GetProperty("EditingPlayer")?.GetValue(g) is not null) b.Bearbeitet++;
    if (!bauGezaehlt.Add(kanal)) return;
    if (t.GetProperty("bPlayerPlaced")?.GetValue(g) is bool gesetzt && !gesetzt) return;
    if (teil.stoff == 'W') b.Holz++; else if (teil.stoff == 'S') b.Stein++; else b.Metall++;
    if (teil.form.Contains("Floor") || teil.form.StartsWith("Balcony")) b.Boden++;
    else if (teil.form.StartsWith("Stair")) b.Treppe++;
    else if (teil.form.StartsWith("Roof")) b.Dach++;
    else if (teil.form is "Solid" or "Brace" or "HalfWall" or "HalfWallS" or "QuarterWallS" || teil.form.Contains("Window") || teil.form.Contains("Door") || teil.form.Contains("Archway")) b.Wand++;
    else b.Sonst++;
    if (t.GetProperty("OwnerPersistentID")?.GetValue(g) is not null) b.MitBesitzer++;
  }
  static readonly FieldInfo CacheFeld = typeof(ReplayReader).BaseType?.GetField("_netGuidCache", BindingFlags.NonPublic | BindingFlags.Instance);
  System.Collections.IDictionary PfadKarte() {
    var cache = CacheFeld?.GetValue(this);
    return cache?.GetType().GetProperty("NetGuidToPathName")?.GetValue(cache) as System.Collections.IDictionary;
  }
  /// Waffe in der Hand je Spieler [Zeit, Nr in WaffenNamen]; Blickrichtung [Zeit, Yaw in Grad].
  public readonly Dictionary<int, List<double[]>> Hand = new();
  public readonly Dictionary<int, List<double[]>> Blick = new();
  public readonly List<string> WaffenNamen = new();
  readonly Dictionary<string, int> waffenIndex = new();
  void HandNotieren(int id, double t, object waffe) {
    var w = waffe is uint u ? u : waffe?.GetType().GetProperty("Value")?.GetValue(waffe) is uint u2 ? u2 : 0u;
    if (w == 0 || !pfadVonAkteur.TryGetValue(w, out var pfad) || pfad is null) return;
    if (!waffenIndex.TryGetValue(pfad, out var nr)) { nr = WaffenNamen.Count; WaffenNamen.Add(pfad); waffenIndex[pfad] = nr; }
    if (!Hand.TryGetValue(id, out var l)) Hand[id] = l = new();
    if (l.Count > 0 && l[^1][1] == nr) return;
    l.Add(new[] { Math.Round(t, 1), nr });
  }
  void BlickNotieren(int id, double t, double yaw) {
    if (!Blick.TryGetValue(id, out var l)) Blick[id] = l = new();
    var y = Math.Round(((yaw % 360) + 360) % 360);
    if (l.Count > 0 && (t - l[^1][0] < 0.5 || l[^1][1] == y)) return;
    l.Add(new[] { Math.Round(t, 1), y });
  }

  protected override void OnChannelClosed(uint channelIndex, Unreal.Core.Models.NetworkGUID actor) {
    base.OnChannelClosed(channelIndex, actor);
    if (figurKanaele.Contains(channelIndex) && Zeit() is double t) FigurEnde.Add(t);
    figurKanaele.Remove(channelIndex);
    figurGemeldet.Remove(channelIndex);
    lootNameVonKanal.Remove(channelIndex); lootLageVonKanal.Remove(channelIndex);
    if (kanalAkteur.TryGetValue(channelIndex, out var a) && figurVonAkteur.TryGetValue(a, out var k) && k == channelIndex) figurVonAkteur.Remove(a);
    kanalAkteur.Remove(channelIndex);
    // Wird eine Figur entfernt (Tod, Reboot), endet auch ihre Zeit im Sturm.
    if (figurSpieler.Remove(channelIndex, out var fp) && Zeit() is double tc) { SturmListe.Add((fp, tc, false)); }
  }

  /*
   * Der Bus aus dem Spielzustand (29.10.2026): die Bibliothek fuellt MapData.BattleBusFlightPaths bei aktuellen Replays nicht, der GameState traegt
   * aber Start, Drehung, Tempo und die Zeiten bis Absprung-Beginn, -Ende und Flugende. Je Eigenschaft gilt der letzte belegte Wert.
   */
  public readonly Dictionary<string, object> BusWerte = new();

  /*
   * Die 2D-Ansicht wie bei Osirion (Betreiber, 30.10.2026: "mindestens HP und wie man schiesst ... Loot auch"). Am FNCS Solos Finale EU Day 2, Game 1
   * nachgesehen, was der Strom hergibt:
   *   Orte       PlayerPawn.Location / ReplicatedMovement - schubweise (Median 79 je Spieler und Match), dazu jeder Ort, an dem er Loot aufhebt.
   *              Die laufenden Bewegungsdaten stecken verschluesselt in EncryptedPawnReplayData; die Ansicht verbindet die Orte deshalb geradlinig.
   *   Leben      HealthSet.HealthCurrentValue je Spieler (Median ~190 Werte, jeder Sturm-Tick). Der Schild steht dort immer auf 0 - er fehlt im Strom.
   *   Loot       FortPickup: Gegenstand (WID_..., Munition, Material), wo er lag, wer ihn aufhob (PickupTarget) und wer ihn fallen liess.
   * Schuesse sind die Treffer (TrefferListe): Schuetze, Ziel, Schaden, Kopftreffer.
   */
  public readonly Dictionary<int, List<double[]>> Orte = new();
  public readonly Dictionary<int, List<double[]>> Leben = new();
  public readonly List<double[]> Loot = new();
  public readonly List<string> LootNamen = new();
  readonly Dictionary<string, int> lootIndex = new();
  readonly HashSet<string> lootGesehen = new();

  void OrtNotieren(int id, double t, double x, double y) {
    if (!Orte.TryGetValue(id, out var l)) Orte[id] = l = new();
    // Hoechstens ein Ort je Sekunde - die Schuebe liefern Dutzende in einer Sekunde, die Ansicht braucht davon einen.
    if (l.Count > 0 && t - l[^1][0] < 1) return;
    l.Add(new[] { Math.Round(t, 1), Math.Round(x), Math.Round(y) });
  }

  /// Je Spieler: [frei, frei, Bauzustand 1: Anzahl, Sekunden, Bauzustand 2: Anzahl, Sekunden]. Bauzustand 1 ist das Editieren: im Performance-Finale 1,5 / 0,9 / 1,2 s je Edit, Osirion 2 / 1 / 1 s.
  public readonly Dictionary<int, double[]> Extra = new();
  double[] ExtraVon(int id) => Extra.TryGetValue(id, out var e) ? e : (Extra[id] = new double[19]);

  /*
   * Das Inventar jedes Spielers (7.11.2026). Fortnite fuehrt es seit dem neuen Item-System nicht mehr in FortInventory, sondern in /Script/ItemizationCoreRuntime.Inventory: offen im Strom,
   * nichts davon ist verschluesselt, die Bibliothek kennt es nur nicht. Je Gegenstand steht in DataList eine Liste von Bausteinen, jeder beginnt mit der Objekt-Kennung seines Typs:
   * ItemComponentData_StackSize ist die Menge, FortItemComponentData_LoadedAmmo die Munition im Magazin. Die Kennungen wechseln je Replay, deshalb werden sie ueber ihren Namen gesucht.
   */
  public Dictionary<int, double[]> ExtraFertig(Dictionary<int, int> teamVon) { InventarAbschliessen(teamVon); return Extra; }
  public const int ExtraGesammelt = 6, ExtraGefarmt = 9, ExtraSchuesse = 12, ExtraEditsOk = 13, ExtraBauten = 14, ExtraSturm = 17, ExtraBusfahrer = 18;
  readonly Dictionary<uint, List<uint>> inventarFiguren = new();
  readonly Dictionary<string, int> inventarStand = new();
  readonly Dictionary<string, int> inventarLage = new();
  readonly List<(uint wurzel, double t, int stoff, int menge)> matsSchritte = new();
  readonly List<(uint wurzel, int schuesse)> schussSchritte = new();
  uint stapelTyp, ladungTyp;
  public int InventarEintraege, InventarOhneMenge;

  static uint Bits(byte[] b, int ab, int anzahl) {
    uint w = 0;
    for (int k = 0; k < anzahl; k++) { int q = ab + k; if (((b[q >> 3] >> (q & 7)) & 1) != 0) w |= 1u << k; }
    return w;
  }
  // Eine gepackte Zahl ab einem beliebigen Bit; Rueckgabe: gelesene Bits, 0 wenn sie nicht passt.
  static int Gepackt(byte[] b, int ab, int ende, out uint wert) {
    wert = 0; int p = ab;
    for (int n = 0; n < 3; n++) {
      if (p + 8 > ende) return 0;
      var by = Bits(b, p, 8); p += 8; wert |= (by >> 1) << (7 * n);
      if ((by & 1) == 0) return p - ab;
    }
    return 0;
  }
  void TypenSuchen(byte[] b, int ende) {
    if (stapelTyp != 0 && ladungTyp != 0) return;
    for (int i = 0; i + 8 <= ende; i++) {
      if (Gepackt(b, i, ende, out var w) == 0 || w < 100) continue;
      if (!_netGuidCache.TryGetPathName(w, out var pfad)) continue;
      if (pfad == "ItemComponentData_StackSize") stapelTyp = w;
      else if (pfad == "FortItemComponentData_LoadedAmmo") ladungTyp = w;
    }
  }
  /*
   * Der Wert hinter einer Typ-Kennung. Gesucht wird ueber alle Bitlagen, weil die Bausteine je Gegenstand anders sortiert sind; zufaellig gleiche Bitfolgen fallen durch die Obergrenze heraus.
   * Bleiben mehrere uebrig, gilt die Stelle, an der derselbe Gegenstand zuletzt stand.
   */
  int? WertHinter(byte[] b, int ende, uint typ, int grenze, string schluessel) {
    if (typ == 0) return null;
    int? wert = null, stelle = null; var zahl = 0;
    inventarLage.TryGetValue(schluessel, out var zuletzt);
    for (int i = 0; i + 40 <= ende; i++) {
      var n = Gepackt(b, i, ende, out var w);
      if (n == 0 || w != typ || i + n + 32 > ende) continue;
      var v = Bits(b, i + n, 32);
      if (v > grenze) continue;
      zahl++;
      if (wert is null || i == zuletzt) { wert = (int)v; stelle = i; }
    }
    if (stelle is int s) inventarLage[schluessel] = s;
    return wert;
  }
  protected override void OnNetDeltaRead(uint channelIndex, Unreal.Core.Models.NetDeltaUpdate update) {
    base.OnNetDeltaRead(channelIndex, update);
    if (update.Export is not InventarEintrag g || g.DataList is null) return;
    InventarEintraege++;
    var wurzel = Channels[channelIndex]?.Actor?.ActorNetGUID?.Value ?? 0;
    var name = g.ItemDefinition?.Name;
    if (wurzel == 0 || name is null) return;
    name = name.Split('/').Last().Split('.').Last();
    var daten = g.DataList.Bytes; var ende = g.DataList.TotalBits;
    TypenSuchen(daten, ende);
    var stoff = name.StartsWith("WoodItemData") ? 0 : name.StartsWith("StoneItemData") ? 1 : name.StartsWith("MetalItemData") ? 2 : -1;
    var schluessel = wurzel + ":" + g.A + ":" + g.B;
    if (stoff >= 0) {
      var menge = WertHinter(daten, ende, stapelTyp, 20000, "s" + schluessel);
      if (menge is not int m) { InventarOhneMenge++; return; }
      inventarStand.TryGetValue("s" + schluessel, out var alt);
      inventarStand["s" + schluessel] = m;
      if (m != alt && Zeit() is double t) matsSchritte.Add((wurzel, t, stoff, m - alt));
      return;
    }
    // Nur Waffen: auch Trinkbares wie Agile Chug hat eine Ladung, die beim Benutzen sinkt.
    if (ladungTyp == 0 || !name.StartsWith("WID_") || name.Contains("Chug") || name.Contains("Consumable")) return;
    if (WertHinter(daten, ende, ladungTyp, 2000, "l" + schluessel) is not int ladung) return;
    var da = inventarStand.TryGetValue("l" + schluessel, out var vor);
    inventarStand["l" + schluessel] = ladung;
    if (da && ladung < vor) schussSchritte.Add((wurzel, vor - ladung));
  }
  int? SpielerDerWurzel(uint wurzel) {
    if (!inventarFiguren.TryGetValue(wurzel, out var l)) return null;
    foreach (var f in l) if (spielerVonAkteur.TryGetValue(f, out var id)) return id;
    return null;
  }
  bool MitSpitzhacke(int id, double t) {
    if (!Hand.TryGetValue(id, out var l) || l.Count == 0) return false;
    int a = 0, z = l.Count - 1;
    while (a < z) { var m = (a + z + 1) / 2; if (l[m][0] <= t) a = m; else z = m - 1; }
    var nr = (int)l[a][1];
    return nr >= 0 && nr < WaffenNamen.Count && System.Text.RegularExpressions.Regex.IsMatch(WaffenNamen[nr] ?? "", "Pickaxe|Melee", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
  }
  static bool Zwischen(List<double> l, double von, double bis) {
    var i = l.BinarySearch(von); if (i < 0) i = ~i;
    return i < l.Count && l[i] <= bis;
  }
  /*
   * Rechnet die Inventar-Schritte auf die Spieler um; einmal nach dem Lesen, wenn alle Figuren bekannt sind. Die Regeln sind an den vier Spielen des Performance-Finales gegen Osirion geprueft
   * (Darm, Charyy, demus; Holz, Stein, Metall je Spieler), die Mengen selbst sind exakt, nur ihre Einordnung ist geschaetzt:
   * - Rueckgabe: ein Plus in Zehnern bis 2 s nach einem Minus ist ein abgebrochener Bau und zaehlt weder als Bau noch als Gewinn.
   * - Gefarmt: das Plus liegt bis 0,5 s nach oder 0,3 s vor einem Spitzhackenschlag. Faellt dazu ein Aufheben in die Zeit (das Aufgehobene kommt 0,4 bis 1,1 s spaeter an), zaehlen nur Mengen bis 30.
   * - Ein Minus ab 70 ist Hinwerfen, kein Bau. Was das Team binnen 30 s davon wieder aufhebt, ist nur weitergereicht und zaehlt nicht als gesammelt (Darm: Holz +68 % ohne diese Regel).
   * - Gesammelt ist alles andere. Osirion fuehrt beides getrennt. Im Finale im Mittel daneben: Gefarmt 6 %, Gesammelt 15 %, Builds 4 %.
   */
  const double WurfAb = 70, WurfFrist = 30;
  public void InventarAbschliessen(Dictionary<int, int> teamVon) {
    var axt = new Dictionary<int, List<double>>();
    foreach (var s in Schuesse) {
      var id = (int)s[1];
      if (!MitSpitzhacke(id, s[0])) continue;
      if (!axt.TryGetValue(id, out var l)) axt[id] = l = new();
      l.Add(s[0]);
    }
    foreach (var l in axt.Values) l.Sort();
    var auf = new Dictionary<(int, int), List<double>>();
    foreach (var e in Loot) {
      if (e[5] != 1) continue;
      var name = LootNamen[(int)e[2]];
      var stoff = name.Contains("WoodItem") ? 0 : name.Contains("StoneItem") ? 1 : name.Contains("MetalItem") ? 2 : -1;
      if (stoff < 0) continue;
      if (!auf.TryGetValue(((int)e[1], stoff), out var l)) auf[((int)e[1], stoff)] = l = new();
      l.Add(e[0]);
    }
    foreach (var l in auf.Values) l.Sort();
    var schritte = new Dictionary<(int, int), List<double[]>>();
    foreach (var (wurzel, t, stoff, menge) in matsSchritte) {
      if (SpielerDerWurzel(wurzel) is not int id) continue;
      if (!schritte.TryGetValue((id, stoff), out var l)) schritte[(id, stoff)] = l = new();
      l.Add(new[] { t, menge });
    }
    var leer = new List<double>();
    var jeTeam = new Dictionary<(int, int), List<(double t, double m, int id)>>();
    foreach (var ((id, stoff), l) in schritte) {
      for (int i = 0; i < l.Count; i++) {
        if (l[i][1] <= 0 || l[i][1] % 10 != 0) continue;
        for (int j = i - 1; j >= 0 && l[i][0] - l[j][0] <= 2 && l[i][1] > 0; j--) {
          if (l[j][1] >= 0) continue;
          var k = Math.Min(l[i][1], -l[j][1]); l[i][1] -= k; l[j][1] += k;
        }
      }
      var team = teamVon.TryGetValue(id, out var tm) ? tm : -id;
      if (!jeTeam.TryGetValue((team, stoff), out var tl)) jeTeam[(team, stoff)] = tl = new();
      foreach (var x in l) if (x[1] != 0) tl.Add((x[0], x[1], id));
    }
    foreach (var ((_, stoff), l) in jeTeam) {
      // Im Team hingeworfene Mats (je Team und Stoff), aus denen ein Aufheben kurz danach bedient wird.
      var geworfen = new List<double[]>();
      foreach (var (t, m, id) in l.OrderBy(x => x.t)) {
        var e = ExtraVon(id);
        if (m < 0) {
          if (-m >= WurfAb) geworfen.Add(new[] { t, -m });
          else if (-m % 10 == 0) e[ExtraBauten + stoff] += -m / 10;
          continue;
        }
        var schlaege = axt.GetValueOrDefault(id) ?? leer; var aufgehoben = auf.GetValueOrDefault((id, stoff)) ?? leer;
        if (Zwischen(schlaege, t - 0.5, t + 0.3) && (m <= 30 || !Zwischen(aufgehoben, t - 1.1, t - 0.4))) { e[ExtraGefarmt + stoff] += m; continue; }
        var rest = m;
        foreach (var w in geworfen) {
          if (rest <= 0) break;
          if (t - w[0] > WurfFrist || w[1] <= 0) continue;
          var k = Math.Min(rest, w[1]); w[1] -= k; rest -= k;
        }
        e[ExtraGesammelt + stoff] += rest;
      }
    }
    foreach (var (wurzel, schuesse) in schussSchritte) if (SpielerDerWurzel(wurzel) is int id) ExtraVon(id)[ExtraSchuesse] += schuesse;
  }

  /*
   * Gelungene Edits: NetMulticast_SuccessfulBuildingEdit ist ein Aufruf ohne Werte auf der Figur. Die Bibliothek ueberspringt Felder ohne Inhalt, bevor sie sie auswertet; deshalb wird er
   * schon beim Lesen des Feldkopfs gezaehlt. Performance-Finale: 408 / 501 / 369 zu Osirions 364 / 492 / 353.
   */
  uint bunchKanal;
  public override bool ReceivedReplicatorBunch(Unreal.Core.Models.DataBunch bunch, Unreal.Core.FBitArchive archive, uint? repObject, bool bHasRepLayout) {
    bunchKanal = bunch.ChIndex;
    return base.ReceivedReplicatorBunch(bunch, archive, repObject, bHasRepLayout);
  }
  public override bool ReadFieldHeaderAndPayload(Unreal.Core.FBitArchive archive, Unreal.Core.Models.NetFieldExportGroup group, out Unreal.Core.Models.NetFieldExport outField, out uint? payload) {
    var weiter = base.ReadFieldHeaderAndPayload(archive, group, out outField, out payload);
    if (weiter && outField?.Name == "NetMulticast_SuccessfulBuildingEdit" && Hole(VonFigur, bunchKanal)?.Id is int id) ExtraVon(id)[ExtraEditsOk] += 1;
    return weiter;
  }
  readonly Dictionary<uint, (int zustand, double seit)> bauZustand = new();
  void BauZustandNotieren(uint kanal, FortniteReplayReader.Models.NetFieldExports.PlayerPawn g) {
    if (g.BuildingState is not int neu || Zeit() is not double t) return;
    var id = Hole(VonFigur, kanal)?.Id;
    if (id is not int i) return;
    var e = ExtraVon(i);
    if (bauZustand.TryGetValue(kanal, out var alt) && alt.zustand != neu) {
      if (alt.zustand == 1) e[3] += t - alt.seit;
      if (alt.zustand == 2) e[5] += t - alt.seit;
    }
    if (!bauZustand.TryGetValue(kanal, out var vor) || vor.zustand != neu) {
      if (neu == 1) e[2] += 1;
      if (neu == 2) e[4] += 1;
      bauZustand[kanal] = (neu, t);
    }
  }

  void LebenNotieren(uint kanal, INetFieldExportGroup g) {
    if (Zeit() is not double t) return;
    var id = Hole(VonFigur, kanal)?.Id ?? VomZustand(kanal)?.Id;
    if (id is not int i) return;
    var hp = g.GetType().GetProperty("HealthCurrentValue")?.GetValue(g);
    if (hp is null) return;
    var wert = Math.Round(Convert.ToDouble(hp));
    if (!Leben.TryGetValue(i, out var l)) Leben[i] = l = new();
    if (l.Count > 0 && l[^1][1] == wert) return;
    // Sturmschaden: Lebenspunkte, die im Sturm verloren gehen, je Schlag hoechstens 10 (mehr ist ein Treffer). Am Boden blutet man aus, das zaehlt nicht.
    if (l.Count > 0 && wert < l[^1][1] && l[^1][1] - wert <= 10 && imSturm.Contains(i) && !AmBodenZuZeit(i, t)) ExtraVon(i)[ExtraSturm] += l[^1][1] - wert;
    l.Add(new[] { Math.Round(t, 1), wert });
  }

  int LootNr(string name) {
    if (!lootIndex.TryGetValue(name, out var n)) { n = LootNamen.Count; LootNamen.Add(name); lootIndex[name] = n; }
    return n;
  }

  /// Aufgehoben: [Zeit, Spieler, Gegenstand, x, y, 1]; fallen gelassen: [..., 0].
  void LootNotieren(uint kanal, INetFieldExportGroup g) {
    if (Zeit() is not double t) return;
    object Wert(string k) { try { return g.GetType().GetProperty(k)?.GetValue(g); } catch { return null; } }
    var name = Wert("ItemDefinition")?.GetType().GetProperty("Name")?.GetValue(Wert("ItemDefinition")) as string;
    if (name is not null) lootNameVonKanal[kanal] = name;
    else lootNameVonKanal.TryGetValue(kanal, out name);
    var lage = (Wert("FinalTossRestLocation") ?? Wert("LootFinalPosition")) as Unreal.Core.Models.FVector;
    if (lage is not null) lootLageVonKanal[kanal] = lage;
    else lootLageVonKanal.TryGetValue(kanal, out lage);
    void Eintrag(object figur, int auf) {
      var akteur = figur is uint or int or long ? figur : figur?.GetType().GetProperty("Value")?.GetValue(figur);
      if (akteur is null || name is null || lage is null) return;
      if (!spielerVonAkteur.TryGetValue(Convert.ToUInt32(akteur), out var sid)) return;
      var schluessel = $"{kanal}|{akteur}|{auf}|{name}";
      if (!lootGesehen.Add(schluessel)) return;
      Loot.Add(new[] { Math.Round(t, 1), sid, LootNr(name), Math.Round(lage.X), Math.Round(lage.Y), auf });
      if (auf == 1) OrtNotieren(sid, t, lage.X, lage.Y);
    }
    Eintrag(Wert("PickupTarget"), 1);
    Eintrag(Wert("PawnWhoDroppedPickup"), 0);
  }
  /*
   * Wohin jemand schiesst: jeder Einschlag mit Ort - auf Spieler (Location, dort steht in dem Moment auch das Ziel) und auf Bauteile, Baeume, Autos
   * (NonPlayerLocation). [Zeit, Schuetze, x, y, Schaden, Art: 0 Bauteil/Umgebung, 1 Spieler, 2 Spieler Kopftreffer].
   */
  public readonly List<double[]> Schuesse = new();
  void SchussNotieren(uint kanal, BatchedDamageCues c) {
    if (!figurKanaele.Contains(kanal) || Zeit() is not double t) return;
    if (Hole(VonFigur, kanal)?.Id is not int von) return;
    if (c.NonPlayerLocation is Unreal.Core.Models.FVector nl && (c.NonPlayerMagnitude ?? 0) > 0)
      Schuesse.Add(new[] { Math.Round(t, 1), von, Math.Round(nl.X), Math.Round(nl.Y), Math.Round(c.NonPlayerMagnitude ?? 0), 0 });
    if (c.Location is Unreal.Core.Models.FVector pl && c.HitActor is not null && (c.Magnitude ?? 0) > 0) {
      var aufSpieler = spielerVonAkteur.TryGetValue(c.HitActor.Value, out var ziel) && ziel != von;
      Schuesse.Add(new[] { Math.Round(t, 1), von, Math.Round(pl.X), Math.Round(pl.Y), Math.Round(c.Magnitude ?? 0), aufSpieler ? (c.bIsCritical == true ? 2 : 1) : 0 });
      if (aufSpieler) OrtNotieren(ziel, t, pl.X, pl.Y);
    }
  }

  readonly Dictionary<uint, string> lootNameVonKanal = new();
  readonly Dictionary<uint, Unreal.Core.Models.FVector> lootLageVonKanal = new();

  static readonly string[] BusFelder = { "FlightStartLocation", "FlightStartRotation", "FlightSpeed", "TimeTillDropStart", "TimeTillDropEnd", "TimeTillFlightEnd", "AircraftStartTime" };

  protected override void OnExportRead(uint channelIndex, INetFieldExportGroup exportGroup) {
    base.OnExportRead(channelIndex, exportGroup);
    if (exportGroup.GetType().Name == "GameState") {
      foreach (var f in BusFelder) {
        try { var v = exportGroup.GetType().GetProperty(f)?.GetValue(exportGroup); if (v is not null) BusWerte[f] = v; } catch { }
      }
    }
    if (exportGroup is FortniteReplayReader.Models.NetFieldExports.FortPlayerState fs && fs.bThankedBusDriver == true && VomZustand(channelIndex)?.Id is int dankt) ExtraVon(dankt)[ExtraBusfahrer] = 1;
    if (exportGroup is InventarWurzel iw) {
      if (iw.ReplayPawn is > 0 && Channels[channelIndex]?.Actor?.ActorNetGUID?.Value is uint wg) {
        if (!inventarFiguren.TryGetValue(wg, out var fl)) inventarFiguren[wg] = fl = new();
        if (!fl.Contains(iw.ReplayPawn.Value)) fl.Add(iw.ReplayPawn.Value);
      }
      return;
    }
    if (exportGroup is FortniteReplayReader.Models.NetFieldExports.PlayerPawn pawn) {
      BauZustandNotieren(channelIndex, pawn);
      if (pawn.bIsInAnyStorm is bool st && Zeit() is double tz) {
        var wer = Hole(VonFigur, channelIndex);
        if (wer?.Id is int pid2) { figurSpieler[channelIndex] = pid2; SturmListe.Add((pid2, tz, st)); if (st) imSturm.Add(pid2); else imSturm.Remove(pid2); }
      }
      figurKanaele.Add(channelIndex);
      if (kanalAkteur.TryGetValue(channelIndex, out var akteur)) { figurVonAkteur[akteur] = channelIndex; var wer0 = Hole(VonFigur, channelIndex); if (wer0?.Id is int sid) { spielerVonAkteur[akteur] = sid; teamVonSpieler[sid] = wer0.TeamIndex; } }
      // Eine neue Figur fuer einen Spieler: Absprung aus dem Bus oder Reboot.
      if (!figurGemeldet.Contains(channelIndex)) {
        var wem = Hole(VonFigur, channelIndex);
        if (wem?.Id is not null && Zeit() is double tt) { Figuren.Add((wem.Id.Value, tt)); figurGemeldet.Add(channelIndex); }
      }
      // Orte der Figur fuer die 2D-Ansicht (siehe OrtNotieren).
      var ort = pawn.Location ?? pawn.ReplicatedMovement?.Location;
      if (ort is not null && Zeit() is double to && Hole(VonFigur, channelIndex)?.Id is int oid) OrtNotieren(oid, to, ort.X, ort.Y);
      if (Zeit() is double th && Hole(VonFigur, channelIndex)?.Id is int hid) {
        if (pawn.CurrentWeapon is uint cw) HandNotieren(hid, th, cw);
        var rot = pawn.Rotation ?? pawn.ReplicatedMovement?.Rotation;
        if (rot is not null) BlickNotieren(hid, th, Convert.ToDouble(rot.Yaw));
      }
      return;
    }
    if (bauKanal.ContainsKey(channelIndex)) { BauNotieren(channelIndex, exportGroup); return; }
    if (exportGroup.GetType().Name == "HealthSet") { LebenNotieren(channelIndex, exportGroup); return; }
    if (exportGroup.GetType().Name == "FortPickup") { LootNotieren(channelIndex, exportGroup); return; }
    // (Lebenspunkte je Figur - FortRegenHealthSet - kommen in diesen Replays
    // nicht vor; geprueft am 29.9.2026. Deshalb kein Kappen auf den Rest.)
    if (exportGroup is not BatchedDamageCues c) return;
    Ereignisse++;
    SchussNotieren(channelIndex, c);
    if (c.HitActor is null || c.Magnitude is null || c.Magnitude <= 0) return;
    if (!figurKanaele.Contains(channelIndex)) return;
    var von = Hole(VonFigur, channelIndex);
    int? anId = null; int? anTeam = null;
    if (figurVonAkteur.TryGetValue(c.HitActor.Value, out var zielKanal) && figurKanaele.Contains(zielKanal)) { var an0 = Hole(VonFigur, zielKanal); anId = an0?.Id; anTeam = an0?.TeamIndex; }
    else if (spielerVonAkteur.TryGetValue(c.HitActor.Value, out var sid2)) { anId = sid2; anTeam = teamVonSpieler.TryGetValue(sid2, out var tv) ? tv : null; Nachgetragen++; }
    if (von?.Id is null || anId is null || von.Id == anId) return;
    if (von.TeamIndex is not null && von.TeamIndex == anTeam) return;
    Zugeordnet++;
    Liste.Add((von.Id.Value, anId.Value, c.Magnitude.Value, c.bIsCritical == true, c.bIsShield == true, Zeit(), c.bIsFatal == true));
    if (Roh.Count < RohZeilen) {
      Roh.Add($"k={channelIndex} ziel={zielKanal} hit={c.HitActor} mag={c.Magnitude} krit={c.bIsCritical} schild={c.bIsShield} weg={c.bIsShieldDestroyed} fatal={c.bIsFatal} ball={c.bIsBallistic} waffe={c.bWeaponActivate} von={von.Id}/{von.TeamIndex} an={anId}/{anTeam}");
    }
  }

  /*
   * Erst nach dem Start des Busses zaehlen.
   *
   * Auf der Aufwaerminsel vor dem Bus schiessen sich die Spieler gegenseitig
   * an - das zaehlt in keiner Statistik. In der zweiten Gegenprobe (29.9.2026)
   * stand ein Spieler mit dutzenden 24er- und 48er-Treffern auf denselben
   * Gegner da, bevor das Spiel ueberhaupt begonnen hatte.
   */
  public readonly List<(int von, int an, double hoehe, bool krit, bool schild, double? t, bool fatal)> Liste = new();
  public int Nachgetragen;
  readonly Dictionary<int, int?> teamVonSpieler = new();
  /// Wann ein Spieler am Boden lag (umgehauen bis aufgestanden oder tot) - aus dem Kill-Feed.
  public Dictionary<int, List<(double ab, double bis)>> AmBoden = new();
  /*
   * Der Schuss, der umhaut, traf einen stehenden Gegner: er steht im Replay aber fast zeitgleich mit dem Knock und galt deshalb als "am Boden" (6.11.2026). Im Trios-Match waren das 48 %
   * der aussortierten Treffer; beim Performance Cup fehlten uns gegen Osirion genau 50 %. Solo aendert sich nicht, dort gibt es keine Knocks.
   */
  const double KnockSchussSek = 0.3;
  bool AmBodenZuZeit(int id, double t) => AmBoden.TryGetValue(id, out var zeiten) && zeiten.Any(z => t > z.ab + KnockSchussSek && t <= z.bis);
  public double OhneBodenGemacht(int id) => ohneBoden.TryGetValue(id, out var v) ? v : 0;
  readonly Dictionary<int, double> ohneBoden = new();
  readonly Dictionary<int, double> ohneFatal = new();
  public double OhneFatalGemacht(int id) => ohneFatal.TryGetValue(id, out var v) ? v : 0;
  public int AufBoden;
  /// Wann Spielerfiguren verschwanden - beim Einsteigen in den Bus fast alle zugleich.
  public readonly List<double> FigurEnde = new();

  /*
   * Den Start des Busses erkennen: der fruehste Zeitpunkt, ab dem binnen
   * zehn Sekunden mindestens die Haelfte aller Spielerfiguren verschwindet.
   * Epics eigene Angabe (AircraftStartTime) steht in diesen Replays nicht.
   */
  public double? BusErkennen(int spielerZahl) {
    if (spielerZahl <= 0 || FigurEnde.Count == 0) return null;
    var z = FigurEnde.OrderBy(x => x).ToList();
    for (int i = 0, j = 0; i < z.Count; i++) {
      while (j < z.Count && z[j] - z[i] <= 10) j++;
      if (j - i >= spielerZahl / 2.0) return z[i];
    }
    return null;
  }
  public int VorDemBus;

  public sealed class Zus { public double SturmSek; public int Wiederbelebt, Rebootet; }
  /// Die Zeit im Sturm je Spieler - nach dem Start des Busses, bis zum Tod (tod) oder zum Ende des Matches; dazu wie oft er vom Boden wiederbelebt
  /// (wiederbelebt) und nach dem Tod per Reboot zurueckgeholt (rebootet) wurde - aus dem Kill-Feed, Ursache 50.
  public Dictionary<int, Zus> Zusatz(double? busAb, double? ende, Dictionary<int, double> tod, Dictionary<int, int> wiederbelebt, Dictionary<int, int> rebootet) {
    var raus = new Dictionary<int, Zus>();
    Zus Z(int id) { if (!raus.TryGetValue(id, out var z)) raus[id] = z = new Zus(); return z; }
    foreach (var kv in wiederbelebt) Z(kv.Key).Wiederbelebt = kv.Value;
    foreach (var kv in rebootet) Z(kv.Key).Rebootet = kv.Value;
    double Schluss(int id) => tod.TryGetValue(id, out var t) ? t : (ende ?? double.MaxValue);
    foreach (var g in SturmListe.GroupBy(x => x.id)) {
      double? seit = null;
      foreach (var e in g.OrderBy(x => x.t)) {
        if (e.an && seit is null) seit = Math.Max(e.t, busAb ?? e.t);
        else if (!e.an && seit is not null) { Z(g.Key).SturmSek += Math.Max(0, Math.Min(e.t, Schluss(g.Key)) - seit.Value); seit = null; }
      }
      if (seit is not null) Z(g.Key).SturmSek += Math.Max(0, Schluss(g.Key) - seit.Value);
    }
    return raus;
  }

  public void Zaehle(double? busAb) {
    foreach (var e in Liste) {
      if (busAb is not null && e.t is not null && e.t < busAb) { VorDemBus++; continue; }
      var s1 = Fuer(e.von); s1.Gemacht += e.hoehe; s1.Treffer++;
      bool amBoden = e.t is double tt && AmBodenZuZeit(e.an, tt);
      if (amBoden) AufBoden++; else ohneBoden[e.von] = (ohneBoden.TryGetValue(e.von, out var alt) ? alt : 0) + e.hoehe;
      if (!e.fatal) ohneFatal[e.von] = (ohneFatal.TryGetValue(e.von, out var alt2) ? alt2 : 0) + e.hoehe;
      if (e.krit) s1.Krit++;
      if (e.schild) s1.AufSchild += e.hoehe;
      Fuer(e.an).Genommen += e.hoehe;
    }
  }

  /// Jeder zugeordnete Treffer nach dem Bus, kompakt fuer die Replay-Ansicht ("wer hat wen angeschossen", Betreiber 28.10.2026):
  /// [Zeit, Schuetze, Ziel, Schaden, Kopftreffer 0/1, Ziel am Boden 0/1, toedlich 0/1, auf den Schild 0/1].
  public List<double[]> TrefferListe(double? busAb) {
    var raus = new List<double[]>();
    foreach (var e in Liste) {
      if (e.t is not double t || (busAb is not null && t < busAb)) continue;
      bool amBoden = AmBodenZuZeit(e.an, t);
      raus.Add(new[] { Math.Round(t, 1), e.von, e.an, Math.Round(e.hoehe), e.krit ? 1 : 0, amBoden ? 1 : 0, e.fatal ? 1 : 0, e.schild ? 1 : 0 });
    }
    return raus;
  }

  static readonly FieldInfo ZeitFeld = typeof(FortniteReplayBuilder).GetField("ReplicatedWorldTimeSecondsDouble", BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Instance);
  static readonly Func<FortniteReplayBuilder, double?> ZeitLesen = ZeitLeser();
  static Func<FortniteReplayBuilder, double?> ZeitLeser() {
    var b = System.Linq.Expressions.Expression.Parameter(typeof(FortniteReplayBuilder));
    return System.Linq.Expressions.Expression.Lambda<Func<FortniteReplayBuilder, double?>>(System.Linq.Expressions.Expression.Field(b, ZeitFeld), b).Compile();
  }
  double? Zeit() { var b = BauerSchnell; return b is null ? null : ZeitLesen(b); }
}

/* Erkunden: welche Gruppen kommen vor, wie oft, mit welchen Werten. */
class Erkunder : ReplayReader {
  // Die Gruppen fuer gebaute Teile laedt die Bibliothek nur im Modus Debug - dort bricht sie aber bei jedem unbekannten Ereignis ab. Deshalb nach dem Aufbau zurueck auf Full.
  public Erkunder() : base(null, Environment.GetEnvironmentVariable("LESEMODUS") == "debug" ? ParseMode.Debug : ParseMode.Full) {
    if (Environment.GetEnvironmentVariable("LESEMODUS") != "debug") return;
    for (var t = GetType(); t is not null; t = t.BaseType) {
      foreach (var f in t.GetFields(BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)) {
        if (f.FieldType == typeof(ParseMode)) { Console.Error.WriteLine("Feld " + t.Name + "." + f.Name); f.SetValue(this, ParseMode.Full); }
      }
      foreach (var q in t.GetProperties(BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)) {
        if (q.PropertyType == typeof(ParseMode) && q.CanWrite) { Console.Error.WriteLine("Eigenschaft " + t.Name + "." + q.Name); q.SetValue(this, ParseMode.Full); }
      }
    }
  }
  readonly Dictionary<string, int> Zaehler = new();
  readonly Dictionary<string, List<object>> Proben = new();
  readonly Dictionary<string, Dictionary<string, double>> Stat = new();
  readonly Dictionary<string, int> Cues = new();
  readonly Dictionary<string, int> Belegt = new();
  static readonly string[] Sammeln = { "PlayerDamagedResourceBuilding", "FortClientObservedStat", "BaseBuild", "WoodFloor", "WoodRoof", "StoneWall", "MetalWall", "HealthSet", "FortPlayerState", "Bandages", "Shield", "Medkit", "ChugJug", "FortInventory", "AddMapMarker", "GameplayCueExecuted" };
  // Wie viele Akteure je Bauplan wirklich vorkommen: eine Klasse im Verzeichnis heisst noch nicht, dass sie im Strom gelesen werden kann.
  readonly Dictionary<string, int> Akteure = new();
  protected override void OnChannelOpened(uint channelIndex, Unreal.Core.Models.NetworkGUID actor) {
    base.OnChannelOpened(channelIndex, actor);
    try {
      var ak = Channels[channelIndex]?.Actor;
      var arch = ak?.GetType().GetProperty("Archetype")?.GetValue(ak);
      var wert = arch?.GetType().GetProperty("Value")?.GetValue(arch);
      var cache = typeof(ReplayReader).BaseType?.GetField("_netGuidCache", BindingFlags.NonPublic | BindingFlags.Instance)?.GetValue(this);
      var karte = cache?.GetType().GetProperty("NetGuidToPathName")?.GetValue(cache) as System.Collections.IDictionary;
      var pfad = wert is not null && karte is not null && karte.Contains(wert) ? karte[wert]?.ToString() ?? "?" : "?";
      pfad = pfad.Split('/').Last();
      Akteure[pfad] = Akteure.GetValueOrDefault(pfad) + 1;
    } catch { }
  }
  // Was im Strom steht, auch wenn die Bibliothek es nicht auswertet: alle Klassen samt Feldern und alle Objektpfade. Der Zwischenspeicher wird am Ende geleert, deshalb unterwegs.
  readonly Dictionary<string, List<string>> Klassen = new();
  readonly Dictionary<string, int> Pfade = new();
  int gelesen;
  void Schnappschuss() {
    var cache = typeof(ReplayReader).BaseType?.GetField("_netGuidCache", BindingFlags.NonPublic | BindingFlags.Instance)?.GetValue(this);
    if (cache is null) return;
    if (cache.GetType().GetProperty("NetFieldExportGroupMap")?.GetValue(cache) is System.Collections.IDictionary karte) {
      foreach (System.Collections.DictionaryEntry e in karte) {
        var namen = new List<string>();
        if (e.Value?.GetType().GetProperty("NetFieldExports")?.GetValue(e.Value) is System.Collections.IEnumerable felder)
          foreach (var f in felder) { var n = f?.GetType().GetProperty("Name")?.GetValue(f)?.ToString(); if (n is not null) namen.Add(n); }
        Klassen[e.Key.ToString()] = namen;
      }
    }
    if (cache.GetType().GetProperty("NetGuidToPathName")?.GetValue(cache) is System.Collections.IDictionary pfade) {
      Pfade.Clear();
      foreach (System.Collections.DictionaryEntry e in pfade) {
        var kurz = System.Text.RegularExpressions.Regex.Replace((e.Value?.ToString() ?? "").Split('/', '.').Last(), @"[_0-9]+$", "");
        Pfade[kurz] = Pfade.GetValueOrDefault(kurz) + 1;
      }
    }
  }
  protected override void OnExportRead(uint channelIndex, INetFieldExportGroup exportGroup) {
    base.OnExportRead(channelIndex, exportGroup);
    if (++gelesen % 50000 == 0) Schnappschuss();
    var n = exportGroup.GetType().Name;
    Zaehler[n] = Zaehler.GetValueOrDefault(n) + 1;
    // Welche Eigenschaften tragen wirklich Werte (nicht null) - je Gruppe gezaehlt.
    if (n == "PlayerPawn" || n == "HealthSet" || n == "FortPlayerState" || n == "FortPickup") {
      foreach (var p in exportGroup.GetType().GetProperties()) {
        try { if (p.GetValue(exportGroup) is not null) { var k = n + "." + p.Name; Belegt[k] = Belegt.GetValueOrDefault(k) + 1; } } catch { }
      }
    }
    if (n == "FortClientObservedStat") {
      var t = exportGroup.GetType();
      var name = t.GetProperty("StatName")?.GetValue(exportGroup)?.ToString() ?? "?";
      var wert = Convert.ToDouble(t.GetProperty("StatValue")?.GetValue(exportGroup) ?? 0);
      var d = Stat.TryGetValue(name, out var dd) ? dd : (Stat[name] = new() { ["n"] = 0, ["summe"] = 0, ["max"] = 0 });
      d["n"]++; d["summe"] += wert; d["max"] = Math.Max(d["max"], wert);
    }
    if (n.StartsWith("GameplayCue")) {
      var tag = exportGroup.GetType().GetProperty("GameplayCueTag")?.GetValue(exportGroup)?.ToString() ?? "?";
      Cues[n + ":" + tag] = Cues.GetValueOrDefault(n + ":" + tag) + 1;
    }
    if (Sammeln.Contains(n)) {
      if (!Proben.TryGetValue(n, out var l)) Proben[n] = l = new();
      if (l.Count < 4) l.Add(new { kanal = channelIndex, werte = exportGroup });
    }
  }
  public void Bericht() {
    var einst = new JsonSerializerSettings { ReferenceLoopHandling = ReferenceLoopHandling.Ignore, NullValueHandling = NullValueHandling.Ignore };
    Console.WriteLine($"== AKTEURE ({Akteure.Values.Sum()})");
    foreach (var kv in Akteure.OrderByDescending(x => x.Value).Take(150)) Console.WriteLine($"A {kv.Value} {kv.Key}");
    Console.WriteLine($"== KLASSEN IM STROM ({Klassen.Count})");
    foreach (var k in Klassen.OrderBy(x => x.Key)) Console.WriteLine($"K {k.Key} [{k.Value.Count}] {string.Join(",", k.Value.Take(70))}");
    Console.WriteLine($"== OBJEKTPFADE ({Pfade.Count})");
    foreach (var kv in Pfade.OrderByDescending(x => x.Value).Take(500)) Console.WriteLine($"P {kv.Value} {kv.Key}");
    Console.WriteLine("== GRUPPEN (Anzahl)");
    foreach (var kv in Zaehler.OrderByDescending(x => x.Value)) Console.WriteLine($"{kv.Value,8}  {kv.Key}");
    Console.WriteLine("== FortClientObservedStat (Name: Anzahl, Summe, Max)");
    foreach (var kv in Stat.OrderBy(x => x.Key)) Console.WriteLine($"  {kv.Key}: n={kv.Value["n"]}, summe={kv.Value["summe"]}, max={kv.Value["max"]}");
    Console.WriteLine("== GameplayCues");
    foreach (var kv in Cues.OrderByDescending(x => x.Value).Take(40)) Console.WriteLine($"{kv.Value,8}  {kv.Key}");
    Console.WriteLine("== BELEGTE EIGENSCHAFTEN (Gruppe.Name: Anzahl der Aktualisierungen mit Wert)");
    foreach (var kv in Belegt.OrderBy(x => x.Key)) Console.WriteLine($"{kv.Value,8}  {kv.Key}");
    Console.WriteLine("== PROBEN");
    foreach (var kv in Proben) {
      Console.WriteLine("-- " + kv.Key);
      foreach (var p in kv.Value) { var j = JsonConvert.SerializeObject(p, Formatting.None, einst); Console.WriteLine("   " + (j.Length > 700 ? j[..700] + "..." : j)); }
    }
  }
}

/* Das neue Inventar (siehe SchadenLeser): die Gegenstaende eines Spielers und die Wurzel, die sagt, zu welcher Figur es gehoert. */
[NetFieldExportGroup("/Script/ItemizationCoreRuntime.Inventory", ParseMode.Full)]
public class InventarEintrag : INetFieldExportGroup {
  [NetFieldExport("ItemDefinition", RepLayoutCmdType.Property)] public Unreal.Core.Models.ItemDefinition ItemDefinition { get; set; }
  [NetFieldExport("A", RepLayoutCmdType.PropertyUInt32)] public uint? A { get; set; }
  [NetFieldExport("B", RepLayoutCmdType.PropertyUInt32)] public uint? B { get; set; }
  [NetFieldExport("DataList", RepLayoutCmdType.Property)] public Unreal.Core.Models.DebuggingObject DataList { get; set; }
}
[NetFieldExportGroup("/Script/FortniteGame.FortRootItemizationInventory", ParseMode.Full)]
public class InventarWurzel : INetFieldExportGroup {
  [NetFieldExport("ReplayPawn", RepLayoutCmdType.PropertyObject)] public uint? ReplayPawn { get; set; }
}
[NetFieldExportClassNetCache("Inventory_ClassNetCache", ParseMode.Full)]
public class InventarListe { [NetFieldExportRPC("ItemEntryData", "/Script/ItemizationCoreRuntime.Inventory", false, true, false)] public InventarEintrag ItemEntryData { get; set; } }

/*
 * Gebaute Teile aus Stein und Metall: die Bibliothek bringt Gruppen nur fuer Holz und fuer Stein- und Metallwaende mit (5.11.2026 am Replay geprueft). Der Rest steht hier.
 */
public abstract class BauGruppe : INetFieldExportGroup {
  [NetFieldExport("TeamIndex", RepLayoutCmdType.Enum)] public int? TeamIndex { get; set; }
  [NetFieldExport("bPlayerPlaced", RepLayoutCmdType.PropertyBool)] public bool? bPlayerPlaced { get; set; }
  [NetFieldExport("OwnerPersistentID", RepLayoutCmdType.PropertyUInt32)] public uint? OwnerPersistentID { get; set; }
}
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Metal/L1/PBWA_M1_Archway.PBWA_M1_Archway_C", ParseMode.Full)] public class Bau_M1_Archway : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Metal/L1/PBWA_M1_ArchwayLarge.PBWA_M1_ArchwayLarge_C", ParseMode.Full)] public class Bau_M1_ArchwayLarge : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Metal/L1/PBWA_M1_ArchwayLargeSupport.PBWA_M1_ArchwayLargeSupport_C", ParseMode.Full)] public class Bau_M1_ArchwayLargeSupport : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Metal/L1/PBWA_M1_BalconyI.PBWA_M1_BalconyI_C", ParseMode.Full)] public class Bau_M1_BalconyI : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Metal/L1/PBWA_M1_BalconyO.PBWA_M1_BalconyO_C", ParseMode.Full)] public class Bau_M1_BalconyO : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Metal/L1/PBWA_M1_BalconyS.PBWA_M1_BalconyS_C", ParseMode.Full)] public class Bau_M1_BalconyS : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Metal/L1/PBWA_M1_Brace.PBWA_M1_Brace_C", ParseMode.Full)] public class Bau_M1_Brace : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Metal/L1/PBWA_M1_DoorSide.PBWA_M1_DoorSide_C", ParseMode.Full)] public class Bau_M1_DoorSide : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Metal/L1/PBWA_M1_Floor.PBWA_M1_Floor_C", ParseMode.Full)] public class Bau_M1_Floor : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Metal/L1/PBWA_M1_HalfWall.PBWA_M1_HalfWall_C", ParseMode.Full)] public class Bau_M1_HalfWall : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Metal/L1/PBWA_M1_RoofC.PBWA_M1_RoofC_C", ParseMode.Full)] public class Bau_M1_RoofC : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Metal/L1/PBWA_M1_RoofD.PBWA_M1_RoofD_C", ParseMode.Full)] public class Bau_M1_RoofD : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Metal/L1/PBWA_M1_RoofI.PBWA_M1_RoofI_C", ParseMode.Full)] public class Bau_M1_RoofI : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Metal/L1/PBWA_M1_RoofO.PBWA_M1_RoofO_C", ParseMode.Full)] public class Bau_M1_RoofO : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Metal/L1/PBWA_M1_RoofS.PBWA_M1_RoofS_C", ParseMode.Full)] public class Bau_M1_RoofS : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Metal/L1/PBWA_M1_RoofWall.PBWA_M1_RoofWall_C", ParseMode.Full)] public class Bau_M1_RoofWall : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Metal/L1/PBWA_M1_StairF.PBWA_M1_StairF_C", ParseMode.Full)] public class Bau_M1_StairF : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Metal/L1/PBWA_M1_StairW.PBWA_M1_StairW_C", ParseMode.Full)] public class Bau_M1_StairW : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Metal/L1/PBWA_M1_WindowC.PBWA_M1_WindowC_C", ParseMode.Full)] public class Bau_M1_WindowC : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Metal/L1/PBWA_M1_WindowSide.PBWA_M1_WindowSide_C", ParseMode.Full)] public class Bau_M1_WindowSide : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Stone/L1/PBWA_S1_ArchwayLarge.PBWA_S1_ArchwayLarge_C", ParseMode.Full)] public class Bau_S1_ArchwayLarge : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Stone/L1/PBWA_S1_ArchwayLargeSupport.PBWA_S1_ArchwayLargeSupport_C", ParseMode.Full)] public class Bau_S1_ArchwayLargeSupport : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Stone/L1/PBWA_S1_BalconyI.PBWA_S1_BalconyI_C", ParseMode.Full)] public class Bau_S1_BalconyI : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Stone/L1/PBWA_S1_BalconyO.PBWA_S1_BalconyO_C", ParseMode.Full)] public class Bau_S1_BalconyO : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Stone/L1/PBWA_S1_BalconyS.PBWA_S1_BalconyS_C", ParseMode.Full)] public class Bau_S1_BalconyS : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Stone/L1/PBWA_S1_Brace.PBWA_S1_Brace_C", ParseMode.Full)] public class Bau_S1_Brace : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Stone/L1/PBWA_S1_DoorC.PBWA_S1_DoorC_C", ParseMode.Full)] public class Bau_S1_DoorC : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Stone/L1/PBWA_S1_DoorSide.PBWA_S1_DoorSide_C", ParseMode.Full)] public class Bau_S1_DoorSide : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Stone/L1/PBWA_S1_Floor.PBWA_S1_Floor_C", ParseMode.Full)] public class Bau_S1_Floor : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Stone/L1/PBWA_S1_HalfWallS.PBWA_S1_HalfWallS_C", ParseMode.Full)] public class Bau_S1_HalfWallS : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Stone/L1/PBWA_S1_QuarterWallS.PBWA_S1_QuarterWallS_C", ParseMode.Full)] public class Bau_S1_QuarterWallS : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Stone/L1/PBWA_S1_RoofC.PBWA_S1_RoofC_C", ParseMode.Full)] public class Bau_S1_RoofC : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Stone/L1/PBWA_S1_RoofD.PBWA_S1_RoofD_C", ParseMode.Full)] public class Bau_S1_RoofD : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Stone/L1/PBWA_S1_RoofI.PBWA_S1_RoofI_C", ParseMode.Full)] public class Bau_S1_RoofI : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Stone/L1/PBWA_S1_RoofO.PBWA_S1_RoofO_C", ParseMode.Full)] public class Bau_S1_RoofO : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Stone/L1/PBWA_S1_RoofS.PBWA_S1_RoofS_C", ParseMode.Full)] public class Bau_S1_RoofS : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Stone/L1/PBWA_S1_RoofWall.PBWA_S1_RoofWall_C", ParseMode.Full)] public class Bau_S1_RoofWall : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Stone/L1/PBWA_S1_StairF.PBWA_S1_StairF_C", ParseMode.Full)] public class Bau_S1_StairF : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Stone/L1/PBWA_S1_StairW.PBWA_S1_StairW_C", ParseMode.Full)] public class Bau_S1_StairW : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Stone/L1/PBWA_S1_WindowsC.PBWA_S1_WindowsC_C", ParseMode.Full)] public class Bau_S1_WindowsC : BauGruppe { }
[NetFieldExportGroup("/Game/Building/ActorBlueprints/Player/Stone/L1/PBWA_S1_WindowsSide.PBWA_S1_WindowsSide_C", ParseMode.Full)] public class Bau_S1_WindowsSide : BauGruppe { }
