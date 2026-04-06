# Cutthroat

A small web app that uses the public Lichess API to:

- track your head-to-head record against your team members
- build a leaderboard for the whole team
- limit all scoring to the current calendar month

## How it works

The app fetches team members from your Lichess team and then fetches public games from the Lichess user export endpoint using:

- `vs` to narrow games to one opponent
- `since` and `until` to restrict results to the current month
- `perfType` and `rated` when those filters are selected

It then calculates:

- total wins, draws, losses
- score using `1` for a win and `0.5` for a draw
- leaderboard rank across all team members
- per-member H2H cards for the primary user

## Notes

- Lichess API docs: [https://lichess.org/api](https://lichess.org/api)
- Team members operation in the Lichess Teams API: [https://lichess.org/api#operation/teamIdUsers](https://lichess.org/api#operation/teamIdUsers)
- Main game endpoint used: `https://lichess.org/api/games/user/{username}?vs={opponent}`
- Public endpoints can be rate limited, so avoid refreshing aggressively with large teams.
- Vercel Functions docs: [https://vercel.com/docs/functions](https://vercel.com/docs/functions)
- Vercel Node.js runtime docs note that non-framework `.js` functions need a module setup such as `"type": "module"` in `package.json`: [https://vercel.com/docs/functions/runtimes/node-js](https://vercel.com/docs/functions/runtimes/node-js)
- Lichess forum references for date filtering via the game export endpoint: [https://lichess.org/forum/lichess-feedback/game-export-based-on-date-range](https://lichess.org/forum/lichess-feedback/game-export-based-on-date-range)
