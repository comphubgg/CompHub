// Probe: was liefert der volle Lesemodus? (siehe ReplayVoll.csproj)
using FortniteReplayReader;
using Unreal.Core.Models.Enums;
using Newtonsoft.Json;

var reader = new ReplayReader(null, ParseMode.Full);
var replay = reader.ReadReplay(args[0]);
var spieler = replay.PlayerData.Where(p => !p.IsBot).ToList();
var probe = new {
  Spieler = spieler.Count,
  MitOrten = spieler.Count(p => (p.Locations?.Count ?? 0) > 0),
  OrteJeSpieler = spieler.Select(p => p.Locations?.Count ?? 0).DefaultIfEmpty(0).Average(),
  BeispielOrte = spieler.FirstOrDefault(p => (p.Locations?.Count ?? 0) > 0)?.Locations?.Take(3),
  MitReboot = spieler.Count(p => p.RebootCounter != null && p.RebootCounter > 0),
  Zonen = replay.MapData?.SafeZones,
  Bus = replay.MapData?.BattleBusFlightPaths,
  RebootVans = replay.MapData?.RebootVans?.Count ?? -1,
};
Console.WriteLine(JsonConvert.SerializeObject(probe, Formatting.Indented,
  new JsonSerializerSettings { ReferenceLoopHandling = ReferenceLoopHandling.Ignore }));
