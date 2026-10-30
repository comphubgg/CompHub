// Probe (30.10.2026): was das volle Replay fuer eine 2D-Ansicht wie bei Osirion hergibt - Orte je Spieler, Lebenspunkte und Schild,
// Waffe in der Hand, Loot (aufgehoben/fallen gelassen). Nur zum Erkunden:  dotnet ReplayVoll.dll --orte <datei.replay>
using System.Reflection;
using FortniteReplayReader;
using FortniteReplayReader.Models;
using Unreal.Core.Contracts;
using Unreal.Core.Models.Enums;
using Newtonsoft.Json;

class Ortsprobe : ReplayReader {
  public Ortsprobe() : base(null, ParseMode.Full) { }
  static readonly FieldInfo BauerFeld = typeof(ReplayReader).GetField("Builder", BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Instance);
  static readonly MethodInfo VonFigur = typeof(FortniteReplayBuilder).GetMethod("TryGetPlayerDataFromPawn", BindingFlags.NonPublic | BindingFlags.Instance);
  static readonly FieldInfo ZeitFeld = typeof(FortniteReplayBuilder).GetField("ReplicatedWorldTimeSecondsDouble", BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Instance);
  static readonly FieldInfo SpielerFeld = typeof(FortniteReplayBuilder).GetField("_players", BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Instance);
  object Bauer => BauerFeld?.GetValue(this);
  double Zeit() { try { return (ZeitFeld?.GetValue(Bauer) as double?) ?? -1; } catch { return -1; } }
  int? Spieler(uint kanal) {
    var b = Bauer; if (b is null || VonFigur is null) return null;
    var a = new object[] { kanal, null };
    try { if ((bool)VonFigur.Invoke(b, a)) return (a[1] as PlayerData)?.Id; } catch { }
    if (SpielerFeld?.GetValue(b) is Dictionary<uint, PlayerData> d && d.TryGetValue(kanal, out var pd)) return pd.Id;
    return null;
  }

  readonly Dictionary<uint, uint> kanalAkteur = new();
  public readonly Dictionary<string, int> Zaehl = new();
  public readonly Dictionary<int, List<double[]>> Orte = new();
  public readonly Dictionary<int, List<double[]>> Leben = new();
  public readonly Dictionary<int, List<string>> Waffen = new();
  public readonly List<string> Proben = new();
  public readonly Dictionary<uint, string> WaffeVonAkteur = new();
  public readonly List<string> Loot = new();
  readonly Dictionary<string, int> probeZahl = new();

  void Probe(string art, string text) { var n = probeZahl.GetValueOrDefault(art); if (n < 6) { Proben.Add(art + ": " + text); probeZahl[art] = n + 1; } }
  void Z(string k) => Zaehl[k] = Zaehl.GetValueOrDefault(k) + 1;
  static string Text(object o) { try { return JsonConvert.SerializeObject(o, new JsonSerializerSettings { ReferenceLoopHandling = ReferenceLoopHandling.Ignore, NullValueHandling = NullValueHandling.Ignore }); } catch { return o?.ToString(); } }

  protected override void OnChannelOpened(uint channelIndex, Unreal.Core.Models.NetworkGUID actor) {
    base.OnChannelOpened(channelIndex, actor);
    if (actor is not null) kanalAkteur[channelIndex] = actor.Value;
  }

  protected override void OnExportRead(uint ch, INetFieldExportGroup g) {
    base.OnExportRead(ch, g);
    var n = g.GetType().Name; var t = Zeit();
    var wd = g.GetType().GetProperty("WeaponData")?.GetValue(g);
    if (wd is not null && kanalAkteur.TryGetValue(ch, out var ak)) { WaffeVonAkteur[ak] = Text(wd); Z("waffeDaten"); }
    if (g is FortniteReplayReader.Models.NetFieldExports.PlayerPawn p) {
      var id = Spieler(ch);
      foreach (var (name, wert) in new (string, object)[] { ("Location", p.GetType().GetProperty("Location")?.GetValue(p)), ("Position", p.GetType().GetProperty("Position")?.GetValue(p)), ("ReplicatedMovement", p.ReplicatedMovement) }) {
        if (wert is null) continue;
        Z("ort." + name);
        Probe("ort." + name, Text(wert));
        if (id is int i && wert is Unreal.Core.Models.FVector v) { if (!Orte.TryGetValue(i, out var l)) Orte[i] = l = new(); l.Add(new[] { t, v.X, v.Y, v.Z }); }
        if (id is int i2 && wert is not Unreal.Core.Models.FVector && wert.GetType().GetProperty("Location")?.GetValue(wert) is Unreal.Core.Models.FVector m) { if (!Orte.TryGetValue(i2, out var l)) Orte[i2] = l = new(); l.Add(new[] { t, m.X, m.Y, m.Z }); }
      }
      var enc = p.GetType().GetProperty("EncryptedPawnReplayData")?.GetValue(p);
      if (enc is not null) { Z("verschluesselt"); Probe("verschluesselt", enc.GetType().FullName + " " + Text(enc).Substring(0, Math.Min(400, Text(enc).Length))); }
      var cw = p.GetType().GetProperty("CurrentWeapon")?.GetValue(p);
      if (cw is not null && id is int i3) { if (!Waffen.TryGetValue(i3, out var wl)) Waffen[i3] = wl = new(); wl.Add($"{t:0.0}|{Text(cw)}"); Probe("waffe", Text(cw)); }
      return;
    }
    if (n == "HealthSet") {
      var id = Spieler(ch);
      var hp = Convert.ToDouble(g.GetType().GetProperty("HealthCurrentValue")?.GetValue(g) ?? -1);
      var sh = Convert.ToDouble(g.GetType().GetProperty("ShieldCurrentValue")?.GetValue(g) ?? -1);
      var shm = Convert.ToDouble(g.GetType().GetProperty("ShieldMaxValue")?.GetValue(g) ?? -1);
      Z(id is null ? "leben.ohneSpieler" : "leben.mitSpieler");
      if (hp > 0 || sh > 0) Z("leben.wert");
      if (sh > 0) Z("leben.schild");
      if (id is int i) { if (!Leben.TryGetValue(i, out var l)) Leben[i] = l = new(); l.Add(new[] { t, hp, sh, shm }); }
      return;
    }
    if (n == "FortPickup") {
      var get = (string k) => g.GetType().GetProperty(k)?.GetValue(g);
      var item = get("ItemDefinition"); var ziel = get("PickupTarget"); var auf = get("bPickedUp");
      if (item is not null) Probe("loot.item", Text(item));
      if (ziel is not null) { Z("loot.aufgehoben"); if (Loot.Count < 30) Loot.Add($"{t:0.0} kanal={ch} ziel={Text(ziel)} item={Text(item)} pos={Text(get("FinalTossRestLocation") ?? get("LootFinalPosition"))}"); }
      return;
    }
  }
}
