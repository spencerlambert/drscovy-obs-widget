# Dr Scovy OBS widget

Browser-source overlay for OBS. Shows the latest Raid Vault unlock (and whether a token can still be claimed) plus the top token earners from the last four hours.

Uses the public GraphQL API at `https://api.drscovy.com/graphql`, the same endpoint as drscovy-react.

## Run

```bash
npm start
```

Open [http://127.0.0.1:8766/](http://127.0.0.1:8766/) in OBS as a **Browser** source. Use a transparent background (this page is already transparent). A size around 720×220 works well.

## Data

- Last five raids: `raids(orderBy: CREATED_AT_DESC, first: 5)`
- Claim window: `raidClosesIn` (5 minutes after unlock, same as the raids page)
- Leaderboard: `tokenRank(startAt, endAt, outOf)` over a rolling 4-hour window
