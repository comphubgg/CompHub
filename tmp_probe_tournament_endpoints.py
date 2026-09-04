import urllib.request
import urllib.error
from urllib.parse import quote_plus

endpoints = [
    'https://tournaments.nobleprac.com/tournaments',
    'https://tournaments.nobleprac.com/tournaments?guildId=',
    'https://tournaments.nobleprac.com/tournaments?guildId=1098721307077652630',
    'https://tournaments.nobleprac.com/tournament?id=S41-FNCS',
    'https://tournaments.nobleprac.com/tournament?id=123',
    'https://tournaments.nobleprac.com/tournament?id=',
    'https://tournaments.nobleprac.com/tournaments/S41-FNCS',
]

for url in endpoints:
    print('===', url)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = resp.read(2000)
            print('status', resp.status)
            print('content-type', resp.headers.get('Content-Type'))
            print(data.decode('utf-8', errors='replace')[:2000])
    except urllib.error.HTTPError as e:
        print('HTTPError', e.code, e.reason)
        try:
            print(e.read(500).decode('utf-8', errors='replace'))
        except Exception as ex:
            print('error reading body', ex)
    except Exception as e:
        print('ERROR', type(e).__name__, e)
    print()
