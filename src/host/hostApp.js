/**
 * Host Application — Quiz creation, editing, and game session management
 */
import {
  ensureAuth, isDemo, getAllQuizzes, saveQuiz, deleteQuiz,
  createSession, updateSession, deleteSession, getAllPlayers,
  onPlayersChange, uploadImage
} from '../firebase.js';
import { renderQRCode } from '../shared/qrcode.js';
import { renderLeaderboard, rankPlayers } from '../shared/leaderboard.js';
import { Timer } from '../shared/timer.js';
import JSZip from 'jszip';

const app = document.getElementById('app');

// ---- State ----
let currentView = 'list';
let quizzes = [];
let currentQuiz = null;
let currentSession = null;
let players = [];
let unsubPlayers = null;
let timer = null;

// ---- Init ----
async function init() {
  try {
    await ensureAuth();
  } catch (err) {
    console.warn('Auth issue:', err.message);
  }

  if (isDemo) {
    showDemoBanner();
  }
  showQuizList();
}

function showDemoBanner() {
  const banner = document.createElement('div');
  banner.className = 'demo-banner';
  banner.innerHTML = `🎮 <strong>Demo Mode</strong> — Data stored locally. Add Firebase config for real-time multiplayer.`;
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
// QUIZ LIST VIEW
// ==============================
async function showQuizList() {
  currentView = 'list';
  app.innerHTML = `
    <div class="screen fade-in" style="padding-top: 2rem;">
      <a href="/" class="back-link">← Back to Home</a>
      <h1 class="page-title">Your Quizzes</h1>
      <div class="btn-group mb-3" style="justify-content: center;">
        <button class="btn-primary" id="btn-new-quiz">+ New Quiz</button>
        <button class="btn-secondary" id="btn-upload-json">📤 Import Quiz</button>
      </div>
      <div class="quiz-list" id="quiz-list">
        <div class="spinner"></div>
      </div>
    </div>
  `;

  document.getElementById('btn-new-quiz').addEventListener('click', () => showQuizEditor(null));
  document.getElementById('btn-upload-json').addEventListener('click', showJSONUpload);

  await loadQuizzes();
}

async function loadQuizzes() {
  try {
    quizzes = await getAllQuizzes();

    const listEl = document.getElementById('quiz-list');
    if (!listEl) return;

    if (quizzes.length === 0) {
      listEl.innerHTML = `
        <div class="text-center" style="padding: 2rem;">
          <p style="font-size: 3rem;">📝</p>
          <p style="color: var(--text-secondary); margin-top: 1rem;">No quizzes yet. Create your first one!</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = quizzes.map(q => `
      <div class="quiz-item" data-id="${q.id}">
        <div class="quiz-item-info">
          <h3>${escapeHtml(q.title)}</h3>
          <p>${q.questions?.length || 0} questions</p>
        </div>
        <div class="btn-group">
          <button class="btn-primary btn-sm btn-start-game" data-id="${q.id}">▶ Play</button>
          <button class="btn-secondary btn-sm btn-edit-quiz" data-id="${q.id}">✏️</button>
          <button class="btn-danger btn-sm btn-delete-quiz" data-id="${q.id}">🗑</button>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.btn-start-game').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const quiz = quizzes.find(q => q.id === btn.dataset.id);
        if (quiz) startGameSession(quiz);
      });
    });

    listEl.querySelectorAll('.btn-edit-quiz').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const quiz = quizzes.find(q => q.id === btn.dataset.id);
        if (quiz) showQuizEditor(quiz);
      });
    });

    listEl.querySelectorAll('.btn-delete-quiz').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Delete this quiz?')) {
          await deleteQuiz(btn.dataset.id);
          showToast('Quiz deleted');
          loadQuizzes();
        }
      });
    });
  } catch (err) {
    console.error('Error loading quizzes:', err);
    const listEl = document.getElementById('quiz-list');
    if (listEl) {
      listEl.innerHTML = `<p style="color: var(--color-red);">Error loading quizzes: ${err.message}</p>`;
    }
  }
}

