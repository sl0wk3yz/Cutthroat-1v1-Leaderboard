const STORAGE_KEY = "cutthroat-tracker-settings-v2";

const elements = {
  form: document.querySelector("#trackerForm"),
  teamId: document.querySelector("#teamId"),
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
  teamId: "cutthroat-chess-club",
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
  if (!config.teamId) {
    setStatus("Add a Lichess team slug first.");
    return;
  }

  toggleLoading(true);
  setStatus("Fetching team members and calculating current-month standings...");

  try {
    const result = await buildTrackerData(config);
    renderTracker(result);
    const perfLabel = config.perfType || "all perf types";
    setStatus(
      `Loaded ${result.games.length} games from ${formatMonthLabel(result.monthStart)} across ${result.activeMatchupCount} active matchups using ${perfLabel}.`
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

  const rawBody = await response.text();
  const payload = safeJsonParse(rawBody);

  if (!response.ok) {
    throw new Error(
      payload?.error ||
        `Leaderboard request failed with ${response.status}${rawBody ? `: ${rawBody.slice(0, 180)}` : ""}`
    );
  }

  if (!payload) {
    throw new Error("Leaderboard returned an unexpected response format.");
  }

  return payload;
}

function renderTracker(result) {
  elements.totalPlayers.textContent = String(result.players.length);
  elements.trackedMatchups.textContent = String(result.activeMatchupCount);
  elements.gamesCounted.textContent = String(result.games.length);
  elements.heroSummary.textContent = `${result.players.length} players loaded for ${formatMonthLabel(
    result.monthStart
  )}, with ${result.activeMatchupCount} rivalries found so far.`;

  renderLeaderboard(result.leaderboard);
  renderH2H(result.matchups);
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

function renderH2H(matchups) {
  if (matchups.length === 0) {
    elements.h2hCards.innerHTML =
      '<article class="empty-state-card">No team matchups were found for the current month yet.</article>';
    return;
  }

  elements.h2hCards.innerHTML = matchups
    .slice(0, 24)
    .map(
      (entry) => `
        <article class="h2h-card">
          <div class="versus-line">
            <h3>${escapeHtml(entry.playerA)}</h3>
            <p>vs</p>
            <h3>${escapeHtml(entry.playerB)}</h3>
          </div>
          <p>${entry.games} games tracked this month</p>
          <div class="score-line">${formatScore(entry.scoreA)} - ${formatScore(entry.scoreB)}</div>
          <div class="stat-strip">
            <span class="stat-pill">${entry.winsA} wins for ${escapeHtml(entry.playerA)}</span>
            <span class="stat-pill">${entry.draws} draws</span>
            <span class="stat-pill">${entry.winsB} wins for ${escapeHtml(entry.playerB)}</span>
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
  elements.heroSummary.textContent = "Load the team to build this month’s board.";
}

function readForm() {
  return {
    teamId: elements.teamId.value.trim(),
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
      teamId: "cutthroat-chess-club",
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
  elements.teamId.value = state.teamId ?? "cutthroat-chess-club";
  elements.perfType.value = state.perfType ?? "";
  elements.ratedOnly.checked = state.ratedOnly ?? true;
}

function formatScore(score) {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function formatMonthLabel(monthStart) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(monthStart));
}

function setStatus(message) {
  elements.statusBanner.textContent = message;
}

function toggleLoading(isLoading) {
  elements.refreshButton.disabled = isLoading;
  elements.demoButton.disabled = isLoading;
  elements.refreshButton.textContent = isLoading ? "Refreshing..." : "Refresh leaderboard";
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
