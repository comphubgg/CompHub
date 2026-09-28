import { GET as orgLogo } from '@/app/api/orgs/logo/route';

/* /bilder/org/<datei>.webp - Logo oder Banner einer Org, von Cloudflare zwischengespeichert (lib/bildAdressen). */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ datei: string }> }) {
  const datei = (await params).datei;
  return orgLogo(new Request(new URL(`/api/orgs/logo?datei=${encodeURIComponent(`org-logos/${datei}`)}`, request.url), { headers: request.headers }));
}
