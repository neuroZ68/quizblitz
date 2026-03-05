/**
 * Player Application — Join games, answer questions, see scores
 */
import {
  ensureAuth, isDemo, getSession, addPlayer, updatePlayer,
  getAllPlayers, onSessionChange, onPlayersChange
} from '../firebase.js';
import { Timer } from '../shared/timer.js';
import { calculateScore } from '../shared/scoring.js';
import { renderLeaderboard } from '../shared/leaderboard.js';

const app = document.getElementById('app');

// ---- State ----
let currentPin = null;
let playerName = '';
let playerId = null;
let session = null;
let playerData = { score: 0, streak: 0, answers: {} };
let unsubSession = null;
let timer = null;
let hasAnswered = false;
let lastQuestionIndex = -1;
let questionShownAt = 0; // Timestamp when question was displayed

// ---- Init ----
async function init() {
  // Authenticate early so Firestore reads are permitted
  try {
    await ensureAuth();
  } catch (err) {
    console.warn('Auth issue:', err.message);
  }

  if (isDemo) {
    showDemoBanner();
  }

  const params = new URLSearchParams(window.location.search);
  const pinFromUrl = params.get('pin');
  showJoinScreen(pinFromUrl || '');
}

function showDemoBanner() {
  const banner = document.createElement('div');
  banner.className = 'demo-banner';
  banner.innerHTML = `🎮 <strong>Demo Mode</strong> — Open host.html in another tab to create a game.`;
  document.body.prepend(banner);
}

// ---- Toast ----
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ==============================
// JOIN SCREEN
// ==============================
function showJoinScreen(prefillPin) {
  app.innerHTML = `
    <div class="screen screen-centered fade-in">
      <div class="card" style="text-align: center;">
        <a href="/" class="back-link">← Back to Home</a>
        <h1 class="logo" style="font-size: 2.5rem; margin-bottom: 1.5rem;">Quiz<span class="logo-accent">Blitz</span></h1>

        <div class="form-group">
          <label class="form-label">Game PIN</label>
          <input type="text" class="form-input" id="pin-input"
                 value="${prefillPin}"
                 placeholder="Enter 6-digit PIN"
                 maxlength="6"
                 inputmode="numeric"
                 pattern="[0-9]*"
                 style="text-align: center; font-size: 1.5rem; letter-spacing: 6px; font-weight: 800;" />
        </div>

        <div class="form-group">
          <label class="form-label">Nickname</label>
          <input type="text" class="form-input" id="name-input"
                 placeholder="Your nickname"
                 maxlength="20"
                 style="text-align: center; font-size: 1.2rem; font-weight: 600;" />
        </div>

        <button class="btn-primary btn-block mt-2" id="btn-join" style="font-size: 1.2rem; padding: 1rem;">
          Join Game! 🎮
        </button>
      </div>
    </div>
  `;

  const pinInput = document.getElementById('pin-input');
  const nameInput = document.getElementById('name-input');

  if (prefillPin) {
    nameInput.focus();
  } else {
    pinInput.focus();
  }

  pinInput.addEventListener('input', () => {
    pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 6);
  });

  document.getElementById('btn-join').addEventListener('click', () => joinGame());
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinGame(); });
  pinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (pinInput.value.length === 6) nameInput.focus();
    }
  });
}

async function joinGame() {
  const pin = document.getElementById('pin-input').value.trim();
  const name = document.getElementById('name-input').value.trim();

  if (!pin || pin.length !== 6) {
    showToast('Please enter a 6-digit PIN');
    return;
  }
  if (!name) {
    showToast('Please enter a nickname');
    return;
  }

  try {
    // Ensure authenticated before any Firestore operations
    const user = await ensureAuth();
    playerId = user.uid;
    playerName = name;
    currentPin = pin;

    const sessionData = await getSession(pin);
    if (!sessionData) {
      showToast('Game not found! Check your PIN.');
      return;
    }

    if (sessionData.status === 'finished') {
      showToast('This game has already ended.');
      return;
    }

    playerData = { score: 0, streak: 0, answers: {} };

    await addPlayer(pin, playerId, {
      name: playerName,
      score: 0,
      streak: 0,
      answers: {}
    });

    listenToSession(pin);
    showWaitingScreen();
  } catch (err) {
    showToast('Failed to join: ' + err.message);
    console.error(err);
  }
}

// ==============================
// SESSION LISTENER
// ==============================
function listenToSession(pin) {
  if (unsubSession) unsubSession();

  // For demo mode, we poll instead of using real-time listeners
  if (isDemo) {
    const pollId = setInterval(async () => {
      const data = await getSession(pin);
      if (!data) {
        showToast('Game was cancelled');
        clearInterval(pollId);
        showJoinScreen('');
        return;
      }
      handleSessionUpdate(data);
    }, 500);
    unsubSession = () => clearInterval(pollId);

    // Initial check
    getSession(pin).then(data => {
      if (data) handleSessionUpdate(data);
    });
  } else {
    unsubSession = onSessionChange(pin, (data) => {
      if (!data) {
        showToast('Game was cancelled');
        showJoinScreen('');
        return;
      }
      handleSessionUpdate(data);
    });
  }
}

