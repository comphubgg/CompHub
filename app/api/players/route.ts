import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getSupabaseServerClient, hasSupabaseConfig, isSupabaseFallbackError } from '@/lib/supabaseServer';
import { t } from '@/app/lib/i18n';
import { DATEN_ORT } from '@/lib/datenOrt';

const PLAYERS_FILE = path.join(DATEN_ORT, 'players.json');
const IS_VERCEL = Boolean(process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL_ENV);
/*
 * Ob die Datei auf der Platte benutzt werden darf.
 *
 * Frueher hing das zusaetzlich an NODE_ENV - und damit fiel der Zugriff weg,
 * sobald die fertige Fassung lief, auch auf dem eigenen Rechner. Massgeblich
 * ist allein, ob eine beschreibbare Platte da ist; auf Vercel ist sie es
 * nicht.
 */
const USE_DISK_FALLBACK = !IS_VERCEL;

interface PlayerInfo {
  region: string;
  twitter?: string;
  isGlobal?: boolean;
  countryCode?: string;
}

interface PlayersData {
  players: { [key: string]: PlayerInfo };
  regions: {
    NAC_PLAYERS: string[];
    EU_PLAYERS: string[];
  };
  duos: [string, string][];
}

async function readPlayersFile(): Promise<PlayersData> {
  try {
    const raw = await fs.readFile(PLAYERS_FILE, 'utf-8');
    return JSON.parse(raw || '{}');
  } catch {
    return {
      players: {},
      regions: { NAC_PLAYERS: [], EU_PLAYERS: [] },
      duos: [],
    };
  }
}

