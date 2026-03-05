/**
 * Leaderboard rendering — used by both host and player views
 */

/**
 * Sort players by score descending, return ranked array
 * @param {Array<{name: string, score: number}>} players
 * @returns {Array<{rank: number, name: string, score: number}>}
 */
export function rankPlayers(players) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return sorted.map((p, i) => ({ rank: i + 1, name: p.name, score: p.score, id: p.id }));
}

/**
 * Render leaderboard into a container
 * @param {HTMLElement} container
 * @param {Array} players - array of {name, score, id}
 * @param {string} [highlightId] - player ID to highlight
 * @param {number} [maxShow] - max players to display (default 10)
 */
export function renderLeaderboard(container, players, highlightId = null, maxShow = 10) {
  const ranked = rankPlayers(players);
  const shown = ranked.slice(0, maxShow);

  const podiumColors = ['🥇', '🥈', '🥉'];

  container.innerHTML = `
    <div class="leaderboard">
      <h2 class="leaderboard-title">Leaderboard</h2>
      <div class="leaderboard-list">
        ${shown.map((p, i) => `
          <div class="leaderboard-row ${p.id === highlightId ? 'highlight' : ''} ${i < 3 ? 'top-three' : ''}"
               style="animation-delay: ${i * 0.08}s">
            <span class="lb-rank">${i < 3 ? podiumColors[i] : p.rank}</span>
            <span class="lb-name">${escapeHtml(p.name)}</span>
            <span class="lb-score">${p.score.toLocaleString()}</span>
          </div>
        `).join('')}
      </div>
      ${ranked.length > maxShow ? `<p class="lb-more">+ ${ranked.length - maxShow} more players</p>` : ''}
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

