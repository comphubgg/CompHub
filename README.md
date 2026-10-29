# CompHub

Stats, tournaments and streams for competitive Fortnite — in one place.
Live at [thecomphub.com](https://www.thecomphub.com).

Every number comes from a real source: Epic's tournament API and our own
reading of Epic's server replays. Nothing is estimated or made up; what a
source does not provide stays empty.

## What's inside

| Area | What it does |
|---|---|
| **Events** | Every cup in every region: live leaderboards, every match, player and team stats |
| **Replays** | Every match read from Epic's server replays — eliminations, knocks, zones, damage where the full replay is read |
| **Statistics** | Player profiles, FNCS history, earnings, head-to-head |
| **Rankings** | Epic's worldwide power rankings, refreshed daily |
| **Streams** | Stream walls, folders, multiview |
| **Maps** | Landing spots for finals in almost every region |
| **Tier list** | Rank players, duos and trios, saved to your account |
| **VIP** | OBS overlays, Globals pages, pro POVs, match ID finder, Twitch statistics and a Twitch chat bot |

## Where the numbers come from

- **Epic Games** — tournament calendar, leaderboards, placements, teammates (official API).
- **Server replays** — eliminations, knocks, weapons and zones per match, read by us.
  Damage, hits and headshots come from the full replay. Epic keeps replays for 31 days.
- **eucompetitive.com** — per-match-day values for older events.

Not affiliated with Epic Games.

## Running it yourself

```bash
npm install
npm run schnell
```

`npm run schnell` builds the production version and starts it on
`localhost:3000`. Credentials go into `.env.local` (not versioned): Epic
(tournament data), Twitch and Discord (sign-in, live status) and Google
(sign-in).

`npm run exe` builds a Windows app that runs the server inside and opens
CompHub in its own window.

## What runs on its own

GitHub Actions keep the data fresh: new match days, placements, power
rankings and replays (a finished cup is read within about half an hour).

## Languages

English is the main language; German is behind the switch at the bottom right.