// ==============================
// JSON / ZIP UPLOAD
// ==============================
function showJSONUpload() {
  app.innerHTML = `
    <div class="screen screen-centered fade-in">
      <div class="card card-wide">
        <a href="#" class="back-link" id="btn-back">← Back</a>
        <h2 class="page-title">Import Quiz</h2>
        <div class="form-group">
          <label class="form-label">Quiz Title</label>
          <input type="text" class="form-input" id="json-title" placeholder="My Quiz" />
        </div>
        <div class="json-upload-area" id="json-drop">
          <p style="font-size: 2rem; margin-bottom: 0.5rem;">📦</p>
          <p class="upload-label">Click to select or drag & drop a <span>.json</span> or <span>.zip</span> file</p>
          <input type="file" accept=".json,.zip" class="file-input-hidden" id="json-file" />
        </div>

        <div style="display: flex; gap: 1rem; margin-top: 1rem; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 250px;">
            <p style="color: var(--text-muted); font-size: 0.8rem; font-weight: 700; margin-bottom: 0.3rem;">📄 JSON only (no images)</p>
            <div class="json-format-hint" style="font-size: 0.72rem;">[
  {
    "type": "mc",
    "text": "What is 2+2?",
    "options": ["3", "4", "5", "6"],
    "correctAnswer": "4",
    "timeLimit": 20
  }
]</div>
          </div>
          <div style="flex: 1; min-width: 250px;">
            <p style="color: var(--text-muted); font-size: 0.8rem; font-weight: 700; margin-bottom: 0.3rem;">📦 ZIP (with images)</p>
            <div class="json-format-hint" style="font-size: 0.72rem;">quiz.zip/
├── questions.json
├── sky_photo.jpg
├── diagram.png
└── ...

questions.json:
[{
  "type": "mc",
  "text": "What is this?",
  "image": "sky_photo.jpg",
  "options": ["Sky", "Sea"],
  "correctAnswer": "Sky"
}]</div>
          </div>
        </div>

        <div id="import-progress" style="display: none; margin-top: 1rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div class="spinner" style="width: 20px; height: 20px;"></div>
            <span id="progress-text" style="color: var(--text-secondary); font-size: 0.9rem;">Importing...</span>
          </div>
          <div style="width: 100%; height: 6px; background: var(--bg-tertiary); border-radius: 3px; margin-top: 0.5rem; overflow: hidden;">
            <div id="progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, var(--primary), var(--accent)); border-radius: 3px; transition: width 0.3s ease;"></div>
          </div>
        </div>

        <button class="btn-primary btn-block mt-3" id="btn-import">Import Questions</button>
      </div>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', (e) => { e.preventDefault(); showQuizList(); });
  const dropArea = document.getElementById('json-drop');
  const fileInput = document.getElementById('json-file');

  dropArea.addEventListener('click', () => fileInput.click());
  dropArea.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.style.borderColor = 'var(--primary-light)'; });
  dropArea.addEventListener('dragleave', () => { dropArea.style.borderColor = ''; });
  dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.style.borderColor = '';
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      dropArea.querySelector('.upload-label').textContent = fileInput.files[0].name;
    }
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) {
      dropArea.querySelector('.upload-label').textContent = fileInput.files[0].name;
    }
  });

  document.getElementById('btn-import').addEventListener('click', async () => {
    const title = document.getElementById('json-title').value.trim() || 'Imported Quiz';
    const file = fileInput.files[0];
    if (!file) { showToast('Please select a file'); return; }

    const importBtn = document.getElementById('btn-import');
    importBtn.disabled = true;
    importBtn.textContent = 'Importing...';

    try {
      const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip';

      let questions;
      if (isZip) {
        questions = await importFromZip(file);
      } else {
        questions = await importFromJSON(file);
      }

      await saveQuiz({
        title,
        questions,
        questionCount: questions.length
      });

      const imgCount = questions.filter(q => q.imageUrl).length;
      showToast(`Imported ${questions.length} questions${imgCount ? ` with ${imgCount} images` : ''}!`);
      showQuizList();
    } catch (err) {
      showToast(`Error: ${err.message}`);
      importBtn.disabled = false;
      importBtn.textContent = 'Import Questions';
    }
  });
}

// Parse a plain .json file
async function importFromJSON(file) {
  const text = await file.text();
  const questions = JSON.parse(text);
  if (!Array.isArray(questions)) throw new Error('JSON must be an array of questions');
  return validateQuestions(questions);
}

// Parse a .zip file containing questions.json + image files
async function importFromZip(file) {
  const progressEl = document.getElementById('import-progress');
  const progressText = document.getElementById('progress-text');
  const progressBar = document.getElementById('progress-bar');
  if (progressEl) progressEl.style.display = 'block';

  const setProgress = (text, pct) => {
    if (progressText) progressText.textContent = text;
    if (progressBar) progressBar.style.width = pct + '%';
  };

  setProgress('Reading zip file...', 5);

  const zip = await JSZip.loadAsync(file);

  // Find questions.json (could be at root or in a subfolder)
  let jsonEntry = null;
  zip.forEach((path, entry) => {
    const name = path.split('/').pop().toLowerCase();
    if (name === 'questions.json' && !entry.dir) {
      jsonEntry = entry;
    }
  });
  if (!jsonEntry) throw new Error('ZIP must contain a questions.json file');

  setProgress('Parsing questions...', 15);
  const jsonText = await jsonEntry.async('string');
  const rawQuestions = JSON.parse(jsonText);
  if (!Array.isArray(rawQuestions)) throw new Error('questions.json must be an array');

  // Find which questions reference images
  const imageQuestions = rawQuestions.filter(q => q.image);
  const totalImages = imageQuestions.length;
  let uploadedCount = 0;

  // Build a map of filename → zip entry (case-insensitive)
  const imageEntries = new Map();
  zip.forEach((path, entry) => {
    if (!entry.dir) {
      const ext = path.split('.').pop().toLowerCase();
      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
        const name = path.split('/').pop();
        imageEntries.set(name.toLowerCase(), { entry, name: path });
      }
    }
  });

  // Upload images and build the URL map
  const imageUrlMap = new Map(); // original filename → download URL

  for (const q of imageQuestions) {
    const imgFilename = q.image;
    const imgEntry = imageEntries.get(imgFilename.toLowerCase());

    if (!imgEntry) {
      console.warn(`Image "${imgFilename}" not found in zip, skipping`);
      continue;
    }

    uploadedCount++;
    setProgress(`Uploading image ${uploadedCount}/${totalImages}: ${imgFilename}`, 15 + (uploadedCount / totalImages) * 80);

    try {
      const blob = await imgEntry.entry.async('blob');
      // Detect MIME type from extension
      const ext = imgFilename.split('.').pop().toLowerCase();
      const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' };
      const mimeType = mimeMap[ext] || 'image/png';
      const imageFile = new File([blob], imgFilename, { type: mimeType });

      const url = await uploadImage(imageFile);
      imageUrlMap.set(imgFilename.toLowerCase(), url);
    } catch (err) {
      console.error(`Failed to upload "${imgFilename}":`, err);
    }
  }

  setProgress('Saving quiz...', 98);

  // Validate and attach image URLs
  const validated = rawQuestions.map((q, i) => {
    if (!q.type || !q.text || !q.correctAnswer) {
      throw new Error(`Question ${i + 1} missing required fields (type, text, correctAnswer)`);
    }
    if (q.type === 'mc' && (!q.options || q.options.length < 2)) {
      throw new Error(`Question ${i + 1}: Multiple Choice needs at least 2 options`);
    }

    let imageUrl = null;
    if (q.image) {
      imageUrl = imageUrlMap.get(q.image.toLowerCase()) || null;
    } else if (q.imageUrl) {
      imageUrl = q.imageUrl; // Allow direct URLs too
    }

    const result = {
      type: q.type,
      text: q.text,
      correctAnswer: q.correctAnswer,
      timeLimit: q.timeLimit || 20,
      imageUrl
    };
    if (q.type === 'mc') result.options = q.options;
    else if (q.type === 'tf') result.options = ['True', 'False'];
    if (q.type === 'blank') result.acceptedAnswers = q.acceptedAnswers || [q.correctAnswer];
    return result;
  });

  setProgress('Done!', 100);
  return validated;
}

// Validate an array of question objects
function validateQuestions(questions) {
  return questions.map((q, i) => {
    if (!q.type || !q.text || !q.correctAnswer) {
      throw new Error(`Question ${i + 1} missing required fields (type, text, correctAnswer)`);
    }
    if (q.type === 'mc' && (!q.options || q.options.length < 2)) {
      throw new Error(`Question ${i + 1}: Multiple Choice needs at least 2 options`);
    }
    const result = {
      type: q.type,
      text: q.text,
      correctAnswer: q.correctAnswer,
      timeLimit: q.timeLimit || 20,
      imageUrl: q.imageUrl || null
    };
    if (q.type === 'mc') result.options = q.options;
    else if (q.type === 'tf') result.options = ['True', 'False'];
    if (q.type === 'blank') result.acceptedAnswers = q.acceptedAnswers || [q.correctAnswer];
    return result;
  });
}

// ==============================
// QUIZ EDITOR
// ==============================
function showQuizEditor(quiz) {
  currentView = 'editor';
  currentQuiz = quiz ? { ...quiz, questions: [...(quiz.questions || [])] } : {
    id: null,
    title: '',
    questions: []
  };
  renderEditor();
}

function renderEditor() {
  const q = currentQuiz;
  app.innerHTML = `
    <div class="screen fade-in" style="padding-top: 2rem;">
      <a href="#" class="back-link" id="btn-back">← Back to Quizzes</a>
      <div class="quiz-editor">
        <div class="form-group">
          <label class="form-label">Quiz Title</label>
          <input type="text" class="form-input" id="quiz-title" value="${escapeHtml(q.title)}" placeholder="Enter quiz title..." />
        </div>

        <div class="divider"></div>
        <h3 style="margin-bottom: 1rem;">Questions (${q.questions.length})</h3>

        <div id="questions-container">
          ${q.questions.map((qq, i) => renderQuestionCard(qq, i)).join('')}
        </div>

        <button class="btn-secondary btn-block mt-2" id="btn-add-question">+ Add Question</button>

        <div class="divider"></div>

        <div class="btn-group" style="justify-content: center;">
          <button class="btn-primary" id="btn-save-quiz">💾 Save Quiz</button>
          ${q.id ? `<button class="btn-primary" id="btn-start-from-editor" style="background: linear-gradient(135deg, var(--color-green), #2ecc71);">▶ Start Game</button>` : ''}
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', (e) => { e.preventDefault(); showQuizList(); });
  document.getElementById('btn-add-question').addEventListener('click', () => showQuestionForm(null, -1));
  document.getElementById('btn-save-quiz').addEventListener('click', handleSaveQuiz);

  const startBtn = document.getElementById('btn-start-from-editor');
  if (startBtn) startBtn.addEventListener('click', async () => {
    await handleSaveQuiz();
    if (currentQuiz.id) {
      const quiz = quizzes.find(q => q.id === currentQuiz.id) || currentQuiz;
      startGameSession(quiz);
    }
  });

  document.querySelectorAll('.btn-edit-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      showQuestionForm(currentQuiz.questions[idx], idx);
    });
  });

  document.querySelectorAll('.btn-delete-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      currentQuiz.questions.splice(idx, 1);
      renderEditor();
      showToast('Question removed');
    });
  });
}

