-- Der Speicher fuer CompHub in Supabase.
--
-- Einmal im SQL-Editor von Supabase ausfuehren. Alles darin ist so
-- geschrieben, dass ein zweiter Durchlauf nichts kaputt macht.
--
-- Warum eine einzige Tabelle und kein Datenmodell mit dreissig Tabellen:
-- CompHub liest und schreibt heute ganze JSON-Staende - konten.json,
-- tierlists.json, turnier-karten.json. Diese Staende in Spalten zu zerlegen
-- waere ein zweiter Umbau obendrauf, mit eigenen Fehlern, und er wuerde
-- nichts bringen, was das Werkzeug heute braucht. Die Tabelle bildet ab, was
-- es gibt: ein Name, ein Stand, ein Zeitpunkt. Wer spaeter einzelne Felder
-- abfragen will, kann den Stand in der Abfrage nach jsonb wandeln
-- ("wert::jsonb") - dafuer muss er nicht so gespeichert sein.

create table if not exists public.ablage (
  -- Derselbe Name wie bisher der Pfad im Datenordner: "konten.json",
  -- "power-rankings/eu.json". Damit bleibt jede Fundstelle im Code lesbar
  -- und der Umzug nachvollziehbar.
  name       text primary key,
  -- Text, nicht jsonb.
  --
  -- jsonb waere naheliegend, sortiert aber die Schluessel eines Objekts um
  -- und wirft Leerzeichen weg. Der Inhalt bleibt derselbe, die Datei kommt
  -- aber anders heraus, als sie hineingegangen ist. Bei Daten, von denen der
  -- Betreiber gesagt hat "dass Du nix verlierst", ist Byte fuer Byte das
  -- richtige Mass - und nichts im Werkzeug fragt in SQL nach einzelnen
  -- Feldern, der Vorteil von jsonb waere hier also ungenutzt geblieben.
  wert       text not null,
  geaendert  timestamptz not null default now()
);

-- Fuer eine Tabelle, die es schon mit jsonb gibt: einmal umstellen.
-- Die vorhandenen Zeilen werden danach vom Umzugsskript ohnehin neu
-- geschrieben, diesmal im Urzustand.
alter table public.ablage
  alter column wert type text using wert::text;

-- Auflisten geschieht ueber den Anfang des Namens ("replays/s39/%"). Ohne
-- diesen Index geht Postgres dafuer durch die ganze Tabelle; mit ihm springt
-- es direkt an die Stelle. Bei ein paar hundert Zeilen faellt das nicht auf,
-- bei ein paar hunderttausend schon.
create index if not exists ablage_name_muster
  on public.ablage (name text_pattern_ops);

-- Zeilenschutz an, und zwar ohne eine einzige Regel.
--
-- Das ist Absicht: mit eingeschaltetem Schutz und ohne Regel kommt niemand
-- an die Tabelle heran - ausser dem geheimen Schluessel, der den Schutz
-- umgeht. Genau so soll es sein. Nur der Server von CompHub liest und
-- schreibt hier; ein Besucher der Webseite bekommt seine Daten vom Server,
-- nie direkt aus der Datenbank.
alter table public.ablage enable row level security;

-- Der Zeitpunkt soll sich von selbst mitschreiben, damit man einer Zeile
-- ansieht, wann sie zuletzt angefasst wurde - ohne dass jede schreibende
-- Stelle im Werkzeug daran denken muss.
create or replace function public.ablage_zeitstempel()
returns trigger
language plpgsql
as $$
begin
  new.geaendert := now();
  return new;
end;
$$;

drop trigger if exists ablage_geaendert on public.ablage;
create trigger ablage_geaendert
  before update on public.ablage
  for each row execute function public.ablage_zeitstempel();