function handleSessionUpdate(data) {
  session = data;

  switch (data.status) {
    case 'lobby':
      // Stay on waiting screen
      break;

    case 'question':
      if (data.currentQuestion !== lastQuestionIndex) {
        lastQuestionIndex = data.currentQuestion;
        hasAnswered = false;
        showQuestion(data);
      }
      break;

    case 'results':
      if (!hasAnswered) {
        // Give the player at least 2 seconds to answer after seeing the question
        const elapsed = Date.now() - questionShownAt;
        if (questionShownAt > 0 && elapsed < 2000) {
          // Don't interrupt yet — let them finish answering
          break;
        }
        showPlayerResult(false, 0, true); // true = time's up
      }
      break;

    case 'finished':
      showFinalScreen();
      break;
  }
}

// ==============================
// WAITING SCREEN
// ==============================
function showWaitingScreen() {
  app.innerHTML = `
    <div class="screen screen-centered fade-in">
      <div class="card" style="text-align: center;">
        <div class="waiting-screen">
          <div class="waiting-icon">⏳</div>
          <p class="waiting-text">You're in!</p>
          <p style="font-size: 1.5rem; font-weight: 800; color: var(--accent); margin: 0.5rem 0;">${escapeHtml(playerName)}</p>
          <p style="color: var(--text-secondary);">Waiting for the host to start...</p>
        </div>
      </div>
    </div>
  `;
}

// ==============================
// QUESTION SCREEN
// ==============================
function showQuestion(sessionData) {
  const question = sessionData.questions[sessionData.currentQuestion];
  if (!question) return;
  questionShownAt = Date.now();

  const total = sessionData.questions.length;
  const index = sessionData.currentQuestion;
  const shapes = ['▲', '◆', '●', '■'];

  let answersHtml;
  if (question.type === 'blank') {
    answersHtml = `
      <div class="blank-input-container" style="margin: 0 auto;">
        <input type="text" class="blank-input" id="blank-answer" placeholder="Type your answer..." autocomplete="off" />
        <button class="blank-submit" id="btn-submit-blank">Submit</button>
      </div>
    `;
  } else {
    const options = question.options || [];
    answersHtml = `
      <div class="answer-grid">
        ${options.map((opt, i) => `
          <button class="answer-btn answer-${i}" data-answer="${escapeHtml(opt)}" data-index="${i}">
            <span class="answer-shape">${shapes[i]}</span>
            ${escapeHtml(opt)}
          </button>
        `).join('')}
      </div>
    `;
  }

  app.innerHTML = `
    <div class="screen screen-centered fade-in">
      <div class="question-display">
        <p class="question-number">Question ${index + 1} of ${total}</p>
        <h2 class="question-text">${escapeHtml(question.text)}</h2>
        ${question.imageUrl ? `<img src="${question.imageUrl}" class="question-image" />` : ''}
        <div id="timer-container" style="max-width: 500px; margin: 0 auto;"></div>
        <div class="mt-2">
          ${answersHtml}
        </div>
      </div>
    </div>
  `;

  const timerContainer = document.getElementById('timer-container');
  timer = new Timer(timerContainer, null, () => {
    disableAnswers();
  });
  timer.startFromTimestamp(sessionData.questionStartedAt, question.timeLimit * 1000);

  if (question.type === 'blank') {
    const blankInput = document.getElementById('blank-answer');
    const submitBtn = document.getElementById('btn-submit-blank');
    blankInput.focus();
    submitBtn.addEventListener('click', () => submitBlankAnswer(question, sessionData));
    blankInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitBlankAnswer(question, sessionData);
    });
  } else {
    document.querySelectorAll('.answer-btn').forEach(btn => {
      btn.addEventListener('click', () => submitAnswer(btn.dataset.answer, question, sessionData));
    });
  }
}

async function submitAnswer(answer, question, sessionData) {
  if (hasAnswered) return;
  hasAnswered = true;

  document.querySelectorAll('.answer-btn').forEach(btn => {
    btn.disabled = true;
    if (btn.dataset.answer === answer) btn.classList.add('selected');
  });

  if (timer) timer.stop();

  const elapsed = Date.now() - sessionData.questionStartedAt;
  const correct = answer === question.correctAnswer;
  const streak = correct ? playerData.streak + 1 : 0;
  const { points } = calculateScore(correct, elapsed, question.timeLimit * 1000, playerData.streak);

  playerData.streak = streak;
  playerData.score += points;
  playerData.answers[String(sessionData.currentQuestion)] = {
    answer,
    answeredAt: Date.now(),
    correct
  };

  document.querySelectorAll('.answer-btn').forEach(btn => {
    if (btn.dataset.answer === question.correctAnswer) {
      btn.classList.add('correct');
    } else if (btn.dataset.answer === answer && !correct) {
      btn.classList.add('wrong');
    }
  });

  try {
    await updatePlayer(currentPin, playerId, {
      score: playerData.score,
      streak: playerData.streak,
      answers: playerData.answers
    });
  } catch (err) {
    console.error('Failed to save answer:', err);
  }

  setTimeout(() => showPlayerResult(correct, points), 800);
}

