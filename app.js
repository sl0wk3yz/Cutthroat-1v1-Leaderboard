const STORAGE_KEY = "cutthroat-tracker-settings-v1";
const elements = {
  form: document.querySelector("#trackerForm"),
  primaryUser: document.querySelector("#primaryUser"),
  friendList: document.querySelector("#friendList"),
  maxGames: document.querySelector("#maxGames"),
  perfType: document.querySelector("#perfType"),
  ratedOnly: document.querySelector("#ratedOnly"),
  refreshButton: document.querySelector("#refreshButton"),
  demoButton: document.querySelector("#demoButton"),
  statusBanner: document.querySelector("#statusBanner"),
  totalPlayers: document.querySelector("#totalPlayers"),
  trackedMatchups: document.querySelector("#trackedMatchups"),
  gamesCounted: document.querySelector("#gamesCounted"),
  heroSummary: document.querySelector("#heroSummary"),
  leaderboardBody: document.querySelector("#leaderboardBody"),
  h2hCards: document.querySelector("#h2hCards"),
  recentGamesBody: document.querySelector("#recentGamesBody"),
};

const demoState = {
  primaryUser: "magnuscarlsen",
  friends: ["hikaru", "firouzja2003", "drnykterstein"],
  maxGames: 20,
  perfType: "blitz",
  ratedOnly: true,
};

hydrateForm();
bindEvents();
renderEmptyState();

function bindEvents() {
  elements.form.addEventListener("submit", handleRefresh);
  elements.demoButton.addEventListener("click", () => {
    populateForm(demoState);
    persistForm();
    setStatus("Demo setup loaded. Refresh when you’re ready.");
  });

  ["input", "change"].forEach((eventName) => {
    elements.form.addEventListener(eventName, persistForm);
  });
}

async function handleRefresh(event) {
  event.preventDefault();

  const config = readForm();
  if (!config.primaryUser) {
    setStatus("Add your Lichess username first.");
    return;
  }

  if (config.friends.length === 0) {
    setStatus("Add at least one friend to build the rivalry board.");
    return;
  }

  toggleLoading(true);
  setStatus("Fetching public games from Lichess and calculating standings...");

  try {
    const result = await buildTrackerData(config);
    renderTracker(result, config.primaryUser);
    const perfLabel = config.perfType || "all perf types";
    setStatus(
      `Loaded ${result.games.length} games across ${result.matchupCount} matchups using ${perfLabel}.`
    );
  } catch (error) {
    console.error(error);
    const message =
      error instanceof Error ? error.message : "Something went wrong while loading games.";
    setStatus(message);
  } finally {
    toggleLoading(false);
  }
}

async function buildTrackerData(config) {
  const response = await fetch("/api/leaderboard", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(config),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || "Unable to load leaderboard data.");
  }

  return payload;
}

function renderTracker(result, primaryUser) {
  elements.totalPlayers.textContent = String(result.players.length);
  elements.trackedMatchups.textContent = String(result.matchupCount);
  elements.gamesCounted.textContent = String(result.games.length);
  elements.heroSummary.textContent = `${primaryUser} is being compared across ${result.players.length - 1} rivalries.`;

  renderLeaderboard(result.leaderboard);
  renderH2H(result.h2h, primaryUser);
  renderRecentGames(result.games);
}