async function writePlayersFile(data: PlayersData): Promise<void> {
  if (!USE_DISK_FALLBACK) {
    throw new Error('Disk fallback disabled in this environment');
  }

  await fs.mkdir(path.dirname(PLAYERS_FILE), { recursive: true });
  await fs.writeFile(PLAYERS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

interface PlayerPayload {
  name: string | [string, string];
  region: string;
  type: 'solo' | 'duo';
  twitter?: string;
  countryCode?: string;
  countryCode1?: string;
  countryCode2?: string;
}

function normalizeDuoNames(player1: string, player2: string) {
  const names = [player1.trim(), player2.trim()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  return { player1: names[0], player2: names[1] };
}

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      if (!USE_DISK_FALLBACK) {
        return NextResponse.json({ error: t('supabase_not_configured', 'Online database not configured') }, { status: 500 });
      }
      const fileData = await readPlayersFile();
      return NextResponse.json(fileData);
    }

    const [{ data: players, error: playersError }, { data: duos, error: duosError }] = await Promise.all([
      supabase.from('players').select('*'),
      supabase.from('duos').select('*'),
    ]);

    if (playersError) {
      if (isSupabaseFallbackError(playersError) && USE_DISK_FALLBACK) {
        console.warn('Supabase players table unavailable, falling back to local players data');
        const fileData = await readPlayersFile();
        return NextResponse.json(fileData);
      }

      console.error('Supabase error fetching players', playersError);
      return NextResponse.json({ error: playersError.message }, { status: 500 });
    }

    if (duosError) {
      if (isSupabaseFallbackError(duosError) && USE_DISK_FALLBACK) {
        console.warn('Supabase duos table unavailable, falling back to local players data');
        const fileData = await readPlayersFile();
        return NextResponse.json(fileData);
      }

      console.error('Supabase error fetching duos', duosError);
      return NextResponse.json({ error: duosError.message }, { status: 500 });
    }

    const playerMap = (players || []).reduce((acc: Record<string, any>, player: any) => {
      if (!player?.name) return acc;
      acc[player.name] = {
        region: player.region,
        twitter: player.twitter,
        countryCode: player.country_code,
        isGlobal: player.is_global,
      };
      return acc;
    }, {});

    const duoList = (duos || []).map((duo: any) => [duo.player1, duo.player2]);

    return NextResponse.json({ players: playerMap, regions: { NAC_PLAYERS: [], EU_PLAYERS: [] }, duos: duoList });
  } catch (error: any) {
    console.error(t('error_reading_players', 'Error reading players:'), error);
    return NextResponse.json({ error: error.message || t('failed_to_read_players', 'Failed to read players') }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PlayerPayload;
    if (!body || !body.region || !body.type || !body.name) {
      return NextResponse.json({ error: t('name_and_region_required', 'Name and region required') }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    // Nur auf Vercel aufgeben - dort gibt es keine Platte. Auf dem
    // eigenen Rechner liegt die Datei daneben und wird gelesen.
    if (!supabase && IS_VERCEL && !hasSupabaseConfig()) {
      return NextResponse.json({ error: t('supabase_not_configured', 'Online database not configured') }, { status: 500 });
    }

    if (!supabase) {
      const fileData = await readPlayersFile();

      if (body.type === 'duo') {
        const [player1Raw, player2Raw] = Array.isArray(body.name) ? body.name : [String(body.name), ''];
        if (!player1Raw || !player2Raw) {
          return NextResponse.json({ error: t('duo_requires_two_players', 'Duo requires two players') }, { status: 400 });
        }

        const { player1, player2 } = normalizeDuoNames(player1Raw, player2Raw);

        const isExactDuo = (existingA: string, existingB: string) => {
          const normalized = normalizeDuoNames(existingA, existingB);
          return normalized.player1 === player1 && normalized.player2 === player2;
        };

        const sharesPlayer = (existingA: string, existingB: string) => {
          const normalized = normalizeDuoNames(existingA, existingB);
          return (
            normalized.player1 === player1 ||
            normalized.player1 === player2 ||
            normalized.player2 === player1 ||
            normalized.player2 === player2
          );
        };

        const duoExists = fileData.duos.some(([existingA, existingB]) => isExactDuo(existingA, existingB));
        if (duoExists) {
          return NextResponse.json({ error: t('duo_already_exists', 'Duo already exists') }, { status: 400 });
        }

        fileData.duos = fileData.duos.filter(([existingA, existingB]) => !sharesPlayer(existingA, existingB));
        fileData.duos.push([player1, player2]);
        await writePlayersFile(fileData);
        return NextResponse.json({ success: true });
      }

      fileData.players[String(body.name)] = {
        region: body.region,
        twitter: body.twitter || undefined,
        countryCode: body.countryCode || undefined,
        isGlobal: false,
      };
      await writePlayersFile(fileData);
      return NextResponse.json({ success: true });
    }

    if (body.type === 'duo') {
      const [player1Raw, player2Raw] = Array.isArray(body.name) ? body.name : [String(body.name), ''];
      if (!player1Raw || !player2Raw) {
        return NextResponse.json({ error: t('duo_requires_two_players', 'Duo requires two players') }, { status: 400 });
      }

      const { player1, player2 } = normalizeDuoNames(player1Raw, player2Raw);

      const isExactDuo = (existingA: string, existingB: string) => {
        const normalized = normalizeDuoNames(existingA, existingB);
        return normalized.player1 === player1 && normalized.player2 === player2;
      };

      const sharesPlayer = (existingA: string, existingB: string) => {
        const normalized = normalizeDuoNames(existingA, existingB);
        return (
          normalized.player1 === player1 ||
          normalized.player1 === player2 ||
          normalized.player2 === player1 ||
          normalized.player2 === player2
        );
      };

      const { data: existing, error: fetchError } = await supabase
        .from('duos')
        .select('*')
        .or(`player1.eq.${player1},player1.eq.${player2},player2.eq.${player1},player2.eq.${player2}`);

      if (fetchError) {
        console.error('Supabase error fetching existing duos', fetchError);
        return NextResponse.json({ error: fetchError.message }, { status: 500 });
      }

      const exactExists = (existing || []).some((duo: any) => isExactDuo(duo.player1, duo.player2));
      if (exactExists) {
        return NextResponse.json({ error: t('duo_already_exists', 'Duo already exists') }, { status: 400 });
      }

      if (existing && existing.length > 0) {
        const { error: deleteError } = await supabase
          .from('duos')
          .delete()
          .or(`player1.eq.${player1},player1.eq.${player2},player2.eq.${player1},player2.eq.${player2}`);

        if (deleteError) {
          console.error('Supabase error deleting existing duos', deleteError);
          return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }
      }

      const insertPayload = {
        player1,
        player2,
        region: body.region,
        country_code1: body.countryCode1 || null,
        country_code2: body.countryCode2 || null,
        is_global: false,
      };

      const { error } = await supabase.from('duos').insert(insertPayload);
      if (error) {
        if (isSupabaseFallbackError(error) && USE_DISK_FALLBACK) {
          const fileData = await readPlayersFile();
          const duoExists = fileData.duos.some(([existingA, existingB]) => {
            const normalized = normalizeDuoNames(existingA, existingB);
            return normalized.player1 === player1 && normalized.player2 === player2;
          });

          if (!duoExists) {
            fileData.duos.push([player1, player2]);
            await writePlayersFile(fileData);
          }

          return NextResponse.json({ success: true });
        }

        console.error('Supabase error saving duo', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    const insertPayload = {
      name: String(body.name),
      region: body.region,
      twitter: body.twitter || null,
      country_code: body.countryCode || null,
      is_global: false,
    };

    const { error } = await supabase.from('players').upsert(insertPayload, { onConflict: 'name' });
    if (error) {
      if (isSupabaseFallbackError(error) && USE_DISK_FALLBACK) {
        const fileData = await readPlayersFile();
        fileData.players[String(body.name)] = {
          region: body.region,
          twitter: body.twitter || undefined,
          countryCode: body.countryCode || undefined,
          isGlobal: false,
        };
        await writePlayersFile(fileData);
        return NextResponse.json({ success: true });
      }

      console.error('Supabase error saving player', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(t('error_adding_player', 'Error adding player:'), error);
    return NextResponse.json({ error: error.message || t('failed_to_add_player', 'Failed to add player') }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { name, region, type } = await request.json();
    if (!name || !type) {
      return NextResponse.json({ error: t('name_required', 'Name required') }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    // Nur auf Vercel aufgeben - dort gibt es keine Platte. Auf dem
    // eigenen Rechner liegt die Datei daneben und wird gelesen.
    if (!supabase && IS_VERCEL && !hasSupabaseConfig()) {
      return NextResponse.json({ error: t('supabase_not_configured', 'Online database not configured') }, { status: 500 });
    }

    if (!supabase) {
      if (!USE_DISK_FALLBACK) {
        return NextResponse.json({ error: t('supabase_not_configured', 'Online database not configured') }, { status: 500 });
      }

      const fileData = await readPlayersFile();

      if (type === 'duo') {
        const [player1, player2] = Array.isArray(name) ? name : [String(name), ''];
        const { player1: normalized1, player2: normalized2 } = normalizeDuoNames(player1, player2);
        fileData.duos = fileData.duos.filter(([existingA, existingB]) => {
          const normalized = normalizeDuoNames(existingA, existingB);
          return !(normalized.player1 === normalized1 && normalized.player2 === normalized2);
        });
        await writePlayersFile(fileData);
        return NextResponse.json({ success: true });
      }

      delete fileData.players[String(name)];
      await writePlayersFile(fileData);
      return NextResponse.json({ success: true });
    }

    if (type === 'duo') {
      const [player1, player2] = Array.isArray(name) ? name : [String(name), ''];
      const { player1: normalized1, player2: normalized2 } = normalizeDuoNames(player1, player2);
      const { error } = await supabase
        .from('duos')
        .delete()
        .or(`and(player1.eq.${normalized1},player2.eq.${normalized2}),and(player1.eq.${normalized2},player2.eq.${normalized1})`);

      if (error) {
        console.error('Supabase error deleting duo', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    const { error } = await supabase.from('players').delete().match({ name: String(name) });
    if (error) {
      console.error('Supabase error deleting player', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(t('error_deleting_player', 'Error deleting player:'), error);
    return NextResponse.json({ error: error.message || t('failed_to_delete_player', 'Failed to delete player') }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { oldName, newName, region, twitter } = await request.json();

    if (!oldName || !region) {
      return NextResponse.json({ error: t('oldname_and_region_required', 'oldName and region required') }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    // Nur auf Vercel aufgeben - dort gibt es keine Platte. Auf dem
    // eigenen Rechner liegt die Datei daneben und wird gelesen.
    if (!supabase && IS_VERCEL && !hasSupabaseConfig()) {
      return NextResponse.json({ error: t('supabase_not_configured', 'Online database not configured') }, { status: 500 });
    }

    if (!supabase) {
      if (!USE_DISK_FALLBACK) {
        return NextResponse.json({ error: t('supabase_not_configured', 'Online database not configured') }, { status: 500 });
      }

      const fileData = await readPlayersFile();
      const existingPlayer = fileData.players[String(oldName)];
      if (!existingPlayer) {
        return NextResponse.json({ error: t('player_not_found', 'Player not found') }, { status: 404 });
      }

      const updatedPlayer = {
        ...existingPlayer,
        region,
        twitter: twitter || undefined,
      };

      if (newName && newName !== oldName) {
        delete fileData.players[String(oldName)];
        fileData.players[String(newName)] = updatedPlayer;
      } else {
        fileData.players[String(oldName)] = updatedPlayer;
      }

      await writePlayersFile(fileData);
      return NextResponse.json({ success: true });
    }

    const updatePayload: any = { twitter: twitter || null, region };
    if (newName && newName !== oldName) {
      updatePayload.name = newName;
    }

    const { error } = await supabase.from('players').update(updatePayload).eq('name', oldName);
    if (error) {
      console.error('Supabase error updating player', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(t('error_updating_player', 'Error updating player:'), error);
    return NextResponse.json({ error: error.message || t('failed_to_update_player', 'Failed to update player') }, { status: 500 });
  }
}
