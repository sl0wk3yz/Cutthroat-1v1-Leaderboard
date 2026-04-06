# Cutthroat

A small static web app that uses the public Lichess games export API to:

- track your head-to-head record against friends
- build a shared leaderboard for the whole group
- save your player list in the browser

## How it works

The app fetches public games from the Lichess user export endpoint and narrows each request to a single opponent using the `vs` query parameter. It then calculates:

- total wins, draws, losses
- score using `1` for a win and `0.5` for a draw
- leaderboard rank across all listed players
- per-friend H2H cards for the primary user


## Notes

- Lichess API docs: [https://lichess.org/api](https://lichess.org/api)
- Main endpoint used: `https://lichess.org/api/games/user/{username}?vs={opponent}`
- Public endpoints can be rate limited, so avoid refreshing aggressively with large friend lists.
- Vercel Functions docs: [https://vercel.com/docs/functions](https://vercel.com/docs/functions)
- Vercel Node.js runtime docs note that non-framework `.js` functions need a module setup such as `"type": "module"` in `package.json`: [https://vercel.com/docs/functions/runtimes/node-js](https://vercel.com/docs/functions/runtimes/node-js)
- There is an active Lichess forum thread from late March 2026 reporting inconsistent `perfType` filtering for some users. If a perf-specific result looks suspicious, retry with `All rated types` and compare totals.
