// Einmalige Epic-Anmeldung fuer die Live-Cup-Daten.
//
//   npm run epic-login
//
// Es oeffnet sich ein Browserfenster. Dort erscheint eine Textzeile mit
// einem "authorizationCode". Die ganze Zeile kopieren und hier einfuegen.
// Weder Epic-Name noch Passwort werden gebraucht - der Code geht direkt an
// Epic zurueck und verfaellt nach wenigen Minuten.
//
// Ergebnis landet in data/epic-auth.json. Fuer ein Deployment (Vercel)
// den Inhalt dieser Datei als Umgebungsvariable EPIC_DEVICE_AUTH setzen.

const fs = require('fs');
const path = require('path');

const CLIENT_ID = '3f69e56c7649492c8cc29f1af08a8a12';
const CLIENT_SECRET = 'b51ee9cb12234f50a69efa67ef53812e';
const BASIC = 'basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64');
const ACCOUNT = 'https://account-public-service-prod.ol.epicgames.com';
const LOGIN_URL = 'https://www.epicgames.com/id/api/redirect?clientId=' +
  CLIENT_ID + '&responseType=code';
/*
 * --bot: das eigene Konto der Seite (7.11.2026, "comphub."), getrennt vom Konto des Betreibers - in data/epic-auth-bot.json. Das Browserfenster wird dann
 * nicht von selbst geoeffnet: im normalen Browser ist der Betreiber mit seinem eigenen Konto angemeldet, der Code waere seiner.
 */
const BOT = process.argv.includes('--bot');
const ZIEL = path.join(process.cwd(), 'data', BOT ? 'epic-auth-bot.json' : 'epic-auth.json');

async function req(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    throw new Error('HTTP ' + res.status + ': ' +
      ((body && (body.errorMessage || body.errorCode)) || String(text).slice(0, 200)));
  }
  return body;
}

// Zieht den Code aus beliebiger Eingabe - egal ob nur der Code oder das
// ganze JSON eingefuegt wurde.
function findeCode(s) {
  const m = String(s || '').match(/[0-9a-f]{32}/i);
  return m ? m[0] : null;
}

(async function () {
  let code = findeCode(process.argv.slice(2).find((a) => a !== '--bot'));

  if (!code) {
    console.log('\n=== Epic einmalig verbinden ===\n');
    console.log('Gleich oeffnet sich ein Browserfenster. Du musst bei Epic');
    console.log('eingeloggt sein. Dort erscheint eine Textzeile wie diese:\n');
    console.log('  {"warning":"...","authorizationCode":"a1b2c3...","sid":null}\n');
    console.log('Ganze Zeile markieren, kopieren, hier einfuegen.');
    console.log('Ich suche mir den Code selbst heraus.\n');

    if (BOT) {
      console.log('Fuer das CompHub-Bot-Konto:');
      console.log('  1. Ein privates Fenster oeffnen (Chrome: Strg + Umschalt + N).');
      console.log('  2. Dort bei epicgames.com mit dem Bot-Konto anmelden.');
      console.log('  3. Im selben Fenster diese Adresse oeffnen:\n');
      console.log('     ' + LOGIN_URL + '\n');
    }
    // URL in Anfuehrungszeichen - sonst schneidet cmd.exe sie am & ab.
    if (!BOT) try {
      const cmd = process.platform === 'win32'
        ? 'start "" "' + LOGIN_URL + '"'
        : (process.platform === 'darwin' ? 'open "' : 'xdg-open "') + LOGIN_URL + '"';
      require('child_process').exec(cmd);
    } catch {
      console.log('Bitte manuell oeffnen:\n  ' + LOGIN_URL + '\n');
    }

    const rl = require('readline/promises')
      .createInterface({ input: process.stdin, output: process.stdout });
    code = findeCode(await rl.question('Hier einfuegen und Enter: '));
    rl.close();

    if (!code) {
      console.error('\nDarin war kein Code. Gesucht ist eine 32-stellige Folge');
      console.error('aus Ziffern und den Buchstaben a-f.\n');
      process.exit(1);
    }
  }

  const tok = await req(ACCOUNT + '/account/api/oauth/token', {
    method: 'POST',
    headers: { Authorization: BASIC, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code }),
  });

  fs.mkdirSync(path.dirname(ZIEL), { recursive: true });

  // Bevorzugt: Geraete-Anmeldung. Haelt unbegrenzt, ueberlebt Neustarts.
  try {
    const dev = await req(ACCOUNT + '/account/api/public/account/' +
      tok.account_id + '/deviceAuth', {
      method: 'POST',
      headers: { Authorization: 'bearer ' + tok.access_token,
                 'Content-Type': 'application/json' },
      body: '{}',
    });
    // Das Bot-Konto darf nicht das des Betreibers sein (dann haette er im normalen Fenster den Code geholt).
    if (BOT) {
      try {
        const haupt = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'epic-auth.json'), 'utf8'));
        if (haupt.accountId === dev.accountId) { console.error('\nDas ist dein eigenes Konto, nicht das Bot-Konto. Bitte im privaten Fenster mit dem Bot-Konto anmelden.\n'); process.exit(1); }
      } catch { /* ohne Hauptkonto kein Vergleich */ }
    }
    fs.writeFileSync(ZIEL, JSON.stringify({
      mode: 'device', accountId: dev.accountId, deviceId: dev.deviceId,
      secret: dev.secret, displayName: tok.displayName,
    }, null, 2));
    console.log('\nVerbunden als: ' + tok.displayName);
    console.log('Gespeichert in: ' + ZIEL);
    console.log('Ab jetzt kein Login mehr noetig.\n');
    return;
  } catch (e) {
    if (!String(e.message).includes('deviceAuths')) throw e;
  }

  // Rueckfall: Refresh-Token, erneuert sich bei jedem Abruf selbst.
  fs.writeFileSync(ZIEL, JSON.stringify({
    mode: 'refresh', accountId: tok.account_id,
    refreshToken: tok.refresh_token, displayName: tok.displayName,
  }, null, 2));
  console.log('\nVerbunden als: ' + tok.displayName);
  console.log('\nHinweis: Dieser Client erlaubt keine dauerhafte Geraete-');
  console.log('Anmeldung. Es laeuft ueber einen Token, der sich selbst');
  console.log('erneuert, solange die Seite regelmaessig laeuft.\n');
})().catch(function (e) {
  console.error('\nFehler: ' + e.message + '\n');
  process.exit(1);
});