async function submitBlankAnswer(question, sessionData) {
  if (hasAnswered) return;
  const input = document.getElementById('blank-answer');
  const answer = input.value.trim();
  if (!answer) { showToast('Type an answer first!'); return; }

  hasAnswered = true;
  if (timer) timer.stop();

  const elapsed = Date.now() - sessionData.questionStartedAt;
  const acceptedAnswers = question.acceptedAnswers || [question.correctAnswer];
  const correct = acceptedAnswers.some(a => answer.toLowerCase() === a.toLowerCase());
  const streak = correct ? playerData.streak + 1 : 0;
  const { points } = calculateScore(correct, elapsed, question.timeLimit * 1000, playerData.streak);

  playerData.streak = streak;
  playerData.score += points;
  playerData.answers[String(sessionData.currentQuestion)] = {
    answer,
    answeredAt: Date.now(),
    correct
  };

  try {
    await updatePlayer(currentPin, playerId, {
      score: playerData.score,
      streak: playerData.streak,
      answers: playerData.answers
    });
  } catch (err) {
    console.error('Failed to save answer:', err);
  }

  showPlayerResult(correct, points);
}

function disableAnswers() {
  document.querySelectorAll('.answer-btn').forEach(btn => btn.disabled = true);
  const blankSubmit = document.getElementById('btn-submit-blank');
  if (blankSubmit) blankSubmit.disabled = true;
}

// ==============================
// RESULT FEEDBACK
// ==============================
function showPlayerResult(correct, points, timesUp = false) {
  const icon = correct ? '🎉' : (timesUp ? '⏰' : '😢');
  const msg = correct ? 'Correct!' : (timesUp ? "Time's up!" : 'Wrong!');
  app.innerHTML = `
    <div class="screen screen-centered fade-in">
      <div class="card" style="text-align: center;">
        <div class="result-screen">
          <div class="result-icon">${icon}</div>
          <p class="result-message ${correct ? 'result-correct' : 'result-wrong'}">
            ${msg}
          </p>
          ${correct ? `
            <p class="result-points">+${points.toLocaleString()} points</p>
            ${playerData.streak > 1 ? `<p class="result-breakdown">🔥 ${playerData.streak} streak!</p>` : ''}
          ` : `
            <p style="color: var(--text-muted);">Streak reset</p>
          `}
          <div class="divider"></div>
          <p style="font-weight: 700; font-size: 1.2rem;">Total: ${playerData.score.toLocaleString()}</p>
          <div class="waiting-screen" style="padding: 1rem 0;">
            <div class="waiting-icon" style="font-size: 1.5rem;">⏳</div>
            <p style="color: var(--text-secondary); font-size: 0.9rem;">Waiting for next question...</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ==============================
// FINAL RESULTS SCREEN
// ==============================
async function showFinalScreen() {
  if (unsubSession) unsubSession();
  if (timer) timer.stop();

  let allPlayers = [];
  try {
    allPlayers = await getAllPlayers(currentPin);
  } catch (err) {
    console.error(err);
  }

  const myRank = allPlayers.sort((a, b) => b.score - a.score).findIndex(p => p.id === playerId) + 1;

  app.innerHTML = `
    <div class="screen screen-centered fade-in">
      <div class="card" style="text-align: center;">
        <h1 style="font-size: 2.5rem; margin-bottom: 0.5rem;">🏆</h1>
        <h2 class="page-title">Game Over!</h2>

        <div style="margin: 1.5rem 0;">
          <p style="font-size: 3rem; font-weight: 900; color: var(--accent);">#${myRank}</p>
          <p style="font-weight: 700; font-size: 1.3rem; margin: 0.3rem 0;">${escapeHtml(playerName)}</p>
          <p style="color: var(--text-secondary); font-size: 1.1rem;">${playerData.score.toLocaleString()} points</p>
        </div>

        <div id="final-leaderboard"></div>

        <button class="btn-primary btn-block mt-3" id="btn-play-again">Play Another Game</button>
      </div>
    </div>
  `;

  renderLeaderboard(document.getElementById('final-leaderboard'), allPlayers, playerId, 10);

  document.getElementById('btn-play-again').addEventListener('click', () => {
    playerData = { score: 0, streak: 0, answers: {} };
    lastQuestionIndex = -1;
    showJoinScreen('');
  });
}

// ---- Helpers ----
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Start ----
init();
