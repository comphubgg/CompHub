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
using FortniteReplayReader;
using Unreal.Core.Models.Enums;
using Newtonsoft.Json;

var probe = args.Length > 1 && args[0] == "--probe";
var datei = probe ? args[1] : args[0];
var reader = new ReplayReader(null, ParseMode.Full);
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

var gd = replay.GameData;
Console.WriteLine(JsonConvert.SerializeObject(new {
  version = 1,
  match = gd?.GameSessionId, beginn = gd?.UtcTimeStartedMatch, ende = R(gd?.MatchEndTime),
  playlist = gd?.CurrentPlaylist, runde = gd?.TournamentRound, sieger = gd?.WinningTeam,
  karte = replay.Info?.FriendlyName, laenge = replay.Info?.LengthInMs,
  spieler, feed, zonen,
}, Formatting.None, einst));
