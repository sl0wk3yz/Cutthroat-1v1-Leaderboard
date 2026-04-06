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


