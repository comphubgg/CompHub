import { NextResponse } from 'next/server';
import { gecacht, listeCups, istEingerichtet, EpicLoginNoetig } from '@/lib/epicCups';

// Alle Cups einer Region: laufende, kommende und vergangene.
//   ?region=EU|NAC|NAW|BR|ASIA|ME|OCE

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const region = searchParams.get('region') ?? 'EU';

  try {
    const daten = await gecacht(`events|${region}`, 5 * 60_000, () => listeCups(region));
    return NextResponse.json(daten);
  } catch (e) {
    const login = e instanceof EpicLoginNoetig;
    return NextResponse.json(
      {
        error: (e as Error).message,
        needsLogin: login,
        eingerichtet: await istEingerichtet(),
      },
      { status: login ? 401 : 500 },
    );
  }
}
