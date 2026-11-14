/*
 * thecomphub.com -> der eigene Server (Contabo, Tunnel). Ersetzt lastverteilung.worker.js (14.11.2026).
 *
 * Warum: Die Seite laeuft nicht mehr auf dem PC und nicht mehr auf Netlify, sondern auf dem eigenen Server. Der alte Worker
 * schickte jeden Besucher, bei dem der Tunnel kurz nicht antwortete, an Netlify - und dort steht seit Monaten nur noch
 * "Site not available ... usage limits" (Betreiber, 14.11.2026). Kurz nicht antworten tut der Server bei jedem Update:
 * der neue Container startet ein paar Sekunden.
 *
 * Jetzt: bis zu ~15 s lang erneut beim Server anfragen (das ueberbrueckt ein Update unbemerkt). Kommt dann immer noch
 * nichts, steht eine eigene Seite da ("We'll be right back") mit 503 und Retry-After - Google nimmt sie nicht als Inhalt.
 * Sie laedt sich selbst neu, sobald der Server wieder antwortet.
 *
 * Einrichten: Cloudflare-Dashboard -> Workers & Pages -> den bestehenden Worker der Route *thecomphub.com/* oeffnen ->
 * Edit code -> alles durch diese Datei ersetzen -> Deploy.
 */

/** Antwortet der Server nicht? Nur Fehlerseiten von Cloudflare selbst (HTML) - ein 502 mit JSON kommt von der Seite. */
function serverAus(antwort) {
  if (antwort.status === 530) return true;
  const typ = antwort.headers.get('Content-Type') || '';
  return /text\/html/i.test(typ) && (antwort.status === 502 || antwort.status === 503 || antwort.status === 504
    || (antwort.status >= 520 && antwort.status <= 527));
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  async fetch(request) {
    const nurLesen = request.method === 'GET' || request.method === 'HEAD';
    const koerper = nurLesen ? undefined : await request.arrayBuffer();
    // Lesende Anfragen duerfen mehrfach gehen; Schreibendes nur einmal (sonst doppelt gespeichert).
    const versuche = nurLesen ? 8 : 1;
    let letzte = null;
    for (let i = 0; i < versuche; i++) {
      try {
        const antwort = await fetch(new Request(request.url, {
          method: request.method, headers: request.headers, body: koerper, redirect: 'manual',
        }));
        if (!serverAus(antwort)) return antwort;
        letzte = antwort;
      } catch { /* gar keine Antwort - gleich noch einmal */ }
      if (i < versuche - 1) await warte(2000);
    }
    const url = new URL(request.url);
    // Daten und Bilder bekommen keine Seite, sondern den Fehler - die Seite selbst versucht es dann erneut.
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/')) {
      return letzte ?? new Response('Server is restarting', { status: 503, headers: { 'Retry-After': '10', 'Cache-Control': 'no-store' } });
    }
    return new Response(SEITE, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '10', 'Cache-Control': 'no-store' },
    });
  },
};

const SEITE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>CompHub - back in a moment</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}html,body{height:100%}
body{background:#08090c;color:#e2e8f0;font-family:'Segoe UI',Roboto,system-ui,-apple-system,sans-serif;display:grid;place-items:center;padding:24px;
background-image:radial-gradient(60rem 32rem at 50% -10%,rgba(14,165,233,.14),transparent 70%)}
main{width:min(520px,100%);text-align:center}
.ring{width:64px;height:64px;margin:0 auto 30px;border-radius:50%;border:3px solid rgba(14,165,233,.18);border-top-color:#38bdf8;animation:dreh 1s linear infinite}
@keyframes dreh{to{transform:rotate(360deg)}}
.marke{font-size:12px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:#38bdf8}
h1{margin-top:14px;font-size:clamp(26px,6vw,36px);font-weight:800;letter-spacing:-.02em}
p{margin:14px auto 0;max-width:40ch;font-size:15px;line-height:1.65;color:#7d8798}
button{margin-top:28px;border:1px solid #0ea5e9;background:rgba(14,165,233,.12);color:#38bdf8;font:inherit;font-size:14px;font-weight:600;padding:9px 20px;border-radius:10px;cursor:pointer}
button:hover{background:#0ea5e9;color:#fff}
small{display:block;margin-top:16px;font-size:12px;color:#5b6474}
</style></head><body><main>
<div class="ring"></div>
<p class="marke">CompHub</p>
<h1>We'll be right back</h1>
<p>CompHub is updating right now - this only takes a few seconds. The page reloads by itself.</p>
<button onclick="location.reload()">Refresh now</button>
<small id="z">Retrying in 5s</small>
</main><script>
var n=5,z=document.getElementById('z');setInterval(function(){n--;if(n<=0)location.reload();else z.textContent='Retrying in '+n+'s';},1000);
</script></body></html>`;
