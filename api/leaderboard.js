const LICHESS_API_ROOT = "https://lichess.org/api/games/user/";

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Use POST for this endpoint." }, 405);
    }

    try {
      const config = await request.json();
      const cleanedConfig = sanitizeConfig(config);

      if (!cleanedConfig.primaryUser) {
        return jsonResponse({ error: "Primary user is required." }, 400);
      }

      if (cleanedConfig.friends.length === 0) {
        return jsonResponse({ error: "Add at least one friend." }, 400);
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
  const players = dedupePlayers([config.primaryUser, ...config.friends]);
  const pairings = [];

  for (let firstIndex = 0; firstIndex < players.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < players.length; secondIndex += 1) {
      pairings.push([players[firstIndex], players[secondIndex]]);
    }
  }

  const gamesById = new Map();

  for (const [playerA, playerB] of pairings) {
    const games = await fetchHeadToHeadGames(playerA, playerB, config);
    games.forEach((game) => gamesById.set(game.id, game));
  }

  const games = [...gamesById.values()].sort(
    (left, right) => (right.playedAt ?? 0) - (left.playedAt ?? 0)
  );

  return {
    players,
    games,
    leaderboard: createLeaderboard(players, games),
    h2h: createHeadToHeadCards(config.primaryUser, config.friends, games),
    matchupCount: pairings.length,
  };
}

async function fetchHeadToHeadGames(playerA, playerB, config) {
  const url = new URL(encodeURIComponent(playerA), LICHESS_API_ROOT);
  url.searchParams.set("vs", playerB);
  url.searchParams.set("max", String(config.maxGames));
  url.searchParams.set("ongoing", "false");
  url.searchParams.set("finished", "true");
  url.searchParams.set("moves", "false");
  url.searchParams.set("pgnInJson", "true");
  url.searchParams.set("sort", "dateDesc");

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
    throw new Error(`Lichess request failed for ${playerA} vs ${playerB} (${response.status}).`);
  }

  const text = await response.text();
  return parseNdjson(text).map(normalizeGame).filter(Boolean);
}

function sanitizeConfig(config) {
  const primaryUser = String(config?.primaryUser ?? "").trim();
  const primaryKey = normalizeName(primaryUser);
  const friendList = Array.isArray(config?.friends) ? config.friends : [];

  return {
    primaryUser,
    friends: dedupePlayers(
      friendList.map((value) => String(value ?? "").trim()).filter(Boolean)
    ).filter((friend) => normalizeName(friend) !== primaryKey),
    maxGames: clampNumber(Number(config?.maxGames), 1, 300, 100),
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

function createHeadToHeadCards(primaryUser, friends, games) {
  const primaryKey = normalizeName(primaryUser);

  return friends.map((friend) => {
    const friendKey = normalizeName(friend);
    const entry = {
      opponent: friend,
      wins: 0,
      draws: 0,
      losses: 0,
      games: 0,
      score: 0,
    };

    games.forEach((game) => {
      const involvesPrimary =
        (game.whiteKey === primaryKey && game.blackKey === friendKey) ||
        (game.whiteKey === friendKey && game.blackKey === primaryKey);

      if (!involvesPrimary) {
        return;
      }

      entry.games += 1;

      if (!game.winner) {
        entry.draws += 1;
        entry.score += 0.5;
        return;
      }

      if (game.winner === primaryKey) {
        entry.wins += 1;
        entry.score += 1;
      } else {
        entry.losses += 1;
      }
    });

    return entry;
  });
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

function clampNumber(value, minimum, maximum, fallback) {
  if (Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, value));
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
