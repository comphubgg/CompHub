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

var probe = args.Length > 1 && args[0] == "--probe";
var datei = probe ? args[1] : args[0];
var reader = new SchadenLeser();
var replay = reader.ReadReplay(datei);
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
var schaden = reader.Je.Select(kv => new {
  id = kv.Key, gemacht = Math.Round(kv.Value.Gemacht), gemachtOhneBoden = Math.Round(reader.OhneBodenGemacht(kv.Key)), genommen = Math.Round(kv.Value.Genommen),
  treffer = kv.Value.Treffer, krit = kv.Value.Krit, schild = Math.Round(kv.Value.AufSchild),
}).ToList();

var gd = replay.GameData;
Console.WriteLine(JsonConvert.SerializeObject(new {
  version = 2,
  schaden, schadenEreignisse = reader.Ereignisse, schadenZugeordnet = reader.Zugeordnet, schadenVorDemBus = reader.VorDemBus, schadenAufBoden = reader.AufBoden,
  busAb,
  schadenRoh = reader.Roh.Count > 0 ? reader.Roh : null,
  match = gd?.GameSessionId, beginn = gd?.UtcTimeStartedMatch, ende = R(gd?.MatchEndTime),
  playlist = gd?.CurrentPlaylist, runde = gd?.TournamentRound, sieger = gd?.WinningTeam,
  karte = replay.Info?.FriendlyName, laenge = replay.Info?.LengthInMs,
  spieler, feed, zonen,
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

  protected override void OnChannelOpened(uint channelIndex, Unreal.Core.Models.NetworkGUID actor) {
    base.OnChannelOpened(channelIndex, actor);
    if (actor is not null) kanalAkteur[channelIndex] = actor.Value;
  }

  protected override void OnChannelClosed(uint channelIndex, Unreal.Core.Models.NetworkGUID actor) {
    base.OnChannelClosed(channelIndex, actor);
    if (figurKanaele.Contains(channelIndex) && Zeit() is double t) FigurEnde.Add(t);
    figurKanaele.Remove(channelIndex);
    if (kanalAkteur.TryGetValue(channelIndex, out var a) && figurVonAkteur.TryGetValue(a, out var k) && k == channelIndex) figurVonAkteur.Remove(a);
    kanalAkteur.Remove(channelIndex);
  }

  protected override void OnExportRead(uint channelIndex, INetFieldExportGroup exportGroup) {
    base.OnExportRead(channelIndex, exportGroup);
    if (exportGroup is FortniteReplayReader.Models.NetFieldExports.PlayerPawn) {
      figurKanaele.Add(channelIndex);
      if (kanalAkteur.TryGetValue(channelIndex, out var akteur)) figurVonAkteur[akteur] = channelIndex;
      return;
    }
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
    Liste.Add((von.Id.Value, an.Id.Value, c.Magnitude.Value, c.bIsCritical == true, c.bIsShield == true, Zeit()));
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
  public readonly List<(int von, int an, double hoehe, bool krit, bool schild, double? t)> Liste = new();
  /// Wann ein Spieler am Boden lag (umgehauen bis aufgestanden oder tot) - aus dem Kill-Feed.
  public Dictionary<int, List<(double ab, double bis)>> AmBoden = new();
  public double OhneBodenGemacht(int id) => ohneBoden.TryGetValue(id, out var v) ? v : 0;
  readonly Dictionary<int, double> ohneBoden = new();
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
  public void Zaehle(double? busAb) {
    foreach (var e in Liste) {
      if (busAb is not null && e.t is not null && e.t < busAb) { VorDemBus++; continue; }
      var s1 = Fuer(e.von); s1.Gemacht += e.hoehe; s1.Treffer++;
      bool amBoden = e.t is double tt && AmBoden.TryGetValue(e.an, out var zeiten) && zeiten.Any(z => tt >= z.ab && tt <= z.bis);
      if (amBoden) AufBoden++; else ohneBoden[e.von] = (ohneBoden.TryGetValue(e.von, out var alt) ? alt : 0) + e.hoehe;
      if (e.krit) s1.Krit++;
      if (e.schild) s1.AufSchild += e.hoehe;
      Fuer(e.an).Genommen += e.hoehe;
    }
  }

  static readonly FieldInfo ZeitFeld = typeof(FortniteReplayBuilder).GetField("ReplicatedWorldTimeSecondsDouble", BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Instance);
  double? Zeit() { try { return ZeitFeld?.GetValue(Bauer) as double?; } catch { return null; } }
}
