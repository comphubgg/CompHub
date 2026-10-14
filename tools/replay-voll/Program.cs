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
if (args.Length > 1 && args[0] == "--erkunden") {
  var erk = new Erkunder();
  erk.ReadReplay(args[1]);
  erk.Bericht();
  return;
}
var probe = args.Length > 1 && args[0] == "--probe";
var datei = probe ? args[1] : args[0];
/*
 * Einzelne Replays bringen die Bibliothek zum Absturz ("Index was outside the bounds of the array" in ReadNetFieldExports, 14.10.2026: drei Matches
 * der Solo Victory Cup, Runde 2). Ein schwaecherer Lesemodus hilft dabei nicht - ohne den Netzwerk-Strom gibt es keine Spieler. Der Fehler wird deshalb
 * nur klar gemeldet (Exit-Code 1), statt als Absturz des ganzen Prozesses.
 */
SchadenLeser reader;
FortniteReplay replay;
try {
  reader = new SchadenLeser();
  replay = reader.ReadReplay(datei);
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
var zusatz = reader.Zusatz(busAb, R(replay.GameData?.MatchEndTime), replay.PlayerData.Where(p => p.Id is not null && p.DeathTimeDouble is not null).ToDictionary(p => p.Id.Value, p => p.DeathTimeDouble.Value))
  .Select(kv => new { id = kv.Key, sturmSek = Math.Round(kv.Value.SturmSek, 1) }).ToList();
var schaden = reader.Je.Select(kv => new {
  id = kv.Key, gemacht = Math.Round(kv.Value.Gemacht), gemachtOhneBoden = Math.Round(reader.OhneBodenGemacht(kv.Key)), gemachtOhneFatal = Math.Round(reader.OhneFatalGemacht(kv.Key)), genommen = Math.Round(kv.Value.Genommen),
  treffer = kv.Value.Treffer, krit = kv.Value.Krit, schild = Math.Round(kv.Value.AufSchild),
}).ToList();

var gd = replay.GameData;
Console.WriteLine(JsonConvert.SerializeObject(new {
  version = 2,
  schaden, schadenEreignisse = reader.Ereignisse, schadenZugeordnet = reader.Zugeordnet, schadenVorDemBus = reader.VorDemBus, schadenAufBoden = reader.AufBoden,
  busAb,
  figuren = reader.Figuren.Select(f => new { id = f.id, t = Math.Round(f.t, 1) }).ToList(),
  schadenRoh = reader.Roh.Count > 0 ? reader.Roh : null,
  match = gd?.GameSessionId, beginn = gd?.UtcTimeStartedMatch, ende = R(gd?.MatchEndTime),
  playlist = gd?.CurrentPlaylist, runde = gd?.TournamentRound, sieger = gd?.WinningTeam,
  karte = replay.Info?.FriendlyName, laenge = replay.Info?.LengthInMs,
  spieler, feed, zonen, zusatz,
}, Formatting.None, einst));

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
  public SchadenLeser() : base(null, ParseMode.Full) { }

  public sealed class Schaden { public double Gemacht, Genommen, AufSchild; public int Treffer, Krit; }
  public readonly Dictionary<int, Schaden> Je = new();
  public int Ereignisse, Zugeordnet;

  static readonly MethodInfo VonFigur = typeof(FortniteReplayBuilder).GetMethod("TryGetPlayerDataFromPawn", BindingFlags.NonPublic | BindingFlags.Instance);
  static readonly MethodInfo VonAkteur = typeof(FortniteReplayBuilder).GetMethod("TryGetPlayerDataFromActor", BindingFlags.NonPublic | BindingFlags.Instance);

  // Die Zuordnung des Lesers ist privat - ueber Reflection.
  static readonly FieldInfo BauerFeld = typeof(ReplayReader).GetField("Builder", BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Instance);
  object Bauer => BauerFeld?.GetValue(this);

  // Die Spieler, wie der Leser sie fuehrt: je Kanal des Spielerzustands (dort liegen auch HealthSet und Co.).
  static readonly FieldInfo SpielerFeld = typeof(FortniteReplayBuilder).GetField("_players", BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Instance);
  PlayerData VomZustand(uint kanal) {
    var b = Bauer;
    if (b is null || SpielerFeld?.GetValue(b) is not Dictionary<uint, PlayerData> d) return null;
    return d.TryGetValue(kanal, out var pd) ? pd : null;
  }
  PlayerData Hole(MethodInfo m, uint wert) {
    var b = Bauer;
    if (m is null || b is null) return null;
    var a = new object[] { wert, null };
    try { return (bool)m.Invoke(b, a) ? a[1] as PlayerData : null; } catch { return null; }
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
  /// Wann ein Spieler eine neue Figur bekam (Absprung, Reboot) - fuer die Solo Clutch Points.
  public readonly List<(int id, double t)> Figuren = new();
  readonly HashSet<uint> figurGemeldet = new();

  /*
   * Zeit im Sturm je Spieler (14.10.2026): PlayerPawn.bIsInAnyStorm mit Zeitstempel, gezaehlt ab dem Start des Busses bis zum Tod, zum Ausscheiden der
   * Figur oder zum Ende. An den sechs Spielen eines Finals (Division 1 Week 4) gegen die Werte der Szene-Quelle geprueft: 100 von 100 Spielern
   * innerhalb von 2 % oder 3 Sekunden, mittlere Abweichung 0,9 s.
   *
   * Nicht uebernommen, weil die Gegenprobe es nicht traegt: Heilung und Sturmschaden aus HealthSet (zu hoch, Heilen und Schaden greifen sekundlich
   * ineinander), Schild (im Strom null), Assists und Wiederbelebungen (andere Zaehlweise), Weg (zu wenige Ortsangaben). Aufbau und Materialwerte
   * (Bauteile, Edits, Farmen) stehen in diesen Replays gar nicht im Strom.
   */
  public readonly List<(int id, double t, bool an)> SturmListe = new();
  readonly Dictionary<uint, int> figurSpieler = new();

  protected override void OnChannelOpened(uint channelIndex, Unreal.Core.Models.NetworkGUID actor) {
    base.OnChannelOpened(channelIndex, actor);
    if (actor is not null) kanalAkteur[channelIndex] = actor.Value;
  }

  protected override void OnChannelClosed(uint channelIndex, Unreal.Core.Models.NetworkGUID actor) {
    base.OnChannelClosed(channelIndex, actor);
    if (figurKanaele.Contains(channelIndex) && Zeit() is double t) FigurEnde.Add(t);
    figurKanaele.Remove(channelIndex);
    figurGemeldet.Remove(channelIndex);
    if (kanalAkteur.TryGetValue(channelIndex, out var a) && figurVonAkteur.TryGetValue(a, out var k) && k == channelIndex) figurVonAkteur.Remove(a);
    kanalAkteur.Remove(channelIndex);
    // Wird eine Figur entfernt (Tod, Reboot), endet auch ihre Zeit im Sturm.
    if (figurSpieler.Remove(channelIndex, out var fp) && Zeit() is double tc) { SturmListe.Add((fp, tc, false)); }
  }

  protected override void OnExportRead(uint channelIndex, INetFieldExportGroup exportGroup) {
    base.OnExportRead(channelIndex, exportGroup);
    if (exportGroup is FortniteReplayReader.Models.NetFieldExports.PlayerPawn pawn) {
      if (pawn.bIsInAnyStorm is bool st && Zeit() is double tz) {
        var wer = Hole(VonFigur, channelIndex);
        if (wer?.Id is int pid2) { figurSpieler[channelIndex] = pid2; SturmListe.Add((pid2, tz, st)); }
      }
      figurKanaele.Add(channelIndex);
      if (kanalAkteur.TryGetValue(channelIndex, out var akteur)) figurVonAkteur[akteur] = channelIndex;
      // Eine neue Figur fuer einen Spieler: Absprung aus dem Bus oder Reboot.
      if (!figurGemeldet.Contains(channelIndex)) {
        var wem = Hole(VonFigur, channelIndex);
        if (wem?.Id is not null && Zeit() is double tt) { Figuren.Add((wem.Id.Value, tt)); figurGemeldet.Add(channelIndex); }
      }
      return;
    }
    // (Lebenspunkte je Figur - FortRegenHealthSet - kommen in diesen Replays
    // nicht vor; geprueft am 29.9.2026. Deshalb kein Kappen auf den Rest.)
    if (exportGroup is not BatchedDamageCues c) return;
    Ereignisse++;
    if (c.HitActor is null || c.Magnitude is null || c.Magnitude <= 0) return;
    if (!figurKanaele.Contains(channelIndex)) return;
    if (!figurVonAkteur.TryGetValue(c.HitActor.Value, out var zielKanal) || !figurKanaele.Contains(zielKanal)) return;
    var von = Hole(VonFigur, channelIndex);
    var an = Hole(VonFigur, zielKanal);
    if (von?.Id is null || an?.Id is null || von.Id == an.Id) return;
    if (von.TeamIndex is not null && von.TeamIndex == an.TeamIndex) return;
    Zugeordnet++;
    Liste.Add((von.Id.Value, an.Id.Value, c.Magnitude.Value, c.bIsCritical == true, c.bIsShield == true, Zeit(), c.bIsFatal == true));
    if (Roh.Count < RohZeilen) {
      Roh.Add($"k={channelIndex} ziel={zielKanal} hit={c.HitActor} mag={c.Magnitude} krit={c.bIsCritical} schild={c.bIsShield} weg={c.bIsShieldDestroyed} fatal={c.bIsFatal} ball={c.bIsBallistic} waffe={c.bWeaponActivate} von={von.Id}/{von.TeamIndex} an={an.Id}/{an.TeamIndex}");
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
  /// Wann ein Spieler am Boden lag (umgehauen bis aufgestanden oder tot) - aus dem Kill-Feed.
  public Dictionary<int, List<(double ab, double bis)>> AmBoden = new();
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

  public sealed class Zus { public double SturmSek; }
  /// Die Zeit im Sturm je Spieler - nach dem Start des Busses, bis zum Tod (tod) oder zum Ende des Matches.
  public Dictionary<int, Zus> Zusatz(double? busAb, double? ende, Dictionary<int, double> tod) {
    var raus = new Dictionary<int, Zus>();
    Zus Z(int id) { if (!raus.TryGetValue(id, out var z)) raus[id] = z = new Zus(); return z; }
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
      bool amBoden = e.t is double tt && AmBoden.TryGetValue(e.an, out var zeiten) && zeiten.Any(z => tt >= z.ab && tt <= z.bis);
      if (amBoden) AufBoden++; else ohneBoden[e.von] = (ohneBoden.TryGetValue(e.von, out var alt) ? alt : 0) + e.hoehe;
      if (!e.fatal) ohneFatal[e.von] = (ohneFatal.TryGetValue(e.von, out var alt2) ? alt2 : 0) + e.hoehe;
      if (e.krit) s1.Krit++;
      if (e.schild) s1.AufSchild += e.hoehe;
      Fuer(e.an).Genommen += e.hoehe;
    }
  }

  static readonly FieldInfo ZeitFeld = typeof(FortniteReplayBuilder).GetField("ReplicatedWorldTimeSecondsDouble", BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Instance);
  double? Zeit() { try { return ZeitFeld?.GetValue(Bauer) as double?; } catch { return null; } }
}

/* Erkunden: welche Gruppen kommen vor, wie oft, mit welchen Werten. */
class Erkunder : ReplayReader {
  public Erkunder() : base(null, ParseMode.Full) { }
  readonly Dictionary<string, int> Zaehler = new();
  readonly Dictionary<string, List<object>> Proben = new();
  readonly Dictionary<string, Dictionary<string, double>> Stat = new();
  readonly Dictionary<string, int> Cues = new();
  readonly Dictionary<string, int> Belegt = new();
  static readonly string[] Sammeln = { "PlayerDamagedResourceBuilding", "FortClientObservedStat", "BaseBuild", "WoodFloor", "WoodRoof", "StoneWall", "MetalWall", "HealthSet", "FortPlayerState", "Bandages", "Shield", "Medkit", "ChugJug", "FortInventory", "AddMapMarker", "GameplayCueExecuted" };
  protected override void OnExportRead(uint channelIndex, INetFieldExportGroup exportGroup) {
    base.OnExportRead(channelIndex, exportGroup);
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