function renderQuestionCard(q, idx) {
  const typeBadge = q.type === 'mc' ? 'badge-mc' : q.type === 'tf' ? 'badge-tf' : 'badge-blank';
  const typeLabel = q.type === 'mc' ? 'Multiple Choice' : q.type === 'tf' ? 'True/False' : 'Fill in Blank';

  return `
    <div class="question-card">
      <div class="question-card-header">
        <span class="question-card-num">
          <span class="question-type-badge ${typeBadge}">${typeLabel}</span>
          Q${idx + 1} · ${q.timeLimit}s
        </span>
        <div class="question-card-actions">
          <button class="icon-btn btn-edit-q" data-idx="${idx}" title="Edit">✏️</button>
          <button class="icon-btn delete btn-delete-q" data-idx="${idx}" title="Delete">🗑</button>
        </div>
      </div>
      <p style="font-weight: 600;">${escapeHtml(q.text)}</p>
      ${q.imageUrl ? `<img src="${q.imageUrl}" style="max-height: 80px; margin-top: 0.5rem; border-radius: 6px;" />` : ''}
      ${q.options ? `<p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.3rem;">Options: ${q.options.map(o => escapeHtml(o)).join(', ')}</p>` : ''}
      <p style="color: var(--color-green); font-size: 0.85rem; margin-top: 0.2rem;">Answer: ${escapeHtml(q.correctAnswer)}</p>
    </div>
  `;
}

function showQuestionForm(existingQ, editIdx) {
  const isEdit = editIdx >= 0;
  const q = existingQ || { type: 'mc', text: '', options: ['', '', '', ''], correctAnswer: '', timeLimit: 20, imageUrl: null };

  app.innerHTML = `
    <div class="screen screen-centered fade-in">
      <div class="card card-wide">
        <a href="#" class="back-link" id="btn-back-to-editor">← Back to Editor</a>
        <h2 class="page-title">${isEdit ? 'Edit' : 'Add'} Question</h2>

        <div class="form-group">
          <label class="form-label">Question Type</label>
          <select class="form-input" id="q-type">
            <option value="mc" ${q.type === 'mc' ? 'selected' : ''}>Multiple Choice</option>
            <option value="tf" ${q.type === 'tf' ? 'selected' : ''}>True / False</option>
            <option value="blank" ${q.type === 'blank' ? 'selected' : ''}>Fill in the Blank</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Question Text</label>
          <input type="text" class="form-input" id="q-text" value="${escapeHtml(q.text)}" placeholder="Enter your question..." />
        </div>

        <div class="form-group">
          <label class="form-label">Image (optional)</label>
          <div class="image-upload-area ${q.imageUrl ? 'has-image' : ''}" id="img-upload">
            ${q.imageUrl
      ? `<img src="${q.imageUrl}" />`
      : `<p style="font-size: 1.5rem;">🖼</p><p class="upload-label">Click to upload an image</p>`
    }
            <input type="file" accept="image/*" class="file-input-hidden" id="img-file" />
          </div>
          ${q.imageUrl ? `<button class="btn-secondary btn-sm" id="btn-remove-img">Remove Image</button>` : ''}
        </div>

        <div id="options-section">
          ${renderOptionsSection(q)}
        </div>

        <div class="form-group">
          <label class="form-label">Time Limit</label>
          <div style="display: flex; align-items: center; gap: 1rem;">
            <input type="range" class="time-slider" id="q-time" min="5" max="120" step="5" value="${q.timeLimit}" />
            <span class="time-value" id="q-time-val">${q.timeLimit}s</span>
          </div>
        </div>

        <div class="btn-group mt-3" style="justify-content: center;">
          <button class="btn-primary" id="btn-save-question">${isEdit ? 'Update' : 'Add'} Question</button>
          <button class="btn-secondary" id="btn-cancel-question">Cancel</button>
        </div>
      </div>
    </div>
  `;

  // Wire events
  const typeSelect = document.getElementById('q-type');
  typeSelect.addEventListener('change', () => {
    const newType = typeSelect.value;
    const section = document.getElementById('options-section');
    const tempQ = { ...q, type: newType };
    if (newType === 'tf') {
      tempQ.options = ['True', 'False'];
      tempQ.correctAnswer = q.correctAnswer === 'True' || q.correctAnswer === 'False' ? q.correctAnswer : 'True';
    } else if (newType === 'blank') {
      tempQ.options = undefined;
      tempQ.acceptedAnswers = q.acceptedAnswers || [q.correctAnswer || ''];
    } else {
      tempQ.options = q.options || ['', '', '', ''];
    }
    section.innerHTML = renderOptionsSection(tempQ);
    wireBlankAnswerButtons();
  });

  // Delegate blank answer add/remove events
  function wireBlankAnswerButtons() {
    const addBtn = document.getElementById('btn-add-blank-answer');
    if (addBtn) {
      addBtn.onclick = () => {
        const list = document.getElementById('blank-answers-list');
        const count = list.querySelectorAll('.blank-answer-input').length;
        const row = document.createElement('div');
        row.className = 'option-row';
        row.style.marginBottom = '0.4rem';
        row.innerHTML = `
          <input type="text" class="form-input blank-answer-input" placeholder="Accepted answer ${count + 1}" />
          <button type="button" class="btn-danger btn-sm remove-blank-answer" style="margin-left: 0.5rem; padding: 0.3rem 0.6rem;">✕</button>
        `;
        list.appendChild(row);
        row.querySelector('.blank-answer-input').focus();
      };
    }
    document.getElementById('options-section')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-blank-answer')) {
        e.target.closest('.option-row').remove();
      }
    });
  }
  wireBlankAnswerButtons();

  const slider = document.getElementById('q-time');
  const sliderVal = document.getElementById('q-time-val');
  slider.addEventListener('input', () => { sliderVal.textContent = slider.value + 's'; });

  // Image upload
  const imgUpload = document.getElementById('img-upload');
  const imgFile = document.getElementById('img-file');
  imgUpload.addEventListener('click', () => imgFile.click());

  let pendingImageUrl = q.imageUrl;

  imgFile.addEventListener('change', async () => {
    if (!imgFile.files.length) return;
    const file = imgFile.files[0];
    if (file.size > 5 * 1024 * 1024) { showToast('Image too large (max 5MB)'); return; }

    try {
      imgUpload.innerHTML = '<div class="spinner"></div>';
      pendingImageUrl = await uploadImage(file);
      imgUpload.classList.add('has-image');
      imgUpload.innerHTML = `<img src="${pendingImageUrl}" />`;
      showToast('Image uploaded!');
    } catch (err) {
      showToast('Upload failed: ' + err.message);
      imgUpload.innerHTML = `<p style="font-size: 1.5rem;">🖼</p><p class="upload-label">Click to upload</p>`;
    }
  });

  const removeImgBtn = document.getElementById('btn-remove-img');
  if (removeImgBtn) {
    removeImgBtn.addEventListener('click', () => {
      pendingImageUrl = null;
      imgUpload.classList.remove('has-image');
      imgUpload.innerHTML = `<p style="font-size: 1.5rem;">🖼</p><p class="upload-label">Click to upload</p>`;
      removeImgBtn.remove();
    });
  }

  document.getElementById('btn-back-to-editor').addEventListener('click', (e) => { e.preventDefault(); renderEditor(); });
  document.getElementById('btn-cancel-question').addEventListener('click', () => renderEditor());

  document.getElementById('btn-save-question').addEventListener('click', () => {
    const type = document.getElementById('q-type').value;
    const text = document.getElementById('q-text').value.trim();
    const timeLimit = parseInt(document.getElementById('q-time').value) || 20;

    if (!text) { showToast('Please enter question text'); return; }

    let options, correctAnswer;

    if (type === 'mc') {
      options = [];
      document.querySelectorAll('.option-input').forEach(inp => {
        if (inp.value.trim()) options.push(inp.value.trim());
      });
      if (options.length < 2) { showToast('Need at least 2 options'); return; }
      const selectedRadio = document.querySelector('.correct-radio:checked');
      if (!selectedRadio) { showToast('Select the correct answer'); return; }
      correctAnswer = options[parseInt(selectedRadio.value)];
    } else if (type === 'tf') {
      options = ['True', 'False'];
      const selectedRadio = document.querySelector('.correct-radio:checked');
      correctAnswer = selectedRadio ? options[parseInt(selectedRadio.value)] : 'True';
    } else {
      const answerInputs = document.querySelectorAll('.blank-answer-input');
      const answers = [];
      answerInputs.forEach(inp => {
        const val = inp.value.trim();
        if (val) answers.push(val);
      });
      if (answers.length === 0) { showToast('Please enter at least one accepted answer'); return; }
      correctAnswer = answers[0]; // Primary answer
      options = null;
    }

    const questionObj = { type, text, correctAnswer, timeLimit, imageUrl: pendingImageUrl };
    if (options) questionObj.options = options;
    if (type === 'blank') {
      const answerInputs = document.querySelectorAll('.blank-answer-input');
      const allAnswers = [];
      answerInputs.forEach(inp => {
        const val = inp.value.trim();
        if (val) allAnswers.push(val);
      });
      questionObj.acceptedAnswers = allAnswers;
    }

    if (isEdit) {
      currentQuiz.questions[editIdx] = questionObj;
    } else {
      currentQuiz.questions.push(questionObj);
    }

    renderEditor();
    showToast(isEdit ? 'Question updated!' : 'Question added!');
  });
}

function renderOptionsSection(q) {
  const optionColors = ['var(--color-red)', 'var(--color-blue)', 'var(--color-gold)', 'var(--color-green)'];
  const shapes = ['▲', '◆', '●', '■'];

  if (q.type === 'mc') {
    const opts = q.options || ['', '', '', ''];
    return `
      <div class="form-group">
        <label class="form-label">Options (mark correct answer)</label>
        <div class="options-list">
          ${opts.map((o, i) => `
            <div class="option-row">
              <div class="option-color" style="background: ${optionColors[i]};"></div>
              <span style="font-size: 1.1rem;">${shapes[i]}</span>
              <input type="text" class="form-input option-input" value="${escapeHtml(o)}" placeholder="Option ${i + 1}" />
              <input type="radio" name="correct" class="correct-radio" value="${i}" ${q.correctAnswer === o && o ? 'checked' : ''} title="Mark as correct" />
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  if (q.type === 'tf') {
    return `
      <div class="form-group">
        <label class="form-label">Correct Answer</label>
        <div class="options-list">
          <div class="option-row">
            <div class="option-color" style="background: var(--color-blue);"></div>
            <span>True</span>
            <input type="radio" name="correct" class="correct-radio" value="0" ${q.correctAnswer === 'True' ? 'checked' : ''} />
          </div>
          <div class="option-row">
            <div class="option-color" style="background: var(--color-red);"></div>
            <span>False</span>
            <input type="radio" name="correct" class="correct-radio" value="1" ${q.correctAnswer === 'False' ? 'checked' : ''} />
          </div>
        </div>
      </div>
    `;
  }

  const answers = q.acceptedAnswers || (q.correctAnswer ? [q.correctAnswer] : ['']);
  return `
    <div class="form-group">
      <label class="form-label">Accepted Answers <span style="color: var(--text-muted); font-weight: 400; font-size: 0.8rem;">(all are correct)</span></label>
      <div id="blank-answers-list">
        ${answers.map((a, i) => `
          <div class="option-row" style="margin-bottom: 0.4rem;">
            <input type="text" class="form-input blank-answer-input" value="${escapeHtml(a)}" placeholder="Accepted answer ${i + 1}" />
            ${i > 0 ? `<button type="button" class="btn-danger btn-sm remove-blank-answer" style="margin-left: 0.5rem; padding: 0.3rem 0.6rem;">✕</button>` : ''}
          </div>
        `).join('')}
      </div>
      <button type="button" class="btn-secondary btn-sm mt-1" id="btn-add-blank-answer" style="font-size: 0.8rem;">+ Add Another Answer</button>
      <p style="color: var(--text-muted); font-size: 0.8rem; margin-top: 0.3rem;">Case-insensitive matching. First answer is shown as primary.</p>
    </div>
  `;
}

async function handleSaveQuiz() {
  const title = document.getElementById('quiz-title')?.value.trim();
  if (!title) { showToast('Please enter a quiz title'); return; }

  const data = {
    title,
    questions: currentQuiz.questions,
    questionCount: currentQuiz.questions.length
  };

  try {
    const id = await saveQuiz(data, currentQuiz.id);
    currentQuiz.id = id;
    quizzes = await getAllQuizzes();
    showToast(currentQuiz.id ? 'Quiz saved!' : 'Quiz created!');
  } catch (err) {
    showToast('Save failed: ' + err.message);
  }
}

// ==============================
// GAME SESSION
// ==============================
async function startGameSession(quiz) {
  currentView = 'lobby';
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  const user = await ensureAuth();

  const sessionData = {
    quizId: quiz.id,
    hostId: user.uid,
    status: 'lobby',
    currentQuestion: -1,
    questionStartedAt: null,
    currentTimeLimit: 20,
    playerCount: 0,
    quizTitle: quiz.title,
    questions: quiz.questions
  };

  await createSession(pin, sessionData);

  currentSession = { pin, ...sessionData, quiz };
  players = [];

  showLobby(pin, quiz);
}

function showLobby(pin, quiz) {
  const joinUrl = `${window.location.origin}/play.html?pin=${pin}`;

  app.innerHTML = `
    <div class="screen screen-centered fade-in">
      <div class="card card-wide lobby-container">
        <h2 class="page-title">${escapeHtml(quiz.title)}</h2>
        <p class="lobby-label">Game PIN</p>
        <p class="lobby-pin">${pin}</p>
        <div id="qr-container"></div>
        <p style="color: var(--text-muted); font-size: 0.85rem; word-break: break-all;">${joinUrl}</p>
        <div class="divider"></div>
        <p class="player-count" id="player-count">0 players joined</p>
        <div class="player-list" id="player-list"></div>
        <div class="btn-group mt-3" style="justify-content: center;">
          <button class="btn-primary" id="btn-start-game" disabled>🚀 Start Game</button>
          <button class="btn-danger btn-sm" id="btn-cancel-game">Cancel</button>
        </div>
      </div>
    </div>
  `;

  renderQRCode(document.getElementById('qr-container'), joinUrl);

  // Listen for players
  unsubPlayers = onPlayersChange(pin, (playerList) => {
    players = playerList;
    const countEl = document.getElementById('player-count');
    const listEl = document.getElementById('player-list');
    const startBtn = document.getElementById('btn-start-game');

    if (countEl) countEl.textContent = `${players.length} player${players.length !== 1 ? 's' : ''} joined`;
    if (listEl) listEl.innerHTML = players.map(p =>
      `<span class="player-chip">${escapeHtml(p.name)}</span>`
    ).join('');
    if (startBtn) startBtn.disabled = players.length === 0;

    updateSession(pin, { playerCount: players.length }).catch(() => { });
  });

  document.getElementById('btn-start-game').addEventListener('click', () => startPlaying());
  document.getElementById('btn-cancel-game').addEventListener('click', async () => {
    if (unsubPlayers) unsubPlayers();
    await deleteSession(pin);
    showQuizList();
  });
}

async function startPlaying() {
  currentView = 'playing';
  await advanceQuestion(0);
}

async function advanceQuestion(index) {
  const quiz = currentSession.quiz;
  if (index >= quiz.questions.length) {
    await showFinalResults();
    return;
  }

  const question = quiz.questions[index];
  const now = Date.now();

  await updateSession(currentSession.pin, {
    status: 'question',
    currentQuestion: index,
    questionStartedAt: now,
    currentTimeLimit: question.timeLimit
  });

  showHostQuestion(question, index, quiz.questions.length, now);
}

function showHostQuestion(question, index, total, startedAt) {
  const typeBadge = question.type === 'mc' ? 'badge-mc' : question.type === 'tf' ? 'badge-tf' : 'badge-blank';
  const typeLabel = question.type === 'mc' ? 'Multiple Choice' : question.type === 'tf' ? 'True/False' : 'Fill in Blank';
  const shapes = ['▲', '◆', '●', '■'];

  app.innerHTML = `
    <div class="screen screen-centered fade-in">
      <div class="question-display">
        <p class="question-number">Question ${index + 1} of ${total}</p>
        <span class="question-type-badge ${typeBadge}">${typeLabel}</span>
        <h2 class="question-text">${escapeHtml(question.text)}</h2>
        ${question.imageUrl ? `<img src="${question.imageUrl}" class="question-image" />` : ''}
        <div id="timer-container"></div>

        ${question.type === 'blank'
      ? `<p style="color: var(--text-secondary); margin: 1rem 0;">Students are typing their answers...</p>`
      : `<div class="answer-grid" style="margin: 0 auto;">
              ${(question.options || []).map((opt, i) => `
                <div class="answer-btn answer-${i}" style="cursor: default;">
                  <span class="answer-shape">${shapes[i]}</span>
                  ${escapeHtml(opt)}
                </div>
              `).join('')}
            </div>`
    }

        <p class="mt-3" style="color: var(--text-muted);" id="answers-count">0 / ${players.length} answered</p>

        <button class="btn-secondary mt-2" id="btn-skip-timer">Skip Timer →</button>
      </div>
    </div>
  `;

  // Start timer
  const timerContainer = document.getElementById('timer-container');
  timer = new Timer(timerContainer, null, () => {
    showQuestionResults(question, index);
  });
  timer.startFromTimestamp(startedAt, question.timeLimit * 1000);

  document.getElementById('btn-skip-timer').addEventListener('click', () => {
    if (timer) timer.stop();
    showQuestionResults(question, index);
  });

  // Listen for answers
  const checkAnswers = async () => {
    const allP = await getAllPlayers(currentSession.pin);
    let answered = 0;
    allP.forEach(p => {
      if (p.answers && p.answers[String(index)] !== undefined) answered++;
    });
    const el = document.getElementById('answers-count');
    if (el) el.textContent = `${answered} / ${players.length} answered`;

    if (answered >= players.length && players.length > 0) {
      if (timer) timer.stop();
      showQuestionResults(question, index);
    }
  };

  // Poll for answers in demo mode (Firebase would use real-time listener)
  if (isDemo) {
    const pollId = setInterval(async () => {
      if (currentView !== 'playing') { clearInterval(pollId); return; }
      await checkAnswers();
    }, 1000);
  }
}

async function showQuestionResults(question, index) {
  if (timer) timer.stop();

  await updateSession(currentSession.pin, { status: 'results' });

  players = await getAllPlayers(currentSession.pin);

  const answerCounts = {};
  let correctCount = 0;
  players.forEach(p => {
    if (p.answers && p.answers[String(index)]) {
      const ans = p.answers[String(index)].answer;
      answerCounts[ans] = (answerCounts[ans] || 0) + 1;
      if (p.answers[String(index)].correct) correctCount++;
    }
  });

  const shapes = ['▲', '◆', '●', '■'];
  const colors = ['var(--color-red)', 'var(--color-blue)', 'var(--color-gold)', 'var(--color-green)'];

  let distribution = '';
  if (question.type === 'blank') {
    const allAnswers = question.acceptedAnswers || [question.correctAnswer];
    const answersHtml = allAnswers.map(a => `<strong style="color: var(--color-green);">${escapeHtml(a)}</strong>`).join(', ');
    distribution = `
      <div class="text-center mt-3">
        <p style="font-size: 1.2rem;">Accepted answer${allAnswers.length > 1 ? 's' : ''}: ${answersHtml}</p>
        <p style="color: var(--text-secondary);">${correctCount} / ${players.length} got it right</p>
      </div>
    `;
  } else {
    const opts = question.options || [];
    const maxCount = Math.max(1, ...Object.values(answerCounts));
    distribution = `
      <div class="answer-distribution">
        ${opts.map((opt, i) => {
      const count = answerCounts[opt] || 0;
      const heightPct = (count / maxCount) * 100;
      const isCorrect = opt === question.correctAnswer;
      return `
            <div class="dist-bar-container">
              <div class="dist-bar ${isCorrect ? 'correct-bar' : ''}"
                   style="height: ${Math.max(5, heightPct)}%; background: ${colors[i]};">
                ${count}
              </div>
              <span class="dist-label">${shapes[i]} ${escapeHtml(opt)} ${isCorrect ? '✓' : ''}</span>
            </div>
          `;
    }).join('')}
      </div>
    `;
  }

  app.innerHTML = `
    <div class="screen screen-centered fade-in">
      <div class="question-display">
        <h2 class="question-text">${escapeHtml(question.text)}</h2>
        ${distribution}
        <div class="divider"></div>
        <div id="leaderboard-container" class="mt-2"></div>
        <button class="btn-primary mt-3" id="btn-next-question">
          ${index + 1 < currentSession.quiz.questions.length ? '➡ Next Question' : '🏆 Final Results'}
        </button>
      </div>
    </div>
  `;

  renderLeaderboard(document.getElementById('leaderboard-container'), players, null, 5);

  document.getElementById('btn-next-question').addEventListener('click', () => {
    advanceQuestion(index + 1);
  });
}

async function showFinalResults() {
  currentView = 'final';
  await updateSession(currentSession.pin, { status: 'finished' });

  players = await getAllPlayers(currentSession.pin);
  const ranked = rankPlayers(players);

  app.innerHTML = `
    <div class="screen screen-centered fade-in">
      <div class="card card-wide" style="text-align: center;">
        <h1 style="font-size: 2.5rem; margin-bottom: 0.5rem;">🏆</h1>
        <h2 class="page-title">Final Results</h2>
        <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">${escapeHtml(currentSession.quiz.title)}</p>

        ${ranked.length > 0 ? `
          <div style="display: flex; justify-content: center; gap: 2rem; margin-bottom: 2rem; flex-wrap: wrap;">
            ${ranked.slice(0, 3).map((p, i) => `
              <div style="text-align: center;">
                <p style="font-size: 2.5rem;">${['🥇', '🥈', '🥉'][i]}</p>
                <p style="font-weight: 800; font-size: 1.2rem;">${escapeHtml(p.name)}</p>
                <p style="color: var(--accent); font-weight: 700;">${p.score.toLocaleString()} pts</p>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div id="final-leaderboard"></div>

        <div class="btn-group mt-4" style="justify-content: center;">
          <button class="btn-primary" id="btn-new-game">🔄 Play Again</button>
          <button class="btn-secondary" id="btn-back-to-list">📋 Back to Quizzes</button>
        </div>
      </div>
    </div>
  `;

  renderLeaderboard(document.getElementById('final-leaderboard'), players, null, 30);

  document.getElementById('btn-new-game').addEventListener('click', () => {
    startGameSession(currentSession.quiz);
  });

  document.getElementById('btn-back-to-list').addEventListener('click', () => {
    if (unsubPlayers) unsubPlayers();
    showQuizList();
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
