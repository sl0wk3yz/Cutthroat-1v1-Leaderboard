const LICHESS_API_ROOT = "https://lichess.org/api/games/user/";

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Use POST for this endpoint." }, 405);
    }

    try {
      const config = await request.json();
      const cleanedConfig = sanitizeConfig(config);

      if (!cleanedConfig.teamId) {
        return jsonResponse({ error: "Team ID is required." }, 400);
      }

      const result = await buildTrackerData(cleanedConfig);
      return jsonResponse(result, 200);
    } catch (error) {
      console.error("leaderboard error", error);
      return jsonResponse(
        { error: error instanceof Error ? error.message : "Unexpected server error." },
        500
      );
    }
  },
};

async function buildTrackerData(config) {
  const teamMembers = await fetchTeamMembers(config.teamId);
  const players = dedupePlayers(teamMembers);
  const monthRange = getCurrentMonthRangeUtc();
  const pairings = [];

  for (let firstIndex = 0; firstIndex < players.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < players.length; secondIndex += 1) {
      pairings.push([players[firstIndex], players[secondIndex]]);
    }
  }

  const gamesById = new Map();
  const matchups = [];

  for (const [playerA, playerB] of pairings) {
    const games = await fetchHeadToHeadGames(playerA, playerB, config, monthRange);
    if (games.length > 0) {
      matchups.push(createMatchupSummary(playerA, playerB, games));
    }
    games.forEach((game) => gamesById.set(game.id, game));
  }

  const games = [...gamesById.values()].sort(
    (left, right) => (right.playedAt ?? 0) - (left.playedAt ?? 0)
  );

  return {
    players,
    games,
    leaderboard: createLeaderboard(players, games),
    matchups: matchups.sort((left, right) => {
      if (right.games !== left.games) return right.games - left.games;
      return (right.latestGameAt ?? 0) - (left.latestGameAt ?? 0);
    }),
    matchupCount: pairings.length,
    activeMatchupCount: matchups.length,
    monthStart: monthRange.start,
    monthEnd: monthRange.end,
  };
}

async function fetchTeamMembers(teamId) {
  const response = await fetch(`https://lichess.org/api/team/${encodeURIComponent(teamId)}/users`, {
    headers: {
      Accept: "application/x-ndjson",
    },
  });

  if (!response.ok) {
    return [];
  }

  const text = await response.text();
  const members = parseNdjson(text)
    .map((entry) => entry?.id || entry?.name || entry?.username || entry?.user?.name)
    .filter(Boolean);

  return members;
}

async function fetchHeadToHeadGames(playerA, playerB, config, monthRange) {
  const url = new URL(encodeURIComponent(playerA), LICHESS_API_ROOT);
  url.searchParams.set("vs", playerB);
  url.searchParams.set("ongoing", "false");
  url.searchParams.set("finished", "true");
  url.searchParams.set("moves", "false");
  url.searchParams.set("pgnInJson", "true");
  url.searchParams.set("sort", "dateDesc");
  url.searchParams.set("since", String(monthRange.start));
  url.searchParams.set("until", String(monthRange.end - 1));

  if (config.perfType) {
    url.searchParams.set("perfType", config.perfType);
  }

  if (config.ratedOnly) {
    url.searchParams.set("rated", "true");
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/x-ndjson",
    },
  });

  if (!response.ok) {
    return [];
  }

  const text = await response.text();
  return parseNdjson(text).map(normalizeGame).filter(Boolean);
}

function sanitizeConfig(config) {
  return {
    teamId: String(config?.teamId ?? "").trim(),
    perfType: normalizePerfType(config?.perfType),
    ratedOnly: Boolean(config?.ratedOnly),
  };
}

function normalizePerfType(value) {
  const allowed = new Set(["", "bullet", "blitz", "rapid", "classical", "correspondence"]);
  const safeValue = String(value ?? "");
  return allowed.has(safeValue) ? safeValue : "";
}

function parseNdjson(payload) {
  return payload
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function normalizeGame(rawGame) {
  if (!rawGame?.players?.white?.user?.name || !rawGame?.players?.black?.user?.name) {
    return null;
  }

  const whiteName = rawGame.players.white.user.name;
  const blackName = rawGame.players.black.user.name;
  const winner = rawGame.winner
    ? normalizeName(rawGame.winner === "white" ? whiteName : blackName)
    : null;

  return {
    id: rawGame.id,
    playedAt: rawGame.createdAt ?? rawGame.lastMoveAt ?? 0,
    url: `https://lichess.org/${rawGame.id}`,
    perf: rawGame.speed ?? rawGame.perf ?? "unknown",
    rated: Boolean(rawGame.rated),
    white: whiteName,
    black: blackName,
    whiteKey: normalizeName(whiteName),
    blackKey: normalizeName(blackName),
    winner,
  };
}

function createLeaderboard(players, games) {
  const board = new Map(
    players.map((player) => [
      normalizeName(player),
      {
        name: player,
        wins: 0,
        draws: 0,
        losses: 0,
        games: 0,
        score: 0,
      },
    ])
  );

  games.forEach((game) => {
    const white = board.get(game.whiteKey);
    const black = board.get(game.blackKey);
    if (!white || !black) {
      return;
    }

    white.games += 1;
    black.games += 1;

    if (!game.winner) {
      white.draws += 1;
      black.draws += 1;
      white.score += 0.5;
      black.score += 0.5;
      return;
    }

    if (game.winner === game.whiteKey) {
      white.wins += 1;
      black.losses += 1;
      white.score += 1;
      return;
    }

    black.wins += 1;
    white.losses += 1;
    black.score += 1;
  });

  return [...board.values()]
    .map((entry) => ({
      ...entry,
      winRate: entry.games === 0 ? 0 : (entry.wins / entry.games) * 100,
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.winRate !== left.winRate) return right.winRate - left.winRate;
      if (right.wins !== left.wins) return right.wins - left.wins;
      return left.name.localeCompare(right.name);
    });
}

function createMatchupSummary(playerA, playerB, games) {
  const playerAKey = normalizeName(playerA);
  const playerBKey = normalizeName(playerB);
  const summary = {
    playerA,
    playerB,
    winsA: 0,
    winsB: 0,
    draws: 0,
    games: games.length,
    scoreA: 0,
    scoreB: 0,
    latestGameAt: 0,
  };

  games.forEach((game) => {
    summary.latestGameAt = Math.max(summary.latestGameAt, game.playedAt ?? 0);

    if (!game.winner) {
      summary.draws += 1;
      summary.scoreA += 0.5;
      summary.scoreB += 0.5;
      return;
    }

    if (game.winner === playerAKey) {
      summary.winsA += 1;
      summary.scoreA += 1;
      return;
    }

    if (game.winner === playerBKey) {
      summary.winsB += 1;
      summary.scoreB += 1;
    }
  });

  return summary;
}

function dedupePlayers(players) {
  const seen = new Set();
  const ordered = [];

  players.forEach((player) => {
    const clean = String(player).trim();
    const key = normalizeName(clean);
    if (!clean || seen.has(key)) {
      return;
    }
    seen.add(key);
    ordered.push(clean);
  });

  return ordered;
}

function normalizeName(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getCurrentMonthRangeUtc() {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0);
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

function jsonResponse(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
