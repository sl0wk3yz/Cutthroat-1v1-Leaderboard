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

## Run it

This project is set up for Vercel hosting with a small serverless API route.

Options:

1. Open [index.html](./index.html) in a browser and test it directly.
2. If you want the full hosted version, deploy it to Vercel so the built-in `/api/leaderboard` function can fetch Lichess server-side.

## Share it with friends on Vercel

1. Create a new GitHub repository and upload this folder.
2. Sign in to Vercel and click `Add New Project`.
3. Import that GitHub repository.
4. Keep the default project settings. No build command is required for this app.
5. Deploy and share the generated Vercel URL with your friends.

The app now calls your own `/api/leaderboard` endpoint instead of calling Lichess directly from the browser, which makes the shared hosted version more reliable.

## Notes

- Lichess API docs: [https://lichess.org/api](https://lichess.org/api)
- Main endpoint used: `https://lichess.org/api/games/user/{username}?vs={opponent}`
- Public endpoints can be rate limited, so avoid refreshing aggressively with large friend lists.
- Vercel Functions docs: [https://vercel.com/docs/functions](https://vercel.com/docs/functions)
- There is an active Lichess forum thread from late March 2026 reporting inconsistent `perfType` filtering for some users. If a perf-specific result looks suspicious, retry with `All rated types` and compare totals.
