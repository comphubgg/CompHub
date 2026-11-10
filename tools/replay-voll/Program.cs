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
var wache = new System.Threading.Timer(_ => { Console.Error.WriteLine($"Zeitlimit: der Leser kam in {grenzeSek} s nicht zum Ende (Rahmen {SchadenLeser.Rahmen}, Block {SchadenLeser.Bloecke}, defekt {SchadenLeser.Defekt})"); Environment.Exit(3); }, null, grenzeSek * 1000, Timeout.Infinite);
try {
  reader = new SchadenLeser();
  SchadenLeser.EffektEinklinken(reader);
  replay = reader.ReadReplay(datei);
  wache.Dispose();

} catch (Exception e) {
  Console.Error.WriteLine(Environment.GetEnvironmentVariable("LESER_STAPEL") == "1" ? e.ToString() : $"{e.GetType().Name}: {e.Message}");
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
    if (k.IsDowned && !k.IsRevived) { if (ab is null && k.FinisherOrDowner is int kd) reader.Knocker[(g.Key, Math.Round(t, 2))] = kd; ab ??= t; continue; }
    if (ab is not null) { liste.Add((ab.Value, t)); ab = null; }
  }
  if (ab is not null) liste.Add((ab.Value, double.MaxValue));
  reader.AmBoden[g.Key] = liste;
}
reader.Zaehle(busAb);
if (SchadenLeser.DiagId is int pruefId) reader.Pruefbericht(pruefId, busAb);
if (SchadenLeser.DiagId is not null) reader.FelderZeigen("ClientRemote|HitMarker|DamagedResource|Harvest|Marker");
reader.Tode = replay.KillFeed.Where(k => !k.IsDowned && !k.IsRevived && k.DeathLocation is not null).Select(k => (k.ReplicatedWorldTimeSecondsDouble ?? 0, (double)k.DeathLocation.X, (double)k.DeathLocation.Y)).ToList();
if (SchadenLeser.DiagId is not null) {
  // Welche Felder hat die Treffer-Ereignisart in diesem Replay? (Epic kann Felder ergaenzen, die das Modell der Bibliothek nicht kennt.)
  object Feld(object o, string n) { if (o is null) return null; var t = o.GetType(); while (t != null) { var pr = t.GetProperty(n, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance); if (pr != null) return pr.GetValue(o); var fi = t.GetField(n, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance); if (fi != null) return fi.GetValue(o); t = t.BaseType; } return null; }
  var gc = Feld(reader, "GuidCache") ?? Feld(reader, "_netGuidCache");
  if (gc != null) foreach (var m in gc.GetType().GetMembers(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)) {
    if (m is not FieldInfo && m is not PropertyInfo) continue;
    object v = null; try { v = m is FieldInfo fx ? fx.GetValue(gc) : ((PropertyInfo)m).GetValue(gc); } catch { }
    Console.Error.WriteLine($"DIAGFELDER GC {m.Name}: {v?.GetType().Name} {(v is System.Collections.ICollection cc ? cc.Count.ToString() : "")}");
  }
  System.Collections.IDictionary karte = null;
  foreach (var kandidat in new[] { "NetFieldExportGroupMap", "NetFieldExportGroupMapPathFixed", "NetFieldExportGroupIndexToGroup" }) { var k0 = Feld(gc, kandidat) as System.Collections.IDictionary; if (k0 != null && k0.Count > 0) { karte = k0; break; } }
  if (karte is null) {
    for (var tt = reader.GetType(); tt != null; tt = tt.BaseType)
      foreach (var m in tt.GetMembers(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.DeclaredOnly))
        if (m is FieldInfo || m is PropertyInfo) { var ty = m is FieldInfo f0 ? f0.FieldType : ((PropertyInfo)m).PropertyType; if (ty.Name.Contains("Guid") || ty.Name.Contains("Export") || m.Name.Contains("Guid") || m.Name.Contains("Export")) Console.Error.WriteLine($"DIAGFELDER Mitglied {tt.Name}.{m.Name}: {ty.FullName}"); }
    if (gc != null) foreach (var m in gc.GetType().GetMembers(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)) if (m is FieldInfo || m is PropertyInfo) Console.Error.WriteLine($"DIAGFELDER GC {m.Name}");
  }
  else Console.Error.WriteLine($"DIAGFELDER Karte mit {karte.Count} Gruppen; Beispiele: {string.Join(" | ", karte.Keys.Cast<object>().Take(5))}");
  if (karte != null) foreach (System.Collections.DictionaryEntry kv in karte) {
    var name = kv.Key?.ToString() ?? "";
    if (!System.Text.RegularExpressions.Regex.IsMatch(name, "Damage|DamageCue", System.Text.RegularExpressions.RegexOptions.IgnoreCase)) continue;
    var exports = Feld(kv.Value, "NetFieldExports") as System.Collections.IEnumerable;
    var namen = new List<string>();
    if (exports != null) foreach (var ex in exports) { var en = Feld(ex, "Name")?.ToString(); if (!string.IsNullOrEmpty(en)) namen.Add(en); }
    Console.Error.WriteLine($"DIAGFELDER {name}: {string.Join(", ", namen)}");
  }
}
if (SchadenLeser.DiagId is not null) {
  foreach (var ty in typeof(FortniteReplayBuilder).Assembly.GetTypes()) {
    foreach (var at in ty.GetCustomAttributesData()) {
      if (!at.AttributeType.Name.Contains("ClassNetCache")) continue;
      var nm = at.ConstructorArguments.FirstOrDefault().Value?.ToString() ?? "";
      if (!nm.Contains("PlayerPawn_Athena")) continue;
      Console.Error.WriteLine($"DIAGCACHE {ty.FullName} [{string.Join(", ", at.ConstructorArguments.Select(a => a.Value))}]");
      foreach (var pr in ty.GetProperties()) foreach (var pa in pr.GetCustomAttributesData()) Console.Error.WriteLine($"DIAGCACHE   {pr.Name}: {pr.PropertyType.FullName} {pa.AttributeType.Name}({string.Join(", ", pa.ConstructorArguments.Select(a => a.Value))})");
    }
  }
}
if (SchadenLeser.DiagId is not null) {
  for (var tt = reader.GetType(); tt != null; tt = tt.BaseType)
    foreach (var f in tt.GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
      if (f.FieldType.Name.Contains("Parser") || f.Name.Contains("arser")) {
        var pv = f.IsStatic ? f.GetValue(null) : f.GetValue(reader);
        Console.Error.WriteLine($"DIAGPARSER Feld {tt.Name}.{f.Name}: {f.FieldType.FullName}");
        if (pv == null) continue;
        foreach (var g in pv.GetType().GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static)) {
          object gv = null; try { gv = g.IsStatic ? g.GetValue(null) : g.GetValue(pv); } catch { }
          var info = gv is System.Collections.IDictionary dd ? $"Dict {dd.Count}: {string.Join(" | ", dd.Keys.Cast<object>().Where(k => k.ToString().Contains("PlayerPawn_Athena_C_ClassNetCache") || k.ToString().Contains("BatchedDamage")).Take(4))}" : gv?.GetType().Name;
          Console.Error.WriteLine($"DIAGPARSER   {g.Name}: {g.FieldType.Name} -> {info}");
          if (g.Name == "NetFieldGroups" && gv != null) {
            try {
              foreach (var m in gv.GetType().GetMembers(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)) if (m is FieldInfo || m is PropertyInfo) Console.Error.WriteLine($"DIAGPARSER   KeyList.{m.Name}: {(m is FieldInfo fm ? fm.FieldType.Name : ((PropertyInfo)m).PropertyType.Name)}");
              var schl = gv.GetType().GetField("_keys", BindingFlags.NonPublic | BindingFlags.Instance)?.GetValue(gv) as System.Collections.IEnumerable;
              if (schl != null) Console.Error.WriteLine("DIAGPARSER   NetFieldGroups mit: " + string.Join(" | ", schl.Cast<object>().Select(x => x?.ToString() ?? "").Where(x => x.Contains("FromSpec") || x.Contains("BatchedDamage") || x.Contains("Slingshot")).Take(5)));
            } catch (Exception ex3) { Console.Error.WriteLine("DIAGPARSER   NetFieldGroups Fehler " + ex3.Message); }
          }
          if (g.Name == "_classNetCacheToNetFieldGroup" && gv is System.Collections.IDictionary cd) {
            Console.Error.WriteLine("DIAGPARSER   Schluessel: " + string.Join(" | ", cd.Keys.Cast<object>()));
            var wert = cd["PlayerPawn_Athena_C_ClassNetCache"];
            Console.Error.WriteLine($"DIAGPARSER   Wert-Typ: {wert?.GetType().FullName}");
            if (wert != null) foreach (var h in wert.GetType().GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)) {
              object hv = null; try { hv = h.GetValue(wert); } catch { }
              var inf = hv is System.Collections.IDictionary hd ? $"Dict {hd.Count}: " + string.Join(" | ", hd.Keys.Cast<object>().Take(8)) + " ; Werttyp " + (hd.Count > 0 ? hd.Values.Cast<object>().First()?.GetType().FullName : "") : hv?.ToString();
              Console.Error.WriteLine($"DIAGPARSER     {h.Name}: {h.FieldType.Name} = {inf}");
              if (hv is System.Collections.IDictionary pd2 && pd2.Contains("NetMulticast_Athena_BatchedDamageCues")) {
                var pi = pd2["NetMulticast_Athena_BatchedDamageCues"];
                for (var pt = pi.GetType(); pt != null; pt = pt.BaseType) foreach (var q in pt.GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.DeclaredOnly)) { object qv = null; try { qv = q.GetValue(pi); } catch { } Console.Error.WriteLine($"DIAGPARSER       {pt.Name}.{q.Name}: {q.FieldType.FullName} = {qv}"); }
              }
            }
          }
        }
      }
}
if (SchadenLeser.DiagId is not null) Console.Error.WriteLine("DIAG PARSEMODE " + string.Join(",", Enum.GetValues(typeof(ParseMode)).Cast<object>().Select(v => v + "=" + (int)v)));
if (SchadenLeser.DiagId is not null) {
  int n = 0;
  foreach (var asm in new[] { typeof(FortniteReplayBuilder).Assembly, typeof(Unreal.Core.Models.FHitResult).Assembly })
  foreach (var ty in asm.GetTypes()) foreach (var pr in ty.GetProperties()) foreach (var pa in pr.GetCustomAttributesData()) {
    if (pa.AttributeType.Name != "NetFieldExportAttribute" || n > 25) continue;
    if (!pa.ConstructorArguments.Any(a => a.Value?.ToString() == "11" || a.Value?.ToString() == "DynamicArray") && !pr.PropertyType.IsArray) continue;
    n++;
    var el = pr.PropertyType.IsArray ? pr.PropertyType.GetElementType() : pr.PropertyType;
    Console.Error.WriteLine($"DIAGARRAY {ty.Name}.{pr.Name}: {pr.PropertyType.FullName} [{string.Join(",", pa.ConstructorArguments.Select(a => a.Value))}] Element-Schnittstellen: {string.Join(",", el.GetInterfaces().Select(i => i.Name))} Attribute: {string.Join(",", el.GetCustomAttributesData().Select(x => x.AttributeType.Name + "(" + string.Join(",", x.ConstructorArguments.Select(c => c.Value)) + ")"))}");
  }
}
if (SchadenLeser.DiagId is not null) {
  var gt = typeof(FortniteReplayReader.Models.NetFieldExports.RPC.GameplayCue);
  foreach (var pr in gt.GetProperties()) Console.Error.WriteLine($"DIAGGC GameplayCue.{pr.Name}: {pr.PropertyType.FullName} [{string.Join(";", pr.GetCustomAttributesData().Select(a => string.Join(",", a.ConstructorArguments.Select(c => c.Value))))}]");
  foreach (var pr in gt.GetProperties()) if (!pr.PropertyType.IsPrimitive && pr.PropertyType.Namespace?.StartsWith("System") != true) foreach (var q in pr.PropertyType.GetProperties()) Console.Error.WriteLine($"DIAGGC   {pr.PropertyType.Name}.{q.Name}: {q.PropertyType.Name}");
}
if (SchadenLeser.DiagId is not null) Console.Error.WriteLine("DIAG REPLAYOUT " + string.Join(",", Enum.GetValues(typeof(RepLayoutCmdType)).Cast<object>().Select(v => v + "=" + Convert.ToInt32(v))));
if (SchadenLeser.DiagId is not null) Console.Error.WriteLine($"DIAG EFFEKT eingeklinkt={SchadenLeser.EffektEingeklinkt} params={reader.EffektParams}");
if (SchadenLeser.DiagId is not null) foreach (var kv in reader.EffektTags.OrderByDescending(x => x.Value).Take(25)) Console.Error.WriteLine($"DIAG EFFEKTTAG {kv.Value} {kv.Key}");
if (SchadenLeser.DiagId is not null) foreach (var kv in reader.EffektArten.OrderByDescending(x => x.Value)) Console.Error.WriteLine($"DIAG EFFEKTART {kv.Value} {kv.Key}");
if (SchadenLeser.DiagId is not null) Console.Error.WriteLine($"DIAG RAHMEN laengster {SchadenLeser.LaengsterRahmen} ms, Bloecke {SchadenLeser.Bloecke}, defekt {SchadenLeser.Defekt}, Buendel abgebrochen {SchadenLeser.BuendelAbgebrochen}");
if (SchadenLeser.DiagId is not null) Console.Error.WriteLine($"DIAG EFFEKTCUES {reader.EffektCues}, Ereignisse (BatchedDamageCues) {reader.Ereignisse}");
if (SchadenLeser.DiagId is not null) Console.Error.WriteLine($"DIAG PROJEKTILE {reader.ProjektilTreffer.Count} Treffer auf Spieler, gezaehlt {reader.ProjektilGezaehlt} mit {Math.Round(reader.ProjektilSchaden)} Schaden");
if (SchadenLeser.DiagId is not null) Console.Error.WriteLine($"DIAG EFFEKTTREFFER {reader.EffektTreffer.Count} Effekte, zugeordnet {reader.EffektZugeordnet}, gezaehlt {reader.EffektGezaehlt} mit {Math.Round(reader.EffektSchaden)} Schaden, ohne Schuetze {reader.EffektOhneSchuetze}, mehrdeutig {reader.EffektMehrdeutig}");
if (SchadenLeser.DiagId is not null) Console.Error.WriteLine($"DIAG TRUHEN {reader.TruhenFertig().Count} geoeffnet (Kisten-Kanaele {reader.KistenKanaele}) (Truhen {reader.Truhen.Count(k => k[4] == 0)}, Munition {reader.Truhen.Count(k => k[4] == 1)}, sonst {reader.Truhen.Count(k => k[4] == 2)}), mit Oeffner {reader.TruhenFertig().Count(k => k[5] >= 0)}, laut Spiel {reader.KistenLautSpiel}, Aufheben {reader.Loot.Count(l => l[5] == 1)}, Fallenlassen {reader.Loot.Count(l => l[5] == 0)}");
if (SchadenLeser.DiagId is int dgt) Console.Error.WriteLine($"DIAG TRUHEN-SPIELER {dgt}: Truhen {reader.Truhen.Count(k => k[5] == dgt && k[4] == 0)}, Munition {reader.Truhen.Count(k => k[5] == dgt && k[4] == 1)}, Boden {reader.Truhen.Count(k => k[5] == dgt && k[4] == 2)}; je Spieler im Schnitt Truhen {Math.Round(reader.Truhen.Count(k => k[4] == 0) / (double)Math.Max(1, reader.Truhen.Select(k => k[5]).Distinct().Count()), 1)}");
if (SchadenLeser.DiagId is not null) foreach (var k in reader.Truhen.Where(k => k[0] > 700 && k[5] == SchadenLeser.DiagId).Take(12)) { var n = reader.Loot.Where(l => l[5] == 1).Select(l => (dt: l[0] - k[0], d: Math.Sqrt(Math.Pow(l[3] - k[1], 2) + Math.Pow(l[4] - k[2], 2)), wer: l[1])).Where(x => x.dt > -5 && x.dt < 30).OrderBy(x => x.d).Take(3); Console.Error.WriteLine($"DIAGTRUHE t={k[0]} x={k[1]} y={k[2]} art={k[4]} naechste: {string.Join(" ; ", n.Select(x => $"{x.wer} dt={Math.Round(x.dt, 1)} d={Math.Round(x.d)}"))}"); }
if (SchadenLeser.DiagId is not null) Console.Error.WriteLine($"DIAG ABBAU {reader.AbbauListe.Count} Schlaege, Kanaele {reader.AbbauListe.Select(a => a.kanal).Distinct().Count()}, Arten {string.Join(",", reader.AbbauListe.GroupBy(a => a.art).Select(g => g.Key + ":" + g.Sum(x => x.menge)))}");
if (SchadenLeser.DiagId is not null) Console.Error.WriteLine($"DIAG UNSICHER bestaetigt {reader.UnsicherBestaetigt}, verworfen {reader.UnsicherVerworfen}");
if (SchadenLeser.DiagId is not null) foreach (var kv in reader.Diag) Console.Error.WriteLine($"DIAG {kv.Key}: {kv.Value.Item1} Treffer, {Math.Round(kv.Value.Item2)} Schaden");
if (SchadenLeser.DiagId is int diagId) {
  // Passt zu einem unbekannten Treffer ein Spieler, der im selben Moment (0,25 s) Leben + Schild + Overshield verlor? Dann war das Ziel ein Spieler.
  double Summe(int id, double t) {
    double W(Dictionary<int, List<double[]>> d, double st) { if (!d.TryGetValue(id, out var l)) return st; double? w = null; foreach (var x in l) { if (x[0] <= t) w = x[1]; else break; } return w ?? st; }
    return W(reader.Leben, 100) + W(reader.Schild, 0) + W(reader.Ueberschild, 0);
  }
  var ids = reader.Leben.Keys.Union(reader.Schild.Keys).Where(i => i != diagId).ToList();
  var treffer = new Dictionary<string, (int n, double dmg, int passt, double passtDmg)>();
  var akteurPasst = new Dictionary<uint, Dictionary<int, int>>();
  foreach (var h in reader.DiagOffen) {
    int? wer = null;
    foreach (var id in ids) { var vor = Summe(id, h.t - 0.05); var nach = Summe(id, h.t + 0.25); if (vor - nach >= Math.Min(h.mag, vor) * 0.9 && vor - nach > 0) { wer = id; break; } }
    treffer.TryGetValue(h.art, out var a);
    treffer[h.art] = (a.n + 1, a.dmg + h.mag, a.passt + (wer is null ? 0 : 1), a.passtDmg + (wer is null ? 0 : h.mag));
    if (wer is int w) { if (!akteurPasst.TryGetValue(h.akteur, out var m)) akteurPasst[h.akteur] = m = new(); m[w] = (m.TryGetValue(w, out var z) ? z : 0) + 1; }
  }
  // Wie viel Leben + Schild + Overshield verloren die Spieler insgesamt (alle Abnahmen nach dem Bus)? Vergleich mit dem gezaehlten Schaden.
  double verlorenAlle = 0; var verlorenJe = new Dictionary<int, double>();
  foreach (var id in reader.Leben.Keys.Union(reader.Schild.Keys).Union(reader.Ueberschild.Keys)) {
    var zeiten = new SortedSet<double>();
    foreach (var d in new[] { reader.Leben, reader.Schild, reader.Ueberschild }) if (d.TryGetValue(id, out var l)) foreach (var x in l) zeiten.Add(x[0]);
    double? vorher = null; double sum = 0;
    foreach (var t in zeiten) { var w = Summe(id, t); if (vorher is double v && w < v) sum += v - w; vorher = w; }
    verlorenJe[id] = sum; verlorenAlle += sum;
  }
  Console.Error.WriteLine($"DIAGVERLUST alle Spieler zusammen: {Math.Round(verlorenAlle)} (Leben+Schild+Overshield, inkl. Sturm/Fall); Spieler mit Verlauf: {verlorenJe.Count}");
  {
    /*
     * Bilanz (10.11.2026): jede Abnahme von Leben + Schild + Overshield nach dem Bus, die kein gezaehlter Treffer (0,6 s davor bis 0,3 s danach) erklaert - nach dem Effekt,
     * der dem Opfer im selben Moment (0,4 s) widerfuhr. So zeigt sich, welche Schadensart uns entgeht (Explosion, Gegenstand ...).
     */
    var bilanz = new Dictionary<string, (int n, double v)>(); double ungeklaert = 0;
    var imSturm = reader.SturmListe.GroupBy(x => x.id).ToDictionary(g => g.Key, g => g.OrderBy(x => x.t).ToList());
    bool sturmBei(int id, double t) { if (!imSturm.TryGetValue(id, out var l)) return false; bool an = false; foreach (var x in l) { if (x.t <= t) an = x.an; else break; } return an; }
    foreach (var id in verlorenJe.Keys) {
      var zeiten = new SortedSet<double>();
      foreach (var d in new[] { reader.Leben, reader.Schild, reader.Ueberschild }) if (d.TryGetValue(id, out var l)) foreach (var x in l) zeiten.Add(x[0]);
      double? vor = null; double erklaertRest = 0; double letzteT = -9;
      foreach (var t in zeiten) {
        var w = Summe(id, t);
        if (vor is double v && w < v - 0.5 && (busAb is null || t >= busAb)) {
          var ab = v - w;
          var gez = reader.Liste.Where(e => e.an == id && e.t is double et && et >= t - 0.6 && et <= t + 0.3 && et > letzteT).Sum(e => e.hoehe);
          letzteT = t;
          var rest = Math.Max(0, ab - gez - erklaertRest); erklaertRest = Math.Max(0, gez + erklaertRest - ab);
          if (rest >= 1) {
            var eff = reader.EffektAlle.Where(e => e.an == id && Math.Abs(e.t - t) <= 0.4).Select(e => System.Text.RegularExpressions.Regex.Replace(e.art.Split('.').Last(), "_C$", "")).Distinct().ToList();
            var art = eff.FirstOrDefault(e => !e.Contains("OutsideSafeZone") && !e.Contains("Campfire") && !e.Contains("Heal") && !e.Contains("Shields")) ?? (eff.Any(e => e.Contains("OutsideSafeZone")) || sturmBei(id, t) ? "Sturm" : "ohne Effekt");
            if (art == "ohne Effekt" && rest <= 10 && sturmBei(id, t)) art = "Sturm";
            if (art == "ohne Effekt") {
              // Passt ein nicht zugeordneter Treffer (Ziel unbekannt) mit fast gleicher Hoehe in denselben Moment?
              var passt = reader.DiagAlle.Where(h => Math.Abs(h.t - t) <= 0.4 && Math.Abs(h.mag - rest) <= Math.Max(2, rest * 0.05)).OrderBy(h => Math.Abs(h.t - t)).FirstOrDefault();
              art = passt.art is null ? "ohne Effekt, kein passender Treffer" : "ohne Effekt, passt zu " + passt.art;
            }
            bilanz.TryGetValue(art, out var b); bilanz[art] = (b.n + 1, b.v + rest); if (art != "Sturm") ungeklaert += rest;
          }
        }
        vor = w;
      }
    }
    Console.Error.WriteLine($"BILANZ unerklaerte Abnahme (ohne Sturm): {Math.Round(ungeklaert)}");
    foreach (var kv in bilanz.OrderByDescending(x => x.Value.v).Take(25)) Console.Error.WriteLine($"BILANZ {kv.Key}: {kv.Value.n} mal, {Math.Round(kv.Value.v)}");
  }
  var gezJe = reader.Je.ToDictionary(k => k.Key, k => k.Value.Genommen);
  {
    var opfer = verlorenJe.OrderByDescending(x => x.Value - (gezJe.TryGetValue(x.Key, out var gg0) ? gg0 : 0)).Select(x => x.Key).FirstOrDefault();
    var zeiten = new SortedSet<double>();
    foreach (var d in new[] { reader.Leben, reader.Schild, reader.Ueberschild }) if (d.TryGetValue(opfer, out var l)) foreach (var x in l) zeiten.Add(x[0]);
    double? vor = null; int n = 0;
    foreach (var t in zeiten) {
      var w = Summe(opfer, t);
      if (vor is double v && w < v && n < 40 && v - w >= 15) {
        n++;
        var nah = reader.DiagAlle.Where(h => h.t >= t - 0.6 && h.t <= t + 0.2).OrderBy(h => Math.Abs(h.t - t)).Take(5).Select(h => $"[{Math.Round(h.t - t, 2)}s von {h.von} {Math.Round(h.mag)} {h.art} akteur {h.akteur}]");
        var gez = reader.Liste.Where(e => e.an == opfer && e.t is double et && et >= t - 1.5 && et <= t + 0.3).Select(e => $"<gez von {e.von} {Math.Round(e.hoehe)}>");
        Console.Error.WriteLine($"DIAGOPFER {opfer} t={Math.Round(t, 2)} verlor {Math.Round(v - w)}: " + string.Join(" ", gez.Concat(nah)));
      }
      vor = w;
    }
  }
  foreach (var kv in verlorenJe.OrderByDescending(x => x.Value - (gezJe.TryGetValue(x.Key, out var gg) ? gg : 0)).Take(15)) Console.Error.WriteLine($"DIAGVERLUST Spieler {kv.Key}: verloren {Math.Round(kv.Value)}, als Treffer gezaehlt {Math.Round(gezJe.TryGetValue(kv.Key, out var g) ? g : 0)}");
  foreach (var kv in treffer) Console.Error.WriteLine($"DIAGPASST {kv.Key}: {kv.Value.n} Treffer ({Math.Round(kv.Value.dmg)}) - davon {kv.Value.passt} ({Math.Round(kv.Value.passtDmg)}) mit gleichzeitigem Verlust eines Spielers");
  foreach (var kv in akteurPasst.OrderByDescending(x => x.Value.Values.Sum()).Take(8)) Console.Error.WriteLine($"DIAGAKTEUR {kv.Key}: " + string.Join(", ", kv.Value.Select(x => $"Spieler {x.Key} x{x.Value}")));
}
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
  id = kv.Key, gemacht = Math.Round(kv.Value.Gemacht), gemachtOhneBoden = Math.Round(reader.OhneBodenGemacht(kv.Key)), gemachtOhneFatal = Math.Round(reader.OhneFatalGemacht(kv.Key)), trefferOhneBoden = kv.Value.TrefferOhneBoden, trefferGleichzeitig = kv.Value.TrefferGleichzeitig, genommen = Math.Round(kv.Value.Genommen), genommenOhneBoden = Math.Round(reader.GenommenOhneBoden.TryGetValue(kv.Key, out var gob) ? gob : 0),
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
  extra = reader.ExtraFertig(replay.PlayerData.Where(p => p.Id is not null && p.TeamIndex is not null).GroupBy(p => p.Id.Value).ToDictionary(g => g.Key, g => (int)g.First().TeamIndex.Value)), inventarEintraege = reader.InventarEintraege, inventarOhneMenge = reader.InventarOhneMenge, orte = reader.Orte, leben = reader.Leben, schild = reader.Schild, ueberschild = reader.Ueberschild, killVerlauf = reader.KillVerlauf, sturmVerlauf = reader.SturmListe.Select(x => new[] { x.id, Math.Round(x.t, 2), x.an ? 1 : 0 }).ToList(), abbau = reader.AbbauJeSpieler(), loot = reader.Loot, lootNamen = reader.LootNamen, truhen = reader.TruhenFertig(), schuesse = reader.Schuesse, hand = reader.Hand, waffenNamen = reader.WaffenNamen, blick = reader.Blick, diagUeber = SchadenLeser.DiagId is null ? null : reader.UeberschussJe(busAb), diagKat = SchadenLeser.DiagId is null ? null : reader.KatJe, diagFarm = SchadenLeser.DiagId is null ? null : reader.FarmVarianten, streckeVoll = reader.StreckeJe(busAb),
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

  public sealed class Schaden { public double Gemacht, Genommen, AufSchild; public int Treffer, Krit, TrefferOhneBoden, TrefferGleichzeitig; }
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
    if (DiagId is not null && Zeit() is double tco && DiagZeiten.Any(z => tco >= z - 6 && tco <= z + 1) && actor is not null) {
      var pfo = pfadVonAkteur.TryGetValue(actor.Value, out var pq) ? pq : "?";
      if (!pfo.Contains("PBWA_") && !pfo.Contains("Pickup")) Console.Error.WriteLine($"DIAGKANAL t={Math.Round(tco, 2)} k={channelIndex} akteur={actor.Value} {pfo}");
    }
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
  /*
   * Jedes gebaute Teil, roh aus dem Strom gelesen (7.11.2026): die Bibliothek kennt BuildingReplacementType nicht, und nur damit trennt man Gebautes von dem, was beim Editieren an seine Stelle tritt.
   * OwnerPersistentID ist die WorldPlayerId des Spielers. Performance-Finale, Stein und Metall: 318/404/245 und 124/445/243 zu Osirions 314/404/235 und 123/444/240.
   */
  readonly Dictionary<uint, (char stoff, int besitzer, bool gesetzt, bool ersatz)> bauTeile = new();
  readonly Dictionary<int, int> spielerVonWelt = new();
  bool BauLesen(Unreal.Core.FBitArchive archive, Unreal.Core.Models.NetFieldExportGroup group, uint kanal, bool enablePropertyChecksum) {
    if (enablePropertyChecksum) archive.ReadBit();
    int? team = null, besitzer = null; bool? gesetzt = null; var ersatz = false; var bearbeitet = false;
    while (true) {
      var feld = archive.ReadIntPacked();
      if (feld == 0) break;
      feld--;
      var bits = archive.ReadIntPacked();
      if (bits == 0) continue;
      var daten = archive.ReadBits(bits);
      if (!group.IsValidIndex(feld)) continue;
      switch (group.NetFieldExports[feld]?.Name) {
        case "TeamIndex": team = daten[0]; break;
        case "bPlayerPlaced": gesetzt = daten[0] != 0; break;
        case "OwnerPersistentID": if (bits >= 16) besitzer = BitConverter.ToUInt16(daten); break;
        case "BuildingReplacementType": ersatz = true; break;
        case "EditingPlayer": bearbeitet = true; break;
      }
    }
    if (!bauKanal.TryGetValue(kanal, out var teil)) return true;
    if (Channels[kanal]?.Actor?.ActorNetGUID?.Value is uint akteur) {
      bauTeile.TryGetValue(akteur, out var alt);
      bauTeile[akteur] = (teil.stoff, besitzer ?? alt.besitzer, gesetzt ?? alt.gesetzt, ersatz || alt.ersatz);
    }
    if (team is not int tm) return true;
    if (!Bauten.TryGetValue(tm, out var b)) Bauten[tm] = b = new Bau();
    if (bearbeitet) b.Bearbeitet++;
    if (!bauGezaehlt.Add(kanal)) return true;
    if (gesetzt == false) return true;
    if (teil.stoff == 'W') b.Holz++; else if (teil.stoff == 'S') b.Stein++; else b.Metall++;
    if (teil.form.Contains("Floor") || teil.form.StartsWith("Balcony")) b.Boden++;
    else if (teil.form.StartsWith("Stair")) b.Treppe++;
    else if (teil.form.StartsWith("Roof")) b.Dach++;
    else if (teil.form is "Solid" or "Brace" or "HalfWall" or "HalfWallS" or "QuarterWallS" || teil.form.Contains("Window") || teil.form.Contains("Door") || teil.form.Contains("Archway")) b.Wand++;
    else b.Sonst++;
    if (besitzer is not null) b.MitBesitzer++;
    return true;
  }
  static readonly FieldInfo CacheFeld = typeof(ReplayReader).BaseType?.GetField("_netGuidCache", BindingFlags.NonPublic | BindingFlags.Instance);
  System.Collections.IDictionary PfadKarte() {
    var cache = CacheFeld?.GetValue(this);
    return cache?.GetType().GetProperty("NetGuidToPathName")?.GetValue(cache) as System.Collections.IDictionary;
  }
  readonly Dictionary<int, (double t, double x, double y, double z)> letzterOrt = new();
  readonly Dictionary<int, List<(double t, double d, double dz, double dt)>> Strecken = new();
  /// Strecke je Spieler ab dem Bus in Metern: [alles, bis 60 m/s, bis 25 m/s, bis 12 m/s, Anzahl Updates] - welche Grenze Osirions "Distance Traveled" trifft, zeigt die Diagnose.
  public Dictionary<int, double[]> StreckeJe(double? busAb) {
    var raus = new Dictionary<int, double[]>();
    foreach (var (id, l) in Strecken) {
      var r = new double[5];
      foreach (var (t, d, dz, dt) in l) {
        if (busAb is double b && t < b) continue;
        var v = d / Math.Max(0.05, dt);
        r[0] += d; if (v <= 60) r[1] += d; if (v <= 25) r[2] += d; if (v <= 12) r[3] += d; r[4] += 1;
      }
      raus[id] = r.Select(x => Math.Round(x)).ToArray();
    }
    return raus;
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

  void OrtNotieren(int id, double t, double x, double y, double? z = null) {
    if (!Orte.TryGetValue(id, out var l)) Orte[id] = l = new();
    // Hoechstens ein Ort je Sekunde - die Schuebe liefern Dutzende in einer Sekunde, die Ansicht braucht davon einen.
    if (l.Count > 0 && t - l[^1][0] < 1) return;
    l.Add(z is double zz ? new[] { Math.Round(t, 1), Math.Round(x), Math.Round(y), Math.Round(zz) } : new[] { Math.Round(t, 1), Math.Round(x), Math.Round(y) });
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
  readonly List<(uint wurzel, int schuesse, double t)> schussSchritte = new();
  /// Jeder Schuss aus einer FirePetal-Pump (Magazin sinkt): Inventar-Wurzel und Zeit - der Schuetze fuer deren Effekt-Treffer.
  readonly List<(uint wurzel, double t)> firePetalSchuesse = new();
  /// Nur Schusswaffen zaehlen als Schuesse - Spraydose, Heilspray, Maske, Greifhandschuhe und Co. haben auch eine Ladung (8.11.2026: 520 "Schuesse" mit der Spraydose in zehn Matches).
  static readonly System.Text.RegularExpressions.Regex SchussWaffe = new("Shotgun|SMG|Pistol|Assault|Rifle|Sniper|DMR|Minigun|LMG|Bow|Revolver|Burst|Crossbow|Launcher|Hunting", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
  public int AbwurfMunition;
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
    /*
     * Faellt das Magazin auf einmal um mehr als 8 auf 0, ist das kein Schiessen, sondern ein Abwurf - im Reload bei jedem Tod das ganze Inventar
     * (8.11.2026: Shots der FNCS Solo Reload EU 13,9 Mio. zu Osirions 9,1 Mio.).
     */
    if (da && ladung < vor && name.Contains("FirePetal") && Zeit() is double tfp) firePetalSchuesse.Add((wurzel, tfp));
    if (da && ladung < vor && SchussWaffe.IsMatch(name)) { if (ladung == 0 && vor - ladung > 8) AbwurfMunition += vor - ladung; else schussSchritte.Add((wurzel, vor - ladung, Zeit() ?? 0)); }
  }
  /*
   * Abbau von Ressourcen (Betreiber, 10.11.2026: Mats Farmed wie Osirion): das Spiel meldet jeden Schlag auf ein Ressourcen-Objekt mit Art und Menge
   * (FortBroadcastRemoteClientInfo:ClientRemotePlayerDamagedResourceBuilding). Der Kanal gehoert einem Spieler - welchem, zeigt das Inventar: wessen Mats binnen 1,5 s
   * nach den Schlaegen dieses Kanals am haeufigsten steigen.
   */
  public readonly List<(double t, uint kanal, int art, int menge, bool zerstoert, bool schwachstelle)> AbbauListe = new();
  public Dictionary<int, double[]> AbbauJeSpieler() {
    var raus = new Dictionary<int, double[]>();
    var plus = matsSchritte.Where(m => m.menge > 0).Select(m => (m.t, wer: SpielerDerWurzel(m.wurzel))).Where(m => m.wer is not null).OrderBy(m => m.t).ToList();
    foreach (var g in AbbauListe.GroupBy(a => a.kanal)) {
      var stimmen = new Dictionary<int, int>();
      foreach (var a in g.Take(60)) foreach (var m in plus.Where(m => m.t >= a.t - 0.2 && m.t <= a.t + 1.5)) stimmen[m.wer.Value] = (stimmen.TryGetValue(m.wer.Value, out var v) ? v : 0) + 1;
      if (stimmen.Count == 0) continue;
      var wer = stimmen.OrderByDescending(x => x.Value).First().Key;
      if (!raus.TryGetValue(wer, out var r)) raus[wer] = r = new double[4];
      foreach (var a in g) { if (a.art >= 1 && a.art <= 3) r[a.art - 1] += a.menge; else r[3] += a.menge; }
    }
    return raus;
  }
  int? SpielerDerWurzel(uint wurzel) {
    if (!inventarFiguren.TryGetValue(wurzel, out var l)) return null;
    foreach (var f in l) if (spielerVonAkteur.TryGetValue(f, out var id)) return id;
    return null;
  }
  bool WaffeInHand(int id, double t) {
    if (!Hand.TryGetValue(id, out var l) || l.Count == 0) return false;
    int a = 0, z = l.Count - 1;
    while (a < z) { var m = (a + z + 1) / 2; if (l[m][0] <= t) a = m; else z = m - 1; }
    if (l[a][0] > t) return false;
    var nr = (int)l[a][1];
    return nr >= 0 && nr < WaffenNamen.Count && SchussWaffe.IsMatch(WaffenNamen[nr] ?? "");
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
   * - Rueckgabe: ein Plus in Zehnern bis 2 s nach einem Minus ist ein abgebrochener Bau und zaehlt nicht als Gewinn.
   * - Gefarmt: das Plus liegt bis 2 s nach oder 0,6 s vor einem Spitzhackenschlag. Faellt dazu ein Aufheben in die Zeit (das Aufgehobene kommt 0,4 bis 1,1 s spaeter an), zaehlen nur Mengen bis 30.
   * - Ein Minus ab 70 ist Hinwerfen. Was das Team binnen 30 s davon wieder aufhebt, ist nur weitergereicht und zaehlt nicht als gesammelt (Darm: Holz +68 % ohne diese Regel).
   * - Gesammelt ist alles andere. Osirion fuehrt beides getrennt. Im Finale im Mittel daneben: Gefarmt 6 %, Gesammelt 15 %.
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
          continue;
        }
        var schlaege = axt.GetValueOrDefault(id) ?? leer; var aufgehoben = auf.GetValueOrDefault((id, stoff)) ?? leer;
        // Bis 2 s nach dem Schlag (8.11.2026): das Gefarmte kommt im Strom oft spaeter an. Mit 0,5 s fehlten Focus (FNCS Solo Reload, 10 Matches) 15 % zu Osirions
        // Mats Farmed; mit 2 s 6.781 zu 6.824, Metall 583 zu 593.
        if (DiagId is not null) {
          // Varianten der Regel (Diagnose, 10.11.2026): [A] wie bisher, [B] Fenster 1 s, [C] ohne Kleinmengen-Regel, [D] Fenster 1 s ohne Kleinmengen, [E] nur bis 30 je Schritt.
          if (!FarmVarianten.TryGetValue(id, out var fv)) FarmVarianten[id] = fv = new double[9];
          var aufNah = Zwischen(aufgehoben, t - 1.1, t - 0.4);
          var a2 = Zwischen(schlaege, t - 2, t + 0.6) && (m <= 30 || !aufNah);
          var b1 = Zwischen(schlaege, t - 1, t + 0.6) && (m <= 30 || !aufNah);
          var klein = m <= 30 && MitSpitzhacke(id, t) && !Zwischen(aufgehoben, t - 1.5, t + 0.5);
          if (a2 || klein) fv[0] += m; if (b1 || klein) fv[1] += m; if (a2) fv[2] += m; if (b1) fv[3] += m; if ((a2 || klein) && m <= 30) fv[4] += m;
          // [F] wie D, aber kein Aufheben desselben Stoffs 3 s davor bis 1 s danach; [G] Fenster 0,6 s ohne Kleinmengen; [H] wie F mit Fenster 0,6 s; [I] wie D, Schritt hoechstens 40
          var aufWeit = Zwischen(aufgehoben, t - 3, t + 1);
          var c06 = Zwischen(schlaege, t - 0.6, t + 0.6) && (m <= 30 || !aufNah);
          if (b1 && !aufWeit) fv[5] += m; if (c06) fv[6] += m; if (c06 && !aufWeit) fv[7] += m; if (b1 && m <= 40) fv[8] += m;
        }
        if (Zwischen(schlaege, t - 2, t + 0.6) && (m <= 30 || !Zwischen(aufgehoben, t - 1.1, t - 0.4))) { e[ExtraGefarmt + stoff] += m; continue; }
        /*
         * Schlaege auf Autos, Kuehlschraenke und andere Dinge, die kein Bauteil sind, stehen nicht als Einschlag im Strom (8.11.2026: Focus, FNCS Solo Reload, Metall gefarmt
         * 323 zu Osirions 593). Kleine Mengen mit der Spitzhacke in der Hand und ohne Aufheben in der Naehe sind deshalb auch gefarmt.
         */
        if (m <= 30 && MitSpitzhacke(id, t) && !Zwischen(aufgehoben, t - 1.5, t + 0.5)) { e[ExtraGefarmt + stoff] += m; continue; }
        var rest = m;
        foreach (var w in geworfen) {
          if (rest <= 0) break;
          if (t - w[0] > WurfFrist || w[1] <= 0) continue;
          var k = Math.Min(rest, w[1]); w[1] -= k; rest -= k;
        }
        e[ExtraGesammelt + stoff] += rest;
      }
    }
    /*
     * Schuesse (8.11.2026, an zehn Matches des Betreibers gegen Osirion: 429 zu 440): je 2 s das Groessere aus der Munition, die aus dem Magazin verschwindet, und den Einschlaegen
     * mit einer Schusswaffe in der Hand. Der Munitionsstand fehlt bei manchen Waffen ganz (nicht im Inventar zugeordnet), die Einschlaege sehen keine Schuesse ins Leere.
     */
    var ammoJe = new Dictionary<(int, long), int>(); var einschlagJe = new Dictionary<(int, long), int>();
    foreach (var (wurzel, schuesse, ts) in schussSchritte) if (SpielerDerWurzel(wurzel) is int id) { var k = (id, (long)Math.Floor(ts / 2)); ammoJe[k] = (ammoJe.TryGetValue(k, out var a0) ? a0 : 0) + schuesse; }
    foreach (var sch in Schuesse) {
      var id = (int)sch[1]; if (!WaffeInHand(id, sch[0])) continue;
      var k = (id, (long)Math.Floor(sch[0] / 2)); einschlagJe[k] = (einschlagJe.TryGetValue(k, out var e0) ? e0 : 0) + 1;
    }
    foreach (var k in ammoJe.Keys.Union(einschlagJe.Keys)) ExtraVon(k.Item1)[ExtraSchuesse] += Math.Max(ammoJe.TryGetValue(k, out var a1) ? a1 : 0, einschlagJe.TryGetValue(k, out var e1) ? e1 : 0);
    foreach (var (stoff, besitzer, gesetzt, ersatz) in bauTeile.Values) {
      if (gesetzt && !ersatz && spielerVonWelt.TryGetValue(besitzer, out var id)) ExtraVon(id)[ExtraBauten + (stoff == 'W' ? 0 : stoff == 'S' ? 1 : 2)] += 1;
    }
  }

  /*
   * Gelungene Edits: NetMulticast_SuccessfulBuildingEdit ist ein Aufruf ohne Werte auf der Figur. Die Bibliothek ueberspringt Felder ohne Inhalt, bevor sie sie auswertet; deshalb wird er
   * schon beim Lesen des Feldkopfs gezaehlt. Performance-Finale: 408 / 501 / 369 zu Osirions 364 / 492 / 353.
   */
  /*
   * Kaputte Bloecke ueberspringen statt das ganze Match zu verlieren (8.11.2026: 30 Matches der FNCS Solo Reload EU scheiterten bei jedem Versuch - die Bibliothek stuerzte in
   * ReadNetFieldExports mit IndexOutOfRange ab, oder ein Block las sich endlos). Ein Fehler in einem Datenblock bricht nur diesen Block ab; ein Rahmen, der nicht weiterkommt,
   * ebenso. Gezaehlt in DefekteBloecke.
   */
  public static int Rahmen, Bloecke, Defekt;
  public override void ReadReplayData(Unreal.Core.FArchive archive, int fallbackChunkSize) {
    Bloecke += 1;
    try { base.ReadReplayData(archive, fallbackChunkSize); } catch (Exception e) { Defekt += 1; if (Defekt <= 3) Console.Error.WriteLine($"Block {Bloecke} defekt: {e.GetType().Name}: {e.Message}\n{string.Join("\n", (e.StackTrace ?? "").Split('\n').Take(12))}"); }
  }
  Unreal.Core.FArchive? rahmenArchiv; int rahmenPos = -1; int rahmenGleich;
  public override void ReadDemoFrameIntoPlaybackPackets(Unreal.Core.FArchive archive) {
    if (ReferenceEquals(archive, rahmenArchiv) && archive.Position == rahmenPos) { if (++rahmenGleich > 2) throw new InvalidOperationException("Rahmen ohne Fortschritt"); }
    else rahmenGleich = 0;
    rahmenArchiv = archive; rahmenPos = archive.Position; Rahmen += 1; paketeImRahmen = 0;
    rahmenStart = Environment.TickCount64;
    base.ReadDemoFrameIntoPlaybackPackets(archive);
  }
  // Ein Rahmen braucht Millisekunden; haengt einer (die Bibliothek liest in einer Schleife ohne Ende), bricht nach 3 s eine Ausnahme den Block ab.
  long rahmenStart;
  static readonly long RahmenMs = long.TryParse(Environment.GetEnvironmentVariable("RAHMEN_MS"), out var rms) ? rms : 3000;
  public static long LaengsterRahmen;
  int paketeImRahmen, stapelGezeigt; long laengstesPaket; long paketeGesamt;
  void RahmenWache() { var d = Environment.TickCount64 - rahmenStart; if (d > LaengsterRahmen) LaengsterRahmen = d; if (d > RahmenMs) { if (DiagId is not null && stapelGezeigt++ < 2) Console.Error.WriteLine("STAPEL " + string.Join(" | ", Environment.StackTrace.Split('\n').Skip(1).Take(30).Select(x => x.Trim()))); throw new TimeoutException($"Rahmen haengt ({d} ms, Pakete im Rahmen {paketeImRahmen}, laengstes Paket {laengstesPaket} ms, Pakete gesamt {paketeGesamt}, Rahmen {Rahmen})"); } }

  /*
   * Endlosschleife der Bibliothek (10.11.2026, Squads Victory Cup Runde 2, Match 3983b04c...: zyfos drittes Spiel fehlte ganz, ihm fehlten 49 % Schaden gegen Osirion).
   * Ein verrutschter Inhaltsblock setzt den Fehler-Zustand des Lesers; danach liest er nichts mehr, kommt aber auch nie ans Ende - ProcessBunch drehte sich ewig, und unser
   * Zeitwaechter warf den ganzen ersten Datenblock weg (darin stehen alle Feld-Definitionen, also war das ganze Match leer). Die neuere Bibliothek (Shiqan, 13.9.2026)
   * bricht genau dort das eine Buendel ab - hier dasselbe: nur dieses Buendel faellt weg.
   */
  sealed class BuendelFehler : Exception { }
  public static int BuendelAbgebrochen;
  public override uint? ReadContentBlockHeader(Unreal.Core.Models.DataBunch bunch, out bool bOutHasRepLayout, out bool bObjectDeleted) {
    if (bunch.Archive.IsError) { bOutHasRepLayout = false; bObjectDeleted = false; throw new BuendelFehler(); }
    return base.ReadContentBlockHeader(bunch, out bOutHasRepLayout, out bObjectDeleted);
  }
  public override void ProcessBunch(Unreal.Core.Models.DataBunch bunch) {
    try { base.ProcessBunch(bunch); } catch (BuendelFehler) { BuendelAbgebrochen++; }
  }
  public override void ReceivedNextBunch(Unreal.Core.Models.DataBunch bunch) { RahmenWache(); base.ReceivedNextBunch(bunch); }
  public override void ReceivedRawBunch(Unreal.Core.Models.DataBunch bunch) { RahmenWache(); base.ReceivedRawBunch(bunch); }
  public override void ReceivedPacket(Unreal.Core.FBitArchive bitReader) {
    RahmenWache(); paketeImRahmen++; paketeGesamt++;
    var t0 = Environment.TickCount64;
    base.ReceivedPacket(bitReader);
    var d = Environment.TickCount64 - t0; if (d > laengstesPaket) laengstesPaket = d;
    if (d > 1000 && DiagId is not null) Console.Error.WriteLine($"PAKET langsam {d} ms, Rahmen {Rahmen}, Block {Bloecke}");
  }
  public override Unreal.Core.Models.Enums.PacketState ReadPacket(Unreal.Core.FArchive archive) { RahmenWache(); return base.ReadPacket(archive); }
  public override Unreal.Core.Models.NetFieldExport? ReadNetFieldExport(Unreal.Core.FArchive archive) { RahmenWache(); return base.ReadNetFieldExport(archive); }
  public override Unreal.Core.Models.NetworkGUID InternalLoadObject(Unreal.Core.FArchive archive, bool isExportingNetGUIDBunch, int internalLoadObjectRecursionCount = 0) { RahmenWache(); return base.InternalLoadObject(archive, isExportingNetGUIDBunch, internalLoadObjectRecursionCount); }
  /*
   * Wie die Bibliothek, aber mit Ende: ihre Schleife liest so lange, bis eine 0 kommt - in einem kaputten Block kommt keine, und der Leser hing (FNCS Solo Reload EU, 8.11.2026).
   */
  public override void ReadExternalData(Unreal.Core.FArchive archive) {
    while (!archive.AtEnd()) {
      RahmenWache();
      uint bits = archive.ReadIntPacked();
      if (bits == 0) break;
      uint guid = archive.ReadIntPacked();
      if (archive.AtEnd()) break;
      _netGuidCache.ExternalData[guid] = new Unreal.Core.Models.ExternalData {
        Archive = new Unreal.Core.BinaryReader(archive.ReadBytes((int)((bits + 7) >> 3))) {
          NetworkReplayVersion = archive.NetworkReplayVersion, EngineNetworkVersion = archive.EngineNetworkVersion, ReplayHeaderFlags = archive.ReplayHeaderFlags,
          ReplayVersion = archive.ReplayVersion, NetworkVersion = archive.NetworkVersion,
        },
        NetGUID = guid,
      };
    }
  }

  uint bunchKanal;
  public override bool ReceivedReplicatorBunch(Unreal.Core.Models.DataBunch bunch, Unreal.Core.FBitArchive archive, uint? repObject, bool bHasRepLayout) {
    RahmenWache();
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

  /*
   * Leben und Schild jedes Spielers (7.11.2026). Die Bibliothek liest FortRegenHealthSet ueber feste Feldnummern, und die stimmen nicht mehr: der Schild steht laengst in Feld 31, nicht in 19 -
   * deshalb sah er aus wie "im Strom null". Hier werden die Felder selbst gelesen. Die Werte sind exakt, auch die Nachkommastellen (Leben 59,5).
   */
  const uint LebenFeld = 1, SchildFeld = 31, UeberschildFeld = 51;
  public readonly Dictionary<int, List<double[]>> Schild = new();
  /// Overshield (Feld 51 von FortRegenHealthSet, 0 bis 50) - Osirion fuehrt ihn getrennt (Overshield Taken/Healed).
  public readonly Dictionary<int, List<double[]>> Ueberschild = new();
  public readonly Dictionary<int, List<double[]>> KillVerlauf = new();
  public override bool ReceiveProperties(Unreal.Core.FBitArchive archive, Unreal.Core.Models.NetFieldExportGroup group, uint channelIndex, out INetFieldExportGroup exportGroup, bool enablePropertyChecksum = true, bool netDeltaUpdate = false) {
    if (bauKanal.ContainsKey(channelIndex) && group.PathName.Contains("PBWA_", StringComparison.Ordinal)) { exportGroup = null; return BauLesen(archive, group, channelIndex, enablePropertyChecksum); }
    if (!group.PathName.EndsWith("FortRegenHealthSet", StringComparison.Ordinal)) return base.ReceiveProperties(archive, group, channelIndex, out exportGroup, enablePropertyChecksum, netDeltaUpdate);
    exportGroup = null;
    if (enablePropertyChecksum) archive.ReadBit();
    double? leben = null, schild = null, ueber = null;
    while (true) {
      var feld = archive.ReadIntPacked();
      if (feld == 0) break;
      feld--;
      var bits = archive.ReadIntPacked();
      if (bits == 0) continue;
      var daten = archive.ReadBits(bits);
      if (bits != 32) continue;
      if (feld == LebenFeld) leben = BitConverter.ToSingle(daten);
      else if (feld == SchildFeld) schild = BitConverter.ToSingle(daten);
      else if (feld == UeberschildFeld) ueber = BitConverter.ToSingle(daten);
    }
    if ((leben is not null || schild is not null || ueber is not null) && Zeit() is double t && (Hole(VonFigur, channelIndex)?.Id ?? VomZustand(channelIndex)?.Id) is int id) {
      if (ueber is double us) {
        if (!Ueberschild.TryGetValue(id, out var lu)) Ueberschild[id] = lu = new();
        if (lu.Count == 0 || lu[^1][1] != Math.Round(us, 2)) lu.Add(new[] { Math.Round(t, 2), Math.Round(us, 2) });
      }
      if (leben is double h) LebenNotieren(id, t, Math.Round(h, 2));
      if (schild is double sc) {
        if (!Schild.TryGetValue(id, out var l)) Schild[id] = l = new();
        if (l.Count == 0 || l[^1][1] != Math.Round(sc, 2)) l.Add(new[] { Math.Round(t, 2), Math.Round(sc, 2) });
      }
    }
    return true;
  }
  void LebenNotieren(int i, double t, double wert) {
    if (!Leben.TryGetValue(i, out var l)) Leben[i] = l = new();
    if (l.Count > 0 && l[^1][1] == wert) return;
    // Sturmschaden: Lebenspunkte, die im Sturm verloren gehen, je Schlag hoechstens 10 (mehr ist ein Treffer). Am Boden blutet man aus, das zaehlt nicht.
    if (l.Count > 0 && wert < l[^1][1] && l[^1][1] - wert <= 10 && imSturm.Contains(i) && !AmBodenZuZeit(i, t)) ExtraVon(i)[ExtraSturm] += l[^1][1] - wert;
    l.Add(new[] { Math.Round(t, 2), wert });
  }

  int LootNr(string name) {
    if (!lootIndex.TryGetValue(name, out var n)) { n = LootNamen.Count; LootNamen.Add(name); lootIndex[name] = n; }
    return n;
  }

  /*
   * Truhen und Munitionskisten (Betreiber, 10.11.2026: Loot-Routen der Pros): wann eine Kiste geoeffnet wurde (bAlreadySearched) und wo sie steht.
   * [Zeit, x, y, z, Art (0 Truhe, 1 Munition, 2 sonst), Oeffner (-1 = unbekannt; in TruhenFertig() aus dem ersten Aufheben daneben)].
   */
  public readonly List<double[]> Truhen = new();
  readonly HashSet<uint> truheGesehen = new();
  static readonly Dictionary<Type, PropertyInfo> truhenFelder = new();
  static PropertyInfo TruhenFeld(Type t) { lock (truhenFelder) { if (!truhenFelder.TryGetValue(t, out var p)) truhenFelder[t] = p = t.GetProperty("bAlreadySearched"); return p; } }
  void TruheNotieren(uint kanal, INetFieldExportGroup g, PropertyInfo feld) {
    if (DiagId is not null && kistenDruck < 15 && Zeit() is double tk0 && tk0 > 700) { kistenDruck++; var teile = g.GetType().GetProperties().Select(pp => { object v; try { v = pp.GetValue(g); } catch { return null; } if (v is null) return null; var sv = v.ToString(); return pp.Name + "=" + (sv.Length > 70 ? sv[..70] : sv); }).Where(x => x is not null); var ak2 = Channels[kanal]?.Actor; Console.Error.WriteLine($"DIAGKISTE t={Math.Round(tk0, 2)} k={kanal} typ={g.GetType().Name} ort={ak2?.Location} arch={ak2?.Archetype?.Value} {string.Join(" ", teile)}"); }
    if (feld.GetValue(g) is not bool offen || !offen || Zeit() is not double t) return;
    var akteur = Channels[kanal]?.Actor; if (akteur is null) return;
    var id = akteur.ActorNetGUID?.Value ?? kanal; if (!truheGesehen.Add(id)) return;
    // Truhen stehen fest in der Karte und haben im Replay keinen Ort - gezaehlt wird hier nur, wie viele das Spiel als geoeffnet meldet (Gegenprobe zu den Kisten aus dem Loot).
    KistenLautSpiel++;
  }
  public readonly Dictionary<int, double[]> FarmVarianten = new();
  public int KistenLautSpiel; int pickupDruck, kistenDruck; public int KistenKanaele => kistenKanal.Count;
  readonly HashSet<uint> kistenKanal = new(); readonly List<uint> lootKanal = new();
  readonly List<(double t, double x, double y, double z, string name)> kistenStuecke = new();
  /// Wer hat die Kiste geoeffnet? Wer binnen 6 s danach in hoechstens 8 m Entfernung als Erster etwas aufhob.
  /// Tode (Zeit, x, y): was dort zugleich herausfliegt, ist das Inventar des Toten, keine Kiste.
  public List<(double t, double x, double y)> Tode = new();
  bool truhenFertig;
  public List<double[]> TruhenFertig() {
    if (!truhenFertig) {
      truhenFertig = true;
      /*
       * Eine Kiste = ein Spieler hebt binnen 4 s an einer Stelle (7 m) Gegenstaende auf, die aus einer Kiste geworfen wurden. Ort = wo er sie aufhob (die Kiste steht
       * zwei, drei Meter daneben), Zeit = kurz vor dem ersten Aufheben, Oeffner = er. Mit Waffe darin eine Truhe, sonst eine Munitionskiste.
       */
      var stuecke = Loot.Select((l, i) => (l, k: lootKanal[i])).Where((x) => x.l[5] == 1 && kistenKanal.Contains(x.k)).OrderBy((x) => x.l[0]).ToList();
      var gruppen = new List<(double t, double x, double y, double z, int wer, int waffen, int munition, int sonst, double letzte)>();
      foreach (var (l, _) in stuecke) {
        var n = LootNamen[(int)l[2]];
        var waffe = n.StartsWith("WID_", StringComparison.OrdinalIgnoreCase) ? 1 : 0;
        var mun = waffe == 0 && n.Contains("Ammo", StringComparison.OrdinalIgnoreCase) ? 1 : 0;
        var i = gruppen.FindLastIndex((g) => g.wer == (int)l[1] && l[0] - g.letzte < 4 && Math.Pow(g.x - l[3], 2) + Math.Pow(g.y - l[4], 2) < 700 * 700);
        if (i >= 0) { var g = gruppen[i]; gruppen[i] = g with { waffen = g.waffen + waffe, munition = g.munition + mun, sonst = g.sonst + (1 - waffe - mun), letzte = l[0] }; continue; }
        gruppen.Add((l[0], l[3], l[4], l.Length > 6 ? l[6] : 0, (int)l[1], waffe, mun, 1 - waffe - mun, l[0]));
      }
      // Truhe: eine Waffe und mindestens zwei weitere Stuecke; Munitionskiste: nur Munition (mindestens zwei Stuecke); sonst Boden-Loot (2).
      foreach (var g in gruppen) {
        var art = g.waffen >= 1 && g.waffen + g.munition + g.sonst >= 3 ? 0 : g.waffen == 0 && g.sonst == 0 && g.munition >= 2 ? 1 : 2;
        Truhen.Add(new[] { Math.Round(Math.Max(0, g.t - 0.5), 1), Math.Round(g.x), Math.Round(g.y), Math.Round(g.z), art, g.wer });
      }
    }
    return Truhen;
  }

  /// Aufgehoben: [Zeit, Spieler, Gegenstand, x, y, 1]; fallen gelassen: [..., 0].
  void LootNotieren(uint kanal, INetFieldExportGroup g) {
    if (Zeit() is not double t) return;
    object Wert(string k) { try { return g.GetType().GetProperty(k)?.GetValue(g); } catch { return null; } }
    if (DiagId is not null && pickupDruck < 40 && t > 700) {
      pickupDruck++;
      var teile = g.GetType().GetProperties().Select(pp => { object v; try { v = pp.GetValue(g); } catch { return null; } if (v is null) return null; var sv = v.ToString(); return pp.Name + "=" + (sv.Length > 70 ? sv[..70] : sv); }).Where(x => x is not null);
      Console.Error.WriteLine($"DIAGPICKUP t={Math.Round(t, 2)} k={kanal} {string.Join(" ", teile)}");
    }
    var name = Wert("ItemDefinition")?.GetType().GetProperty("Name")?.GetValue(Wert("ItemDefinition")) as string;
    if (name is not null) lootNameVonKanal[kanal] = name;
    else lootNameVonKanal.TryGetValue(kanal, out name);
    // Aus einer Kiste geworfen (das Kennzeichen kommt im Replay oft erst spaeter, zeitlich und oertlich unbrauchbar - nur das Kennzeichen je Kanal zaehlt).
    if (Wert("bTossedFromContainer") is bool raus && raus) kistenKanal.Add(kanal);
    var lage = (Wert("FinalTossRestLocation") ?? Wert("LootFinalPosition") ?? (Wert("ReplicatedMovement") is Unreal.Core.Models.FRepMovement rm2 ? rm2.Location : null)) as Unreal.Core.Models.FVector;
    if (lage is not null) lootLageVonKanal[kanal] = lage;
    else lootLageVonKanal.TryGetValue(kanal, out lage);
    void Eintrag(object figur, int auf) {
      var akteur = figur is uint or int or long ? figur : figur?.GetType().GetProperty("Value")?.GetValue(figur);
      if (akteur is null || name is null || lage is null) return;
      if (!spielerVonAkteur.TryGetValue(Convert.ToUInt32(akteur), out var sid)) return;
      var schluessel = $"{kanal}|{akteur}|{auf}|{name}";
      if (!lootGesehen.Add(schluessel)) return;
      Loot.Add(new[] { Math.Round(t, 1), sid, LootNr(name), Math.Round(lage.X), Math.Round(lage.Y), auf, Math.Round(lage.Z) }); lootKanal.Add(kanal);
      if (auf == 1) OrtNotieren(sid, t, lage.X, lage.Y, lage.Z);
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
      if (aufSpieler) OrtNotieren(ziel, t, pl.X, pl.Y, pl.Z);
    }
  }

  readonly Dictionary<uint, string> lootNameVonKanal = new();
  readonly Dictionary<uint, Unreal.Core.Models.FVector> lootLageVonKanal = new();

  static readonly string[] BusFelder = { "FlightStartLocation", "FlightStartRotation", "FlightSpeed", "TimeTillDropStart", "TimeTillDropEnd", "TimeTillFlightEnd", "AircraftStartTime" };

  protected override void OnExportRead(uint channelIndex, INetFieldExportGroup exportGroup) {
    if (DiagId is not null) kanalTyp[channelIndex] = exportGroup.GetType().Name;
    if (DiagId is int dw && exportGroup is FortniteReplayReader.Models.NetFieldExports.PlayerPawn pw && pw.CurrentWeapon is uint cwp && Zeit() is double twp && (Hole(VonFigur, channelIndex)?.Id ?? -1) == dw) {
      var wp = pfadVonAkteur.TryGetValue(cwp, out var wpp) ? wpp : null;
      if (wp is null) foreach (var kv in kanalAkteur) if (kv.Value == cwp && kanalTyp.TryGetValue(kv.Key, out var kt)) { wp = "typ:" + kt; break; }
      Console.Error.WriteLine($"DIAGWAFFE t={Math.Round(twp, 1)} spieler={dw} waffe={cwp} {wp}");
    }
    if (DiagId is not null && kanalAkteur.TryGetValue(channelIndex, out var prjAk) && pfadVonAkteur.TryGetValue(prjAk, out var prjPf) && prjPf is not null && prjPf.Contains("Prj_") && Zeit() is double tpj && DiagZeiten.Any(z => tpj >= z - 6 && tpj <= z + 1)) {
      var teile = exportGroup.GetType().GetProperties().Select(pp => { object v; try { v = pp.GetValue(exportGroup); } catch { return null; } if (v is null) return null; var sv = v.ToString(); return pp.Name + "=" + (sv.Length > 50 ? sv[..50] : sv); }).Where(x => x is not null).Take(15);
      Console.Error.WriteLine($"DIAGPRJ t={Math.Round(tpj, 2)} k={channelIndex} {exportGroup.GetType().Name}: {string.Join(" ", teile)}");
    }
    if (DiagId is not null && Zeit() is double tw && DiagZeiten.Any(z => tw >= z - 2.5 && tw <= z + 0.3)) {
      var wem = Hole(VonFigur, channelIndex)?.Id ?? VomZustand(channelIndex)?.Id;
      var nm = exportGroup.GetType().Name;
      if (nm != "PlayerPawn" || wem is not null) {
        var teile = exportGroup.GetType().GetProperties().Select(pp => { object v; try { v = pp.GetValue(exportGroup); } catch { return null; } if (v is null || v is false || (v is int iv && iv == 0) || (v is uint uv && uv == 0)) return null; var sv = v.ToString(); return pp.Name + "=" + (sv.Length > 60 ? sv[..60] : sv); }).Where(x => x is not null).Take(12);
        Console.Error.WriteLine($"DIAGEXPORT t={Math.Round(tw, 2)} k={channelIndex} spieler={wem} {nm}: {string.Join(" ", teile)}");
      }
    }
    base.OnExportRead(channelIndex, exportGroup);
    if (exportGroup.GetType().Name == "GameState") {
      foreach (var f in BusFelder) {
        try { var v = exportGroup.GetType().GetProperty(f)?.GetValue(exportGroup); if (v is not null) BusWerte[f] = v; } catch { }
      }
    }
    if (exportGroup is FortniteReplayReader.Models.NetFieldExports.FortPlayerState fs && VomZustand(channelIndex)?.Id is int zustandId) {
      if (fs.bThankedBusDriver == true) ExtraVon(zustandId)[ExtraBusfahrer] = 1;
      if (fs.WorldPlayerId is short welt && welt > 0) spielerVonWelt[welt] = zustandId;
      // Der Kill-Zaehler des Spiels selbst. Team-Summe und Spieler stimmen damit, nur Kills nach dem eigenen Aus zaehlt Osirion getrennt (siehe scripts/clutch-berechnen.mjs).
      if (fs.KillScore is uint ks && Zeit() is double tk) {
        if (!KillVerlauf.TryGetValue(zustandId, out var kl)) KillVerlauf[zustandId] = kl = new();
        kl.Add(new[] { Math.Round(tk, 2), ks });
      }
    }
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
      if (ort is not null && Zeit() is double to && Hole(VonFigur, channelIndex)?.Id is int oid) {
        OrtNotieren(oid, to, ort.X, ort.Y, ort.Z);
        // Strecke aus jedem Positions-Update (10.11.2026): die Proben alle 10 s (CharacterSample) liessen jede Kurve aus - gegen Osirion rund 35 % zu kurz.
        if (letzterOrt.TryGetValue(oid, out var lo) && to > lo.t) {
          var d = Math.Sqrt(Math.Pow(ort.X - lo.x, 2) + Math.Pow(ort.Y - lo.y, 2)) / 100; var dz = Math.Abs(ort.Z - lo.z) / 100; var dt = to - lo.t;
          if (!Strecken.TryGetValue(oid, out var st)) Strecken[oid] = st = new();
          st.Add((to, d, dz, dt));
        }
        letzterOrt[oid] = (to, ort.X, ort.Y, ort.Z);
      }
      if (Zeit() is double th && Hole(VonFigur, channelIndex)?.Id is int hid) {
        if (pawn.CurrentWeapon is uint cw) HandNotieren(hid, th, cw);
        var rot = pawn.Rotation ?? pawn.ReplicatedMovement?.Rotation;
        if (rot is not null) BlickNotieren(hid, th, Convert.ToDouble(rot.Yaw));
      }
      return;
    }
    if (exportGroup is SchleuderProjektil sp0) { SchleuderNotieren(channelIndex, sp0); return; }
    if (exportGroup is EffektCueParam ep0) {
      EffektParams++;
      var gp = ep0.GameplayCueParameters;
      var tag = ep0.GameplayCueTag?.TagName ?? "?";
      if (DiagId is not null) { EffektTags[tag] = (EffektTags.TryGetValue(tag, out var et) ? et : 0) + 1; }
      if (DiagId is not null && EffektParamDruck < 80 && !tag.Contains("Campfire") && !tag.Contains("Heal")) {
        EffektParamDruck++;
        var opfer = Hole(VonFigur, channelIndex)?.Id;
        var ins = gp?.Instigator is uint iu && figurVonAkteur.TryGetValue(iu, out var ik) ? Hole(VonFigur, ik)?.Id : (gp?.Instigator is uint iu2 && spielerVonAkteur.TryGetValue(iu2, out var isv) ? isv : (int?)null);
        Console.Error.WriteLine($"DIAGPARAM t={Math.Round(Zeit() ?? 0, 2)} opfer={opfer} tag={tag} raw={gp?.RawMagnitude} norm={gp?.NormalizedMagnitude} ins={gp?.Instigator}->{ins} causer={gp?.EffectCauser} src={gp?.SourceObject}");
      }
      return;
    }
    if (exportGroup is EffektCue ec0) {
      EffektCues++;
      if (DiagId is not null && ec0.Def is uint dfb && Zeit() is double tfb && Hole(VonFigur, channelIndex)?.Id is int ofb) {
        if (!defPfad.TryGetValue(dfb, out var dpb)) { dpb = GuidPfad(dfb); if (dpb != "?") defPfad[dfb] = dpb; }
        EffektAlle.Add((tfb, ofb, dpb));
      }
      if (ec0.Def is uint dfr && Zeit() is double tfr && Hole(VonFigur, channelIndex)?.Id is int opferR) {
        if (!defPfad.TryGetValue(dfr, out var dp)) { dp = GuidPfad(dfr); if (dp != "?") defPfad[dfr] = dp; }
        if (dp.Contains("GE_Ranged_GenericDamage")) EffektTreffer.Add((tfr, opferR));
      }
      if (DiagId is not null && ec0.Def is uint dz) { var gp = GuidPfad(dz); EffektArten[gp] = (EffektArten.TryGetValue(gp, out var ea) ? ea : 0) + 1; }
      if (DiagId is not null && EffektDruck < 60 && ec0.Def is uint dfx && System.Text.RegularExpressions.Regex.IsMatch(GuidPfad(dfx), "Damage|Ranged|Explosive")) {
        EffektDruck++;
        var opfer = Hole(VonFigur, channelIndex)?.Id;
        var ctx = ec0.EffectContext == null ? "-" : string.Join(",", ec0.EffectContext.GetType().GetProperties().Select(pp => { object v; try { v = pp.GetValue(ec0.EffectContext); } catch { return null; } return v is null ? null : pp.Name + "=" + v; }).Where(x => x != null).Take(12));
        var mods = ec0.ModifiedAttributes == null ? "-" : string.Join(";", ec0.ModifiedAttributes.Where(m => m != null).Select(m => $"{m.AttributeName}:{m.TotalMagnitude}:{m.AttributeOwner}"));
        Console.Error.WriteLine($"DIAGEFFEKT t={Zeit()} opfer={opfer} def={(ec0.Def is uint dd ? GuidPfad(dd) : "?")} mods={mods} ctx={ctx}");
      }
      return;
    }
    if (exportGroup.GetType().Name == "FortPickup") { LootNotieren(channelIndex, exportGroup); return; }
    if (exportGroup is FortniteReplayReader.Models.NetFieldExports.RPC.PlayerDamagedResourceBuilding prb && Zeit() is double tr0) { AbbauListe.Add((tr0, channelIndex, prb.PotentialResourceType, prb.PotentialResourceCount, prb.bDestroyed, prb.bJustHitWeakspot)); return; }
    if (TruhenFeld(exportGroup.GetType()) is PropertyInfo tf) { TruheNotieren(channelIndex, exportGroup, tf); return; }
    // (Lebenspunkte je Figur - FortRegenHealthSet - kommen in diesen Replays
    // nicht vor; geprueft am 29.9.2026. Deshalb kein Kappen auf den Rest.)
    if (exportGroup is not BatchedDamageCues c) return;
    Ereignisse++;
    SchussNotieren(channelIndex, c);
    // Diagnose (SCHADEN_DIAG=<Spieler-Id>, 10.11.2026): wo Treffer eines Spielers verloren gehen - Osirion zeigte bei manchen Squad-Spielern doppelt so viel Schaden.
    var diagVon = DiagId is int dg ? (Hole(VonFigur, channelIndex)?.Id ?? VomZustand(channelIndex)?.Id) : null;
    bool diag = DiagId is int dg2 && diagVon == dg2;
    if (DiagId is not null && !FelderGezeigt && Zeit() is double tfz && tfz > (DiagZeiten.Length > 0 ? DiagZeiten[0] : 0)) {
      FelderGezeigt = true;
      try {
        object F(object o, string n) { for (var t = o?.GetType(); t != null; t = t.BaseType) { var fi = t.GetField(n, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance); if (fi != null) return fi.GetValue(o); var pr = t.GetProperty(n, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance); if (pr != null) return pr.GetValue(o); } return null; }
        var gc = F(this, "_netGuidCache");
        var karte = F(gc, "NetFieldExportGroupMap") as System.Collections.IDictionary;
        Console.Error.WriteLine($"DIAGFELDER Karte waehrend des Lesens: {karte?.Count}");
        if (karte != null) foreach (System.Collections.DictionaryEntry kv in karte) {
          var name = kv.Key?.ToString() ?? "";
          if (!System.Text.RegularExpressions.Regex.IsMatch(name, "HitMarker|DamagedResource|BroadcastRemote", System.Text.RegularExpressions.RegexOptions.IgnoreCase)) continue;
          var ex = F(kv.Value, "NetFieldExports") as System.Collections.IEnumerable; var namen = new List<string>();
          if (ex != null) foreach (var e in ex) { var en = F(e, "Name")?.ToString(); if (!string.IsNullOrEmpty(en)) namen.Add(en); }
          Console.Error.WriteLine($"DIAGFELDER {name}: {string.Join(", ", namen)}");
        }
      } catch (Exception ex2) { Console.Error.WriteLine("DIAGFELDER Fehler " + ex2.Message); }
    }
    if (diag && Zeit() is double tz0 && DiagZeiten.Any(z => tz0 >= z - 10 && tz0 <= z + 1)) {
      var zielInfo = c.HitActor is uint hz ? $"{hz}:{DiagZiel(hz)}:figur={(figurVonAkteur.TryGetValue(hz, out var fk) ? fk.ToString() : "-")}:spielerAlt={(spielerVonAkteur.TryGetValue(hz, out var sa) ? sa.ToString() : "-")}" : "kein";
      Console.Error.WriteLine($"DIAGFENSTER t={Math.Round(tz0, 2)} ziel={zielInfo} mag={c.Magnitude} npHit={c.NonPlayerHitActor} npMag={c.NonPlayerMagnitude} krit={c.bIsCritical} schild={c.bIsShield} fatal={c.bIsFatal} ball={c.bIsBallistic}");
    }
    if (diag && DiagDump < 25) {
      DiagDump++;
      var teile = c.GetType().GetProperties().Select(pp => { object v; try { v = pp.GetValue(c); } catch { v = "?"; } if (v is null) return null; if (v is System.Collections.IEnumerable en && v is not string) v = "[" + string.Join(",", en.Cast<object>().Select(x => x?.ToString())) + "]"; return pp.Name + "=" + v; }).Where(x => x is not null);
      Console.Error.WriteLine("DIAGCUE t=" + Zeit() + " " + string.Join(" ", teile));
    }
    void D(string grund) {
      if (DiagId is null) return;
      if (diagVon is int dvn) {
        if (!KatJe.TryGetValue(dvn, out var kj)) KatJe[dvn] = kj = new();
        var kurz = string.Join(":", grund.Split(':').Take(3)) + (c.bWeaponActivate == true ? ":aktiv" : "");
        kj[kurz] = (kj.TryGetValue(kurz, out var kv0) ? kv0 : 0) + 1;
      }
      var g = (diag ? "" : "ALLE:") + grund;
      if (!diag && grund == "gezaehlt") g = "ALLE:gezaehlt";
      Diag.TryGetValue(g, out var a); Diag[g] = (a.Item1 + 1, a.Item2 + (c.Magnitude ?? 0));
      if (diag && grund != g) { Diag.TryGetValue("ALLE:" + grund, out var b); Diag["ALLE:" + grund] = (b.Item1 + 1, b.Item2 + (c.Magnitude ?? 0)); }
    }
    if (c.HitActor is null || c.Magnitude is null || c.Magnitude <= 0) {
      if (DiagId is not null) {
        string zielArt = "keinZiel";
        if (c.HitActor is uint ha) zielArt = figurVonAkteur.TryGetValue(ha, out var zk) && figurKanaele.Contains(zk) ? "zielSpieler" : spielerVonAkteur.ContainsKey(ha) ? "zielSpielerAlt" : "zielSonst";
        D($"ohneWert:{(c.Magnitude is null ? "null" : "0")}:{zielArt}:schild={c.bIsShield}:weg={c.bIsShieldDestroyed}:fatal={c.bIsFatal}:krit={c.bIsCritical}");
        // Pruefung (10.11.2026): Treffer ohne Wert auf einen Spieler - verlor das Ziel im selben Moment trotzdem etwas?
        if (diag && c.HitActor is uint hzN && Zeit() is double tzN && Hole(VonFigur, channelIndex)?.Id is int vzN) {
          int? anz = figurVonAkteur.TryGetValue(hzN, out var zkN) && figurKanaele.Contains(zkN) ? Hole(VonFigur, zkN)?.Id : spielerVonAkteur.TryGetValue(hzN, out var szN) ? szN : null;
          if (anz is int aN && aN != vzN) NullTreffer.Add((tzN, vzN, aN, c.bIsShield == true, c.bIsFatal == true, c.bWeaponActivate == true));
        }
      }
      return;
    }
    if (!figurKanaele.Contains(channelIndex)) { D("keinFigurKanal:" + (DiagId is null ? "" : (pfadVonAkteur.TryGetValue(kanalAkteur.TryGetValue(channelIndex, out var ka) ? ka : 0, out var kp) && kp is not null ? kp.Split('.').Last() : "ohneKlasse"))); return; }
    var von = Hole(VonFigur, channelIndex);
    int? anId = null; int? anTeam = null;
    if (figurVonAkteur.TryGetValue(c.HitActor.Value, out var zielKanal) && figurKanaele.Contains(zielKanal)) { var an0 = Hole(VonFigur, zielKanal); anId = an0?.Id; anTeam = an0?.TeamIndex; }
    else if (spielerVonAkteur.TryGetValue(c.HitActor.Value, out var sid2)) { anId = sid2; anTeam = teamVonSpieler.TryGetValue(sid2, out var tv) ? tv : null; Nachgetragen++; }
    /*
     * Ziel ueber den Akteur aufloesen (10.11.2026): Spielerfiguren ohne Bauplan in unserer Karte und Sonderfiguren (BP_PlayerPawn_NonParticipant_*, z. B. RookGecko)
     * kamen nie als PlayerPawn-Export an und galten als "unbekannt" - beim Squads Victory Cup fehlten so MrSavage 56 % Schaden gegen Osirion. Die Bibliothek kennt den
     * Spieler zum Akteur; gezaehlt wird es nur bei Figuren (Klasse mit PlayerPawn oder ohne Klasse), nicht bei Bauteilen, Fallen oder Gegenstaenden eines Spielers.
     */
    bool unsicher = false;
    if (anId is null && Environment.GetEnvironmentVariable("SCHADEN_AKTEUR") == "1") {
      var klasse = pfadVonAkteur.TryGetValue(c.HitActor.Value, out var kp0) ? kp0 : null;
      if (klasse is null || klasse.Contains("PlayerPawn")) {
        var ueber = Hole(VonAkteur, c.HitActor.Value);
        if (ueber?.Id is int uid) { anId = uid; anTeam = ueber.TeamIndex ?? (teamVonSpieler.TryGetValue(uid, out var tv2) ? tv2 : null); UeberAkteur++; unsicher = true; }
      }
    }
    if (von?.Id is null) { D("schuetzeUnbekannt"); return; }
    if (DiagId is not null && kanalAkteur.TryGetValue(channelIndex, out var eigAk) && spielerVonAkteur.TryGetValue(eigAk, out var eigId) && eigId != von.Id) {
      var k = "SCHUETZE-WIDERSPRUCH";
      Diag.TryGetValue(k, out var a); Diag[k] = (a.Item1 + 1, a.Item2 + c.Magnitude.Value);
    }
    if (DiagId is not null) { var zv = VomZustand(channelIndex)?.Id; }
    if (anId is null) {
      var art = figurVonAkteur.ContainsKey(c.HitActor.Value) ? "zielKanalNichtFigur" : "zielUnbekannt:" + (diag ? DiagZiel(c.HitActor.Value) : "");
      if (DiagId is not null) {
        var ueberAkteur = Hole(VonAkteur, c.HitActor.Value)?.Id;
        int? ueberKanal = null; foreach (var kv in kanalAkteur) if (kv.Value == c.HitActor.Value) { ueberKanal = Hole(VonFigur, kv.Key)?.Id ?? VomZustand(kv.Key)?.Id; if (ueberKanal is not null) break; }
        var los = ueberAkteur is not null ? "akteur" : ueberKanal is not null ? "kanal" : "nein";
        Diag.TryGetValue("AUFLOESBAR:" + los, out var ab); Diag["AUFLOESBAR:" + los] = (ab.Item1 + 1, ab.Item2 + c.Magnitude.Value);
        if (los != "nein") { var wer = ueberAkteur ?? ueberKanal; var k2 = "AUFLOESBAR-BEI:" + (pfadVonAkteur.TryGetValue(c.HitActor.Value, out var pp) && pp is not null ? pp.Split('.').Last() : "ohneKlasse"); Diag.TryGetValue(k2, out var ab2); Diag[k2] = (ab2.Item1 + 1, ab2.Item2 + c.Magnitude.Value); }
      }
      D(art);
      if (diag && Zeit() is double td) DiagOffen.Add((td, c.Magnitude.Value, art, c.HitActor.Value));
      if (DiagId is not null && Zeit() is double ta) DiagAlle.Add((ta, c.Magnitude.Value, art.StartsWith("zielUnbekannt") ? "unbekannt:" + DiagZiel(c.HitActor.Value) : art, c.HitActor.Value, von?.Id ?? -1));
      return;
    }
    if (von.Id == anId) { D("selbst"); return; }
    if (von.TeamIndex is not null && von.TeamIndex == anTeam) { D("eigenesTeam"); return; }
    D("gezaehlt");
    if (DiagId is not null) {
      // Ziel ein Bot/NPC (PlayerData.IsBot)? Osirion zaehlt "Damage to Players" ohne Bots.
      var zielPd = zielKanal != 0 && figurKanaele.Contains(zielKanal) ? Hole(VonFigur, zielKanal) : null;
      var kb = zielPd?.IsBot == true ? "ZIEL-BOT" : "ZIEL-MENSCH";
      Diag.TryGetValue(kb, out var bb); Diag[kb] = (bb.Item1 + 1, bb.Item2 + c.Magnitude.Value);
      if (diag) { Diag.TryGetValue("EIGEN-" + kb, out var eb); Diag["EIGEN-" + kb] = (eb.Item1 + 1, eb.Item2 + c.Magnitude.Value); }
    }
    Zugeordnet++;
    if (unsicher) Unsicher.Add(Liste.Count);
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
  /// Schuetze je Projektil-Kanal und die Treffer der Projektile: (Zeit, Schuetze, getroffene Figur als Akteur).
  readonly Dictionary<uint, int> projektilSchuetze = new();
  public readonly List<(double t, int von, uint zielAkteur)> ProjektilTreffer = new();
  void SchleuderNotieren(uint kanal, SchleuderProjektil p) {
    if (p.Instigator is uint ins && ins != 0) {
      var wer = figurVonAkteur.TryGetValue(ins, out var fk) ? Hole(VonFigur, fk)?.Id : null;
      wer ??= spielerVonAkteur.TryGetValue(ins, out var sv) ? sv : null;
      if (wer is int w) projektilSchuetze[kanal] = w;
    }
    var treffer = new List<Unreal.Core.Models.FHitResult>();
    if (p.PawnHitResults != null) treffer.AddRange(p.PawnHitResults.Where(h => h != null));
    if (p.SimulationStoppingHit != null) treffer.Add(p.SimulationStoppingHit);
    if (projektilSchuetze.TryGetValue(kanal, out var schuetze) && Zeit() is double tp) {
      foreach (var h in treffer) {
        object a = h.Actor;
        uint? ziel = a switch { uint u => u, Unreal.Core.Models.NetworkGUID g => g.Value, _ => uint.TryParse(a?.ToString(), out var x) ? x : null };
        // Nur Figuren von Spielern: eine Wand, ein Baum oder der Boden haben keinen Spieler.
        if (ziel is uint z && z != 0 && spielerVonAkteur.TryGetValue(z, out var opfer) && opfer != schuetze
            && !ProjektilTreffer.Any(q => q.zielAkteur == z && q.von == schuetze && Math.Abs(q.t - tp) < 0.05)) ProjektilTreffer.Add((tp, schuetze, z));
      }
    }
    if (DiagId is not null) Console.Error.WriteLine($"DIAGSCHLEUDER t={Zeit()} k={kanal} ins={p.Instigator} owner={p.Owner} charge={p.ChargePercent} treffer={treffer.Count} " + string.Join(" ; ", treffer.Select(h => string.Join(",", h.GetType().GetProperties().Select(pp => { object v; try { v = pp.GetValue(h); } catch { return null; } return v is null ? null : pp.Name + "=" + v; }).Where(x => x != null && (x.StartsWith("Actor") || x.StartsWith("Component") || x.StartsWith("BoneName") || x.StartsWith("PhysMat") || x.StartsWith("Item") || x.StartsWith("Hit") || x.StartsWith("Blocking")))))));
  }
  public int Nachgetragen, UeberAkteur;
  public static readonly int? DiagId = int.TryParse(Environment.GetEnvironmentVariable("SCHADEN_DIAG"), out var dgi) ? dgi : null;
  public readonly Dictionary<string, (int, double)> Diag = new();
  public readonly List<(double t, int von, int an, bool schild, bool fatal, bool aktiv)> NullTreffer = new();
  /// Diagnose: je Schuetze, wie viele Treffer-Ereignisse in welche Kategorie fielen.
  public readonly Dictionary<int, Dictionary<string, int>> KatJe = new();
  readonly Dictionary<uint, string> kanalTyp = new();
  public readonly List<(double t, double mag, string art, uint akteur)> DiagOffen = new();
  public readonly List<(double t, double mag, string art, uint akteur, int von)> DiagAlle = new();
  int DiagDump; bool FelderGezeigt;
  static readonly double[] DiagZeiten = (Environment.GetEnvironmentVariable("SCHADEN_ZEITEN") ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries).Select(x => double.Parse(x, System.Globalization.CultureInfo.InvariantCulture)).ToArray();
  /// Zu welchem Kanal ein Akteur gehoert (umgekehrt zu kanalAkteur) - nur fuer die Diagnose.
  string DiagZiel(uint akteur) {
    var klasse = pfadVonAkteur.TryGetValue(akteur, out var pf) && pf is not null ? System.Text.RegularExpressions.Regex.Replace(pf.Split('/').Last().Split('.').Last(), @"_C$", "") : "ohneKlasse";
    klasse = System.Text.RegularExpressions.Regex.Replace(klasse, @"PBWA_[WSM]1_\w+", "Bauteil");
    var offen = kanalAkteur.Values.Contains(akteur) ? "offen" : "zu";
    return offen + ":" + klasse;
  }
  readonly Dictionary<int, int?> teamVonSpieler = new();
  /// Wann ein Spieler am Boden lag (umgehauen bis aufgestanden oder tot) - aus dem Kill-Feed.
  public Dictionary<int, List<(double ab, double bis)>> AmBoden = new();
  /// Wer hat umgehauen: (Opfer, Zeit) -> Spieler (Kill-Feed, FinisherOrDowner).
  public readonly Dictionary<(int, double), int> Knocker = new();
  readonly HashSet<(int, double)> VerbrauchteKnocks = new();
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
    // Ohne Spielende die letzte bekannte Zeit - vorher double.MaxValue: ein Spieler, der beim Abbruch der Aufnahme im Sturm stand, hatte 1,8e308 Sekunden (Seite zeigte "2,99e+306:08", 7.11.2026).
    var letzte = SturmListe.Count > 0 ? SturmListe.Max(x => x.t) : 0;
    double Schluss(int id) => tod.TryGetValue(id, out var t) ? t : (ende ?? letzte);
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

  /*
   * Der Knock- oder Kill-Schuss zaehlt nur so viel, wie der Gegner noch hatte: Leben + Schild + Overshield direkt davor (8.11.2026). So zaehlt Osirion -
   * an zehn Matches des Betreibers (ZB Duos EU) Match fuer Match 0 bis 2 Punkte daneben, zusammen 7.327 zu 7.318; ohne die Kappung 7.826 (+7 %).
   */
  static double WertVor(Dictionary<int, List<double[]>> serien, int id, double t, double standard) {
    if (!serien.TryGetValue(id, out var l) || l.Count == 0) return standard;
    double? w = null; foreach (var x in l) { if (x[0] < t - 0.05) w = x[1]; else break; }
    return w ?? standard;
  }
  public double Wirksam((int von, int an, double hoehe, bool krit, bool schild, double? t, bool fatal) e) {
    if (!e.fatal || e.t is not double t) return e.hoehe;
    var rest = WertVor(Leben, e.an, t, 100) + WertVor(Schild, e.an, t, 0) + WertVor(Ueberschild, e.an, t, 0);
    return Math.Min(e.hoehe, Math.Max(0, rest));
  }
  public readonly Dictionary<int, double> GenommenOhneBoden = new();
  /// Treffer, deren Ziel nur ueber den Akteur bekannt ist - sie zaehlen nur, wenn das Ziel im selben Moment wirklich Leben, Schild oder Overshield verlor.
  public readonly HashSet<int> Unsicher = new();
  public int UnsicherVerworfen, UnsicherBestaetigt;
  bool Bestaetigt(int an, double t, double hoehe) {
    double Summe(double z) => WertVor(Leben, an, z + 0.05, 100) + WertVor(Schild, an, z + 0.05, 0) + WertVor(Ueberschild, an, z + 0.05, 0);
    var verlust = Summe(t - 0.15) - Summe(t + 0.6);
    return verlust >= Math.Min(hoehe, 20) * 0.5;
  }
  public int ProjektilGezaehlt, EffektGezaehlt; public double ProjektilSchaden, EffektSchaden; public int EffektCues;
  /*
   * Die Bibliothek fuehrt je Klasse eine feste Liste der RPCs (_classNetCacheToNetFieldGroup). Fuer die Spielerfigur fehlt dort das Schadens-Ereignis der Gameplay-Effekte
   * (NetMulticast_InvokeGameplayCueExecuted_FromSpec, mit TotalMagnitude und Verursacher) - hier wird es als vierter Eintrag ergaenzt, nach dem Vorbild der BatchedDamageCues.
   */
  /// Diagnose: alle Feld-Gruppen, die das Replay bis zum Ende angelegt hat und deren Name passt - mit ihren Feldern.
  public void FelderZeigen(string muster) {
    try {
      object F(object o, string n) { for (var t = o?.GetType(); t != null; t = t.BaseType) { var fi = t.GetField(n, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance); if (fi != null) return fi.GetValue(o); var pr = t.GetProperty(n, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance); if (pr != null) return pr.GetValue(o); } return null; }
      var karte = F(F(this, "_netGuidCache"), "NetFieldExportGroupMap") as System.Collections.IDictionary;
      Console.Error.WriteLine($"FELDENDE Gruppen insgesamt: {karte?.Count}");
      if (karte != null) foreach (System.Collections.DictionaryEntry kv in karte) {
        var name = kv.Key?.ToString() ?? "";
        if (!System.Text.RegularExpressions.Regex.IsMatch(name, muster, System.Text.RegularExpressions.RegexOptions.IgnoreCase)) continue;
        var ex = F(kv.Value, "NetFieldExports") as System.Collections.IEnumerable; var namen = new List<string>();
        if (ex != null) foreach (var e in ex) { var en = F(e, "Name")?.ToString(); if (!string.IsNullOrEmpty(en)) namen.Add(en); }
        Console.Error.WriteLine($"FELDENDE {name}: {string.Join(", ", namen)}");
      }
    } catch (Exception e) { Console.Error.WriteLine("FELDENDE Fehler " + e.Message); }
  }
  public static bool EffektEingeklinkt;
  public readonly Dictionary<string, int> EffektArten = new();
  int EffektDruck, EffektParamDruck; public int EffektParams; public readonly Dictionary<string, int> EffektTags = new();
  string GuidPfad(uint g) {
    try {
      object F(object o, string n) { for (var t = o?.GetType(); t != null; t = t.BaseType) { var fi = t.GetField(n, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance); if (fi != null) return fi.GetValue(o); var pr = t.GetProperty(n, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance); if (pr != null) return pr.GetValue(o); } return null; }
      var d = F(F(this, "_netGuidCache"), "NetGuidToPathName") as System.Collections.IDictionary;
      if (d != null) foreach (System.Collections.DictionaryEntry kv in d) { var k = kv.Key; var v = k is uint u ? u : k?.GetType().GetProperty("Value")?.GetValue(k) is uint u2 ? u2 : 0; if (v == g) return kv.Value?.ToString() ?? "?"; }
    } catch { }
    return "?";
  }
  public static void EffektEinklinken(object leser) {
    try {
      object F(object o, string n) { for (var t = o?.GetType(); t != null; t = t.BaseType) { var fi = t.GetField(n, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance); if (fi != null) return fi.GetValue(o); } return null; }
      var parser = F(leser, "_netFieldParser");
      var caches = F(parser, "_classNetCacheToNetFieldGroup") as System.Collections.IDictionary;
      var figur = caches?["PlayerPawn_Athena_C_ClassNetCache"];
      var props = figur?.GetType().GetProperty("Properties", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)?.GetValue(figur) as System.Collections.IDictionary;
      if (props == null || props.Contains("NetMulticast_InvokeGameplayCueExecuted_FromSpec")) { EffektEingeklinkt = props != null; return; }
      var vorbild = props["NetMulticast_Athena_BatchedDamageCues"];
      var kopie = typeof(object).GetMethod("MemberwiseClone", BindingFlags.NonPublic | BindingFlags.Instance).Invoke(vorbild, null);
      void Setze(string n, object v) { var pr = kopie.GetType().GetProperty(n, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance); if (pr?.CanWrite == true) pr.SetValue(kopie, v); else kopie.GetType().GetField($"<{n}>k__BackingField", BindingFlags.NonPublic | BindingFlags.Instance)?.SetValue(kopie, v); }
      Setze("PropertyInfo", typeof(FigurCacheMitEffekt).GetProperty(nameof(FigurCacheMitEffekt.EffektCue)));
      Setze("Name", "NetMulticast_InvokeGameplayCueExecuted_FromSpec");
      Setze("PathName", "/Script/FortniteGame.FortPawn:NetMulticast_InvokeGameplayCueExecuted_FromSpec");
      props["NetMulticast_InvokeGameplayCueExecuted_FromSpec"] = kopie;
      var kopie2 = typeof(object).GetMethod("MemberwiseClone", BindingFlags.NonPublic | BindingFlags.Instance).Invoke(vorbild, null);
      void Setze2(string n, object v) { var pr = kopie2.GetType().GetProperty(n, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance); if (pr?.CanWrite == true) pr.SetValue(kopie2, v); else kopie2.GetType().GetField($"<{n}>k__BackingField", BindingFlags.NonPublic | BindingFlags.Instance)?.SetValue(kopie2, v); }
      Setze2("PropertyInfo", typeof(FigurCacheMitEffekt).GetProperty(nameof(FigurCacheMitEffekt.EffektCueParam)));
      Setze2("Name", "NetMulticast_InvokeGameplayCueExecuted_WithParams");
      Setze2("PathName", "/Script/FortniteGame.FortPawn:NetMulticast_InvokeGameplayCueExecuted_WithParams");
      props["NetMulticast_InvokeGameplayCueExecuted_WithParams"] = kopie2;
      EffektEingeklinkt = true;
    } catch (Exception e) { Console.Error.WriteLine("Effekt-Ereignis nicht eingeklinkt: " + e.Message); }
  }
  /// Schadens-Effekte ohne Treffer-Ereignis (GE_Ranged_GenericDamage - die FirePetal-Pump): Zeit und Opfer, der Schuetze steht nicht darin.
  public readonly List<(double t, int an)> EffektTreffer = new();
  public readonly List<(double t, int an, string art)> EffektAlle = new();
  readonly Dictionary<uint, string> defPfad = new();
  public int EffektZugeordnet, EffektOhneSchuetze, EffektMehrdeutig;
  static double? WertBei(Dictionary<int, List<double[]>> d, int id, double t, int feld = 1) {
    if (!d.TryGetValue(id, out var l)) return null; double[] w = null; foreach (var x in l) { if (x[0] <= t) w = x; else break; } return w?[feld];
  }
  /*
   * Wer hat geschossen? Ein Gegner mit der FirePetal-Pump in der Hand (zuletzt gewechselt vor dem Effekt) und hoechstens 60 m vom Opfer. Ist es genau einer, gehoert ihm
   * der Treffer; sonst der, in dessen Blickrichtung (30 Grad) das Opfer steht - und nur, wenn das genau einer ist. Sonst zaehlt er nicht (und steht in der Diagnose).
   */
  int? EffektSchuetze(double t, int an) {
    var anTeam = teamVonSpieler.TryGetValue(an, out var ta) ? ta : null;
    // Zuerst: wer hat kurz davor (bis 1,5 s) mit der FirePetal geschossen? Das Magazin sinkt beim Schuss.
    var geschossen = firePetalSchuesse.Where(f => f.t >= t - 1.5 && f.t <= t + 0.1).Select(f => SpielerDerWurzel(f.wurzel)).OfType<int>()
      .Where(id => id != an && (anTeam is null || (teamVonSpieler.TryGetValue(id, out var tg) ? tg : null) != anTeam)).Distinct().ToList();
    if (geschossen.Count == 1) return geschossen[0];
    if (DiagId is not null) Console.Error.WriteLine($"DIAGEFFSCHUSS t={Math.Round(t, 2)} an={an} geschossen={string.Join(",", geschossen)} alle={firePetalSchuesse.Count}");
    if (geschossen.Count > 1) { EffektMehrdeutig++; return null; }
    double? Ort(int id, int f) { if (!Orte.TryGetValue(id, out var l)) return null; double[] w = null; foreach (var x in l) { if (x[0] <= t + 0.5) w = x; else break; } return w is not null && t - w[0] <= 3 ? w[f] : null; }
    var ax = Ort(an, 1); var ay = Ort(an, 2);
    var kandidaten = new List<(int id, double dist, double winkel)>();
    foreach (var (id, l) in Hand) {
      if (id == an) continue;
      var tm = teamVonSpieler.TryGetValue(id, out var tv) ? tv : null; if (anTeam is not null && tm == anTeam) continue;
      var nr = WertBei(Hand, id, t); if (nr is not double n || n < 0 || n >= WaffenNamen.Count || !(WaffenNamen[(int)n] ?? "").Contains("FirePetal")) continue;
      var x = Ort(id, 1); var y = Ort(id, 2);
      double dist = ax is double && x is double ? Math.Sqrt(Math.Pow(ax.Value - x.Value, 2) + Math.Pow(ay.Value - y.Value, 2)) : double.NaN;
      if (!double.IsNaN(dist) && dist > 6000) continue;
      double winkel = double.NaN;
      if (!double.IsNaN(dist) && WertBei(Blick, id, t) is double yaw) { var soll = Math.Atan2(ay.Value - y.Value, ax.Value - x.Value) * 180 / Math.PI; winkel = Math.Abs(((soll - yaw) % 360 + 540) % 360 - 180); }
      kandidaten.Add((id, dist, winkel));
    }
    if (kandidaten.Count == 1) return kandidaten[0].id;
    var blick = kandidaten.Where(k => !double.IsNaN(k.winkel) && k.winkel <= 30).ToList();
    if (blick.Count == 1) return blick[0].id;
    if (kandidaten.Count == 0) EffektOhneSchuetze++; else EffektMehrdeutig++;
    if (DiagId is not null) Console.Error.WriteLine($"DIAGEFFTREFFER t={Math.Round(t, 2)} an={an} kandidaten={string.Join(",", kandidaten.Select(k => $"{k.id}:{Math.Round(k.dist)}:{Math.Round(k.winkel)}"))}");
    return null;
  }
  static readonly double ProjektilFenster = double.TryParse(Environment.GetEnvironmentVariable("SCHADEN_FENSTER"), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var pf) ? pf : 0.6;
  /*
   * Projektil-Treffer (Steinschleuder) als Schaden: genau der Verlust an Leben + Schild + Overshield des getroffenen Spielers im Moment des Treffers
   * (0,15 s davor bis 0,6 s danach), abzueglich dessen, was gezaehlte Treffer anderer im selben Fenster schon erklaeren. Ohne Verlust kein Schaden.
   */
  void ProjektileEinrechnen(double? busAb) {
    var alle = ProjektilTreffer.Where(x => spielerVonAkteur.ContainsKey(x.zielAkteur)).Select(x => (x.t, x.von, an: spielerVonAkteur[x.zielAkteur], effekt: false)).ToList();
    // FirePetal-Effekte: nur wenn im selben Moment kein Treffer-Ereignis auf dieses Opfer gezaehlt ist (dann ist der Effekt schon erklaert).
    // Nur zum Testen (SCHADEN_EFFEKT=1): am Squads Victory Cup R2 (17 Matches) brachte es Calle88 nichts, und die meisten Effekte hatten keinen FirePetal-Schuss davor -
    // die Zuordnung ist nicht bewiesen, also zaehlt sie nicht.
    if (Environment.GetEnvironmentVariable("SCHADEN_EFFEKT") == "1")
      foreach (var (te, an0) in EffektTreffer) {
        if (Liste.Any(e => e.an == an0 && e.t is double et && et >= te - 0.3 && et <= te + 0.1)) continue;
        if (EffektSchuetze(te, an0) is int sv) { alle.Add((te, sv, an0, true)); EffektZugeordnet++; }
      }
    foreach (var (t, von, an, effekt) in alle.OrderBy(x => x.t)) {
      if (busAb is not null && t < busAb) continue;
      var vonTeam = teamVonSpieler.TryGetValue(von, out var tv) ? tv : null; var anTeam = teamVonSpieler.TryGetValue(an, out var ta) ? ta : null;
      if (vonTeam is not null && vonTeam == anTeam) continue;
      // Schon am Boden (Knock vor dem Treffer): zaehlt nicht - Osirion zaehlt keinen Schaden auf Umgehauene.
      if (AmBoden.TryGetValue(an, out var bzv) && bzv.Any(z => z.ab < t - 0.02 && t <= z.bis)) continue;
      double Summe(double z) => WertVor(Leben, an, z, 100) + WertVor(Schild, an, z, 0) + WertVor(Ueberschild, an, z, 0);
      // Haut der Treffer um, springt das Leben danach auf den Boden-Wert: dann zaehlt alles, was er bis zum Knock noch hatte (wie der Knock-Schuss bei Osirion).
      // Nur wenn der Kill-Feed genau diesen Schuetzen als Knocker nennt.
      var knock = AmBoden.TryGetValue(an, out var bz) ? bz.Where(z => z.ab >= t - 0.02 && z.ab <= t + ProjektilFenster && Knocker.TryGetValue((an, Math.Round(z.ab, 2)), out var kv) && kv == von).Select(z => (double?)z.ab).FirstOrDefault() : null;
      // Der Knock gehoert dem Schuss, der ihn ausloest: kommt vor dem Knock noch ein Projektil desselben Schuetzen auf dasselbe Opfer, ist dieser hier ein gewoehnlicher Treffer.
      if (knock is double kn && (VerbrauchteKnocks.Contains((an, kn)) || alle.Any(q => q.von == von && q.t > t && q.t <= kn + 0.05 && q.an == an))) knock = null;
      if (knock is double kn2) VerbrauchteKnocks.Add((an, kn2));
      var naechsterKnock = AmBoden.TryGetValue(an, out var bz2) ? bz2.Where(z => z.ab > t && z.ab <= t + ProjektilFenster).Select(z => (double?)z.ab).FirstOrDefault() : null;
      var ende = Math.Min(t + ProjektilFenster, (naechsterKnock ?? double.MaxValue) - 0.05);
      var verlust = knock is double kab ? Summe(t - 0.15) : Summe(t - 0.15) - Summe(ende);
      var schonErklaert = Liste.Where(e => e.an == an && e.t is double et && et >= t - 0.15 && et <= (knock ?? t + ProjektilFenster)).Sum(e => e.hoehe);
      var h = Math.Round(verlust - schonErklaert);
      if (h <= 0) continue;
      var fatal = knock is not null || Summe(t + ProjektilFenster) <= 0;
      Liste.Add((von, an, h, false, false, t, fatal));
      if (effekt) { EffektGezaehlt++; EffektSchaden += h; } else { ProjektilGezaehlt++; ProjektilSchaden += h; }
      if (DiagId is int dgp && dgp == von) Console.Error.WriteLine($"DIAGPRJTREFFER t={Math.Round(t, 2)} an={an} h={h} knock={knock} vor={Math.Round(Summe(t - 0.15))} nach={Math.Round(Summe(ende))} erklaert={Math.Round(schonErklaert)} leben={WertVor(Leben, an, t - 0.15, -1)} schild={WertVor(Schild, an, t - 0.15, -1)} ueber={WertVor(Ueberschild, an, t - 0.15, -1)}");
    }
  }
  public void Zaehle(double? busAb) {
    // Seit 10.11.2026 immer (Fassung 12); SCHADEN_NEU=0 schaltet es nur fuer Vergleiche ab.
    if (Environment.GetEnvironmentVariable("SCHADEN_NEU") != "0") ProjektileEinrechnen(busAb);
    for (int i = 0; i < Liste.Count; i++) {
      var e = Liste[i];
      if (Unsicher.Contains(i)) {
        if (e.t is not double tu || !Bestaetigt(e.an, tu, e.hoehe)) {
          UnsicherVerworfen++;
          if (DiagId is not null && e.t is double tq) {
            // Wer verlor stattdessen im selben Moment etwa so viel?
            var wer = Leben.Keys.Union(Schild.Keys).Where(id => id != e.von && Bestaetigt(id, tq, e.hoehe)).ToList();
            var k = $"UNSICHER-ZUGEORDNET {e.an} -> verlor: {(wer.Count == 0 ? "niemand" : wer.Count == 1 ? wer[0].ToString() : "mehrere")}";
            Diag.TryGetValue(k, out var a); Diag[k] = (a.Item1 + 1, a.Item2 + e.hoehe);
          }
          continue;
        }
        UnsicherBestaetigt++;
      }
      if (busAb is not null && e.t is not null && e.t < busAb) { VorDemBus++; continue; }
      var h = Wirksam(e);
      var s1 = Fuer(e.von); s1.Gemacht += h; s1.Treffer++;
      bool amBoden = e.t is double tt && AmBodenZuZeit(e.an, tt);
      if (!amBoden) { s1.TrefferOhneBoden++; if (i > 0 && Liste[i - 1].von == e.von && Liste[i - 1].an == e.an && Liste[i - 1].t is double tv && e.t is double tn && Math.Abs(tn - tv) < 0.05) s1.TrefferGleichzeitig++; }
      if (amBoden) AufBoden++; else { ohneBoden[e.von] = (ohneBoden.TryGetValue(e.von, out var alt) ? alt : 0) + h; GenommenOhneBoden[e.an] = (GenommenOhneBoden.TryGetValue(e.an, out var g0) ? g0 : 0) + h; }
      if (!e.fatal) ohneFatal[e.von] = (ohneFatal.TryGetValue(e.von, out var alt2) ? alt2 : 0) + h;
      if (e.krit) s1.Krit++;
      if (e.schild) s1.AufSchild += h;
      Fuer(e.an).Genommen += h;
    }
  }

  /*
   * Diagnose (10.11.2026): zaehlen wir mehr, als das Opfer noch hatte? Je Opfer der Reihe nach: der Rest (Leben + Schild + Overshield) laut Verlauf vor dem Treffer, und
   * ist der Verlauf seit dem letzten Treffer nicht weitergelaufen, der Rest minus die Treffer seither. Was darueber liegt, ist Ueberschuss - je Schuetze summiert.
   * Ergebnis je Schuetze: [Ueberschuss, Treffer mit Ueberschuss, Ueberschuss nur bei nicht-toedlichen Treffern].
   */
  public Dictionary<int, double[]> UeberschussJe(double? busAb) {
    var raus = new Dictionary<int, double[]>();
    foreach (var g in Liste.Where(e => e.t is double t && (busAb is null || t >= busAb) && !AmBodenZuZeit(e.an, t)).GroupBy(e => e.an)) {
      double? letzteSerie = null; double laufend = 0;
      foreach (var e in g.OrderBy(e => e.t)) {
        var t = e.t.Value;
        var serie = WertVor(Leben, e.an, t, 100) + WertVor(Schild, e.an, t, 0) + WertVor(Ueberschild, e.an, t, 0);
        if (letzteSerie is double ls && Math.Abs(ls - serie) < 0.01) { } else laufend = serie;
        letzteSerie = serie;
        var h = Wirksam(e);
        var ueber = Math.Max(0, h - Math.Max(0, laufend));
        laufend -= h;
        if (ueber <= 0.5) continue;
        if (!raus.TryGetValue(e.von, out var a)) raus[e.von] = a = new double[3];
        a[0] += ueber; a[1] += 1; if (!e.fatal) a[2] += ueber;
      }
    }
    return raus;
  }

  /*
   * Pruefbericht fuer einen Schuetzen (Diagnose, 10.11.2026): jeder seiner Treffer gegen den Verlust des Opfers im selben Moment (0,15 s davor bis 0,6 s danach).
   *  ZUVIEL: was alle gezaehlten Treffer im Fenster erklaeren, ist mehr als das Opfer verlor (zu viel gezaehlt).
   *  NULL:   Treffer ohne Wert - das Opfer verlor aber etwas, das kein gezaehlter Treffer erklaert (fehlt bei uns).
   */
  public void Pruefbericht(int wer, double? busAb) {
    double Summe(int an, double z) => WertVor(Leben, an, z, 100) + WertVor(Schild, an, z, 0) + WertVor(Ueberschild, an, z, 0);
    double erklaertAuf(int an, double a, double b) => Liste.Where(e => e.an == an && e.t is double et && et >= a && et <= b && !AmBodenZuZeit(an, et)).Sum(e => Wirksam(e));
    double zuviel = 0; int nZuviel = 0;
    foreach (var e in Liste.Where(e => e.von == wer && e.t is double t && (busAb is null || t >= busAb) && !AmBodenZuZeit(e.an, t))) {
      var t = e.t.Value; var verlust = Summe(e.an, t - 0.15) - Summe(e.an, t + 0.6); var erkl = erklaertAuf(e.an, t - 0.15, t + 0.6);
      var knock = AmBoden.TryGetValue(e.an, out var bz) && bz.Any(z => z.ab >= t - 0.2 && z.ab <= t + 0.6);
      if (erkl > verlust + 5 && !knock) { zuviel += Math.Min(Wirksam(e), erkl - verlust); nZuviel++; Console.Error.WriteLine($"PRUEF ZUVIEL t={Math.Round(t, 2)} an={e.an} h={Wirksam(e)} verlust={Math.Round(verlust)} erklaert={Math.Round(erkl)} schild={e.schild} fatal={e.fatal}"); }
    }
    double fehlt = 0; int nFehlt = 0;
    foreach (var n in NullTreffer.Where(n => n.von == wer && (busAb is null || n.t >= busAb) && !AmBodenZuZeit(n.an, n.t))) {
      var verlust = Summe(n.an, n.t - 0.15) - Summe(n.an, n.t + 0.6); var erkl = erklaertAuf(n.an, n.t - 0.15, n.t + 0.6);
      var offen = verlust - erkl;
      Console.Error.WriteLine($"PRUEF NULL t={Math.Round(n.t, 2)} an={n.an} verlust={Math.Round(verlust)} erklaert={Math.Round(erkl)} offen={Math.Round(offen)} schild={n.schild} fatal={n.fatal} aktiv={n.aktiv}");
      if (offen > 5) { fehlt += offen; nFehlt++; }
    }
    Console.Error.WriteLine($"PRUEF SUMME spieler={wer} zuviel={Math.Round(zuviel)} ({nZuviel} Treffer) fehlt-bei-Null-Treffern={Math.Round(fehlt)} ({nFehlt}) Null-Treffer={NullTreffer.Count(n => n.von == wer)}");
  }

  /// Jeder zugeordnete Treffer nach dem Bus, kompakt fuer die Replay-Ansicht ("wer hat wen angeschossen", Betreiber 28.10.2026):
  /// [Zeit, Schuetze, Ziel, Schaden, Kopftreffer 0/1, Ziel am Boden 0/1, toedlich 0/1, auf den Schild 0/1].
  public List<double[]> TrefferListe(double? busAb) {
    var raus = new List<double[]>();
    foreach (var e in Liste) {
      if (e.t is not double t || (busAb is not null && t < busAb)) continue;
      bool amBoden = AmBodenZuZeit(e.an, t);
      raus.Add(new[] { Math.Round(t, 3), e.von, e.an, Math.Round(Wirksam(e)), e.krit ? 1 : 0, amBoden ? 1 : 0, e.fatal ? 1 : 0, e.schild ? 1 : 0 });
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

/*
 * Schaden ueber Gameplay-Effekte (10.11.2026): Feuer und andere Effekte melden den Schaden beim Opfer mit genauem Betrag (TotalMagnitude) und Verursacher
 * (EffectContext). Die Bibliothek liest bei der Spielerfigur nur drei Ereignisarten - hier dieselben drei plus diese.
 */
[NetFieldExportGroup("/Script/FortniteGame.FortPawn:NetMulticast_InvokeGameplayCueExecuted_FromSpec", (ParseMode)3)]
public class EffektCue : INetFieldExportGroup {
  [NetFieldExport("Def", RepLayoutCmdType.PropertyObject)] public uint? Def { get; set; }
  [NetFieldExport("AttributeName", RepLayoutCmdType.PropertyString)] public string AttributeName { get; set; }
  [NetFieldExport("TotalMagnitude", RepLayoutCmdType.PropertyFloat)] public float? TotalMagnitude { get; set; }
  [NetFieldExport("EffectContext", RepLayoutCmdType.Property)] public Unreal.Core.Models.FGameplayEffectContextHandle EffectContext { get; set; }
  [NetFieldExport("ModifiedAttributes", RepLayoutCmdType.DynamicArray)] public EffektAttribut[] ModifiedAttributes { get; set; }
}
[NetFieldExportSubGroup("/Script/FortniteGame.FortPawn:NetMulticast_InvokeGameplayCueExecuted_FromSpec", ParseMode.Full)]
public class EffektAttribut {
  [NetFieldExport("AttributeName", RepLayoutCmdType.PropertyString)] public string AttributeName { get; set; }
  [NetFieldExport("AttributeOwner", RepLayoutCmdType.PropertyObject)] public uint? AttributeOwner { get; set; }
  [NetFieldExport("TotalMagnitude", RepLayoutCmdType.PropertyFloat)] public float? TotalMagnitude { get; set; }
}
[NetFieldExportGroup("/Script/FortniteGame.FortPawn:NetMulticast_InvokeGameplayCueExecuted_WithParams", (ParseMode)3)]
public class EffektCueParam : INetFieldExportGroup {
  [NetFieldExport("GameplayCueTag", RepLayoutCmdType.Property)] public Unreal.Core.Models.FGameplayTag GameplayCueTag { get; set; }
  [NetFieldExport("GameplayCueParameters", RepLayoutCmdType.Property)] public Unreal.Core.Models.FGameplayCueParameters GameplayCueParameters { get; set; }
}
[NetFieldExportClassNetCache("PlayerPawn_Athena_C_ClassNetCache", (ParseMode)3)]
public class FigurCacheMitEffekt {
  [NetFieldExportRPC("ClientObservedStats", "/Script/FortniteGame.FortClientObservedStat", false, false, false)] public FortniteReplayReader.Models.NetFieldExports.FortClientObservedStat ClientObservedStats { get; set; }
  [NetFieldExportRPC("NetMulticast_Athena_BatchedDamageCues", "/Script/FortniteGame.FortPawn:NetMulticast_Athena_BatchedDamageCues", true, true, false)] public BatchedDamageCues DamageCues { get; set; }
  [NetFieldExportRPC("NetMulticast_InvokeGameplayCueAdded_WithParams", "/Script/FortniteGame.FortPawn:NetMulticast_InvokeGameplayCueAdded_WithParams", true, true, false)] public GameplayCue InvokeGameplayCueAdded { get; set; }
  [NetFieldExportRPC("NetMulticast_InvokeGameplayCueExecuted_FromSpec", "/Script/FortniteGame.FortPawn:NetMulticast_InvokeGameplayCueExecuted_FromSpec", true, true, false)] public EffektCue EffektCue { get; set; }
  [NetFieldExportRPC("NetMulticast_InvokeGameplayCueExecuted_WithParams", "/Script/FortniteGame.FortPawn:NetMulticast_InvokeGameplayCueExecuted_WithParams", true, true, false)] public EffektCueParam EffektCueParam { get; set; }
}

/*
 * Das Projektil der Steinschleuder (10.11.2026): ihr Treffer erzeugt keinen BatchedDamageCues-Eintrag - MrSavage fehlten so 56 % Damage gegen Osirion.
 * Instigator ist die Figur des Schuetzen, PawnHitResults die getroffenen Figuren.
 */
[NetFieldExportGroup("/HarmlessThriftWeaponGameplay/Gameplay/HarmlessThrift_Slingshot/B_Prj_Delilah_Slingshot_HarmlessThrift_Athena.B_Prj_Delilah_Slingshot_HarmlessThrift_Athena_C", ParseMode.Full)]
public class SchleuderProjektil : INetFieldExportGroup {
  [NetFieldExport("Owner", RepLayoutCmdType.PropertyObject)] public uint? Owner { get; set; }
  [NetFieldExport("Instigator", RepLayoutCmdType.PropertyObject)] public uint? Instigator { get; set; }
  [NetFieldExport("ChargePercent", RepLayoutCmdType.PropertyFloat)] public float? ChargePercent { get; set; }
  [NetFieldExport("PawnHitResults", RepLayoutCmdType.DynamicArray)] public Unreal.Core.Models.FHitResult[] PawnHitResults { get; set; }
  [NetFieldExport("SimulationStoppingHit", RepLayoutCmdType.Property)] public Unreal.Core.Models.FHitResult SimulationStoppingHit { get; set; }
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

/*
 * Abbau-Meldungen (10.11.2026): die Bibliothek fuehrt FortBroadcastRemoteClientInfo_ClassNetCache mit ParseMode.Ignore - sie liest die Meldung nie. Hier dieselbe
 * Klasse mit Full, nur mit der Abbau-Meldung (Art und Menge je Schlag auf ein Ressourcen-Objekt).
 */
[NetFieldExportClassNetCache("FortBroadcastRemoteClientInfo_ClassNetCache", ParseMode.Full)]
public class BroadcastCacheMitAbbau {
  [NetFieldExportRPC("ClientRemotePlayerDamagedResourceBuilding", "/Script/FortniteGame.FortBroadcastRemoteClientInfo:ClientRemotePlayerDamagedResourceBuilding", true, true, false)]
  public FortniteReplayReader.Models.NetFieldExports.RPC.PlayerDamagedResourceBuilding PlayerDamagedResourceBuilding { get; set; }
}