function renderLeaderboard(leaderboard) {
  if (leaderboard.length === 0) {
    elements.leaderboardBody.innerHTML =
      '<tr class="empty-row"><td colspan="8">No games matched these settings.</td></tr>';
    return;
  }

  elements.leaderboardBody.innerHTML = leaderboard
    .map(
      (entry, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(entry.name)}</td>
          <td>${formatScore(entry.score)}</td>
          <td>${entry.wins}</td>
          <td>${entry.draws}</td>
          <td>${entry.losses}</td>
          <td>${entry.games}</td>
          <td>${entry.winRate.toFixed(1)}%</td>
        </tr>
      `
    )
    .join("");
}

function renderH2H(h2hEntries, primaryUser) {
  if (h2hEntries.length === 0) {
    elements.h2hCards.innerHTML =
      '<article class="empty-state-card">No head-to-head data to show yet.</article>';
    return;
  }

  elements.h2hCards.innerHTML = h2hEntries
    .map(
      (entry) => `
        <article class="h2h-card">
          <h3>${escapeHtml(primaryUser)} vs ${escapeHtml(entry.opponent)}</h3>
          <p>${entry.games} games tracked</p>
          <div class="score-line">${formatScore(entry.score)} - ${formatScore(
            entry.games - entry.score
          )}</div>
          <div class="stat-strip">
            <span class="stat-pill">${entry.wins} wins</span>
            <span class="stat-pill">${entry.draws} draws</span>
            <span class="stat-pill">${entry.losses} losses</span>
          </div>
        </article>
      `
    )
    .join("");
}

function renderRecentGames(games) {
  if (games.length === 0) {
    elements.recentGamesBody.innerHTML =
      '<tr class="empty-row"><td colspan="6">No games fetched yet.</td></tr>';
    return;
  }

  elements.recentGamesBody.innerHTML = games
    .slice(0, 20)
    .map((game) => {
      const dateLabel = game.playedAt
        ? new Intl.DateTimeFormat(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          }).format(game.playedAt)
        : "Unknown";

      const resultLabel = game.winner
        ? `${game.winner === game.whiteKey ? game.white : game.black} won`
        : "Draw";

      return `
        <tr>
          <td>${dateLabel}</td>
          <td>${escapeHtml(game.white)}</td>
          <td>${escapeHtml(game.black)}</td>
          <td>${escapeHtml(resultLabel)}</td>
          <td>${escapeHtml(game.perf)}</td>
          <td><a class="game-link" href="${game.url}" target="_blank" rel="noreferrer">Open</a></td>
        </tr>
      `;
    })
    .join("");
}

function renderEmptyState() {
  elements.totalPlayers.textContent = "0";
  elements.trackedMatchups.textContent = "0";
  elements.gamesCounted.textContent = "0";
  elements.heroSummary.textContent = "Add players and refresh the board.";
}

function readForm() {
  const primaryUser = elements.primaryUser.value.trim();
  const primaryKey = normalizeName(primaryUser);
  const friends = dedupePlayers(splitLines(elements.friendList.value)).filter(
    (friend) => normalizeName(friend) !== primaryKey
  );

  return {
    primaryUser,
    friends,
    maxGames: clampNumber(Number(elements.maxGames.value), 1, 300, 100),
    perfType: elements.perfType.value,
    ratedOnly: elements.ratedOnly.checked,
  };
}

function persistForm() {
  const formState = readForm();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(formState));
}

function hydrateForm() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    populateForm({
      primaryUser: "",
      friends: [],
      maxGames: 100,
      perfType: "",
      ratedOnly: true,
    });
    return;
  }

  try {
    populateForm(JSON.parse(saved));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function populateForm(state) {
  elements.primaryUser.value = state.primaryUser ?? "";
  elements.friendList.value = (state.friends ?? []).join("\n");
  elements.maxGames.value = String(state.maxGames ?? 100);
  elements.perfType.value = state.perfType ?? "";
  elements.ratedOnly.checked = state.ratedOnly ?? true;
}

function dedupePlayers(players) {
  const seen = new Set();
  const ordered = [];

  players.forEach((player) => {
    const clean = player.trim();
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
  return value.trim().toLowerCase();
}

function splitLines(value) {
  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function clampNumber(value, minimum, maximum, fallback) {
  if (Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, value));
}

function formatScore(score) {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function setStatus(message) {
  elements.statusBanner.textContent = message;
}

function toggleLoading(isLoading) {
  elements.refreshButton.disabled = isLoading;
  elements.demoButton.disabled = isLoading;
  elements.refreshButton.textContent = isLoading ? "Refreshing..." : "Refresh leaderboard";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
