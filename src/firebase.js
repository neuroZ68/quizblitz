/**
 * Data layer abstraction — automatically uses localStorage-backed demo mode
 * when Firebase isn't configured, or real Firebase when it is.
 *
 * Demo mode uses localStorage for cross-tab communication so that
 * the host and player pages (in separate tabs) can interact.
 */

// ---- Detect if Firebase is configured ----
const PLACEHOLDER = 'YOUR_API_KEY';
let useFirebase = false;
let _db = null;
let _auth = null;
let _storage = null;

// Try to initialize Firebase
try {
  const config = await import('./firebaseConfig.js');
  if (config.firebaseConfig.apiKey && config.firebaseConfig.apiKey !== PLACEHOLDER) {
    const { initializeApp } = await import('firebase/app');
    const { getFirestore } = await import('firebase/firestore');
    const { getAuth } = await import('firebase/auth');
    const { getStorage } = await import('firebase/storage');

    const app = initializeApp(config.firebaseConfig);
    _db = getFirestore(app);
    _auth = getAuth(app);
    _storage = getStorage(app);
    useFirebase = true;
    console.log('🔥 Firebase connected');
  } else {
    console.log('🎮 Demo mode — using localStorage (no Firebase config found)');
  }
} catch (err) {
  console.log('🎮 Demo mode — Firebase not available:', err.message);
}

export const isDemo = !useFirebase;
export const db = _db;
export const auth = _auth;
export const storage = _storage;

// ---- Auth helper ----
export async function ensureAuth() {
  if (useFirebase) {
    const { signInAnonymously } = await import('firebase/auth');
    if (!_auth.currentUser) {
      await signInAnonymously(_auth);
    }
    return _auth.currentUser;
  }
  // Demo mode: persistent fake user per tab
  if (!window._demoUserId) {
    window._demoUserId = 'demo-' + Math.random().toString(36).substring(2, 10);
  }
  return { uid: window._demoUserId };
}

// ============================================
// LOCAL STORAGE HELPERS (Demo Mode)
// ============================================
const LS_KEYS = {
  quizzes: 'qb_quizzes',
  session: (pin) => `qb_session_${pin}`,
  players: (pin) => `qb_players_${pin}`,
  activePins: 'qb_active_pins',
};

function lsGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function lsSet(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function lsRemove(key) {
  localStorage.removeItem(key);
}

// Track active game PINs so we can discover them
function getActivePins() {
  return lsGet(LS_KEYS.activePins, []);
}

function addActivePin(pin) {
  const pins = getActivePins();
  if (!pins.includes(pin)) {
    pins.push(pin);
    lsSet(LS_KEYS.activePins, pins);
  }
}

function removeActivePin(pin) {
  const pins = getActivePins().filter(p => p !== pin);
  lsSet(LS_KEYS.activePins, pins);
}

// Cross-tab polling registry
const pollCallbacks = new Map(); // key -> { callback, interval }

function startPolling(key, fetchFn, callback, intervalMs = 300) {
  // Stop any existing poll for this key
  stopPolling(key);

  // First call
  const data = fetchFn();
  callback(data);

  // Also listen to storage events for instant cross-tab updates
  const storageHandler = (e) => {
    if (e.key && e.key.startsWith('qb_')) {
      const data = fetchFn();
      callback(data);
    }
  };
  window.addEventListener('storage', storageHandler);

  // Poll for same-tab updates
  const id = setInterval(() => {
    const data = fetchFn();
    callback(data);
  }, intervalMs);

  pollCallbacks.set(key, { id, storageHandler });

  return () => stopPolling(key);
}

function stopPolling(key) {
  const entry = pollCallbacks.get(key);
  if (entry) {
    clearInterval(entry.id);
    window.removeEventListener('storage', entry.storageHandler);
    pollCallbacks.delete(key);
  }
}

// Pre-load firestore module if using Firebase
if (useFirebase) {
  import('firebase/firestore').then(mod => {
    window._firestoreModule = mod;
  });
}

function requireFirestore() {
  if (!window._firestoreModule) throw new Error('Firestore not loaded');
  return window._firestoreModule;
}

// ============================================
// UNIFIED API — works in both Firebase & Demo
// ============================================

// --- Quizzes ---
export async function getAllQuizzes() {
  if (useFirebase) {
    const { collection, getDocs } = await import('firebase/firestore');
    const snap = await getDocs(collection(_db, 'quizzes'));
    const results = [];
    snap.forEach(d => results.push({ id: d.id, ...d.data() }));
    return results;
  }
  return lsGet(LS_KEYS.quizzes, []);
}

export async function saveQuiz(quizData, existingId = null) {
  if (useFirebase) {
    const { collection, addDoc, doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
    const data = { ...quizData, createdAt: serverTimestamp() };
    if (existingId) {
      await updateDoc(doc(_db, 'quizzes', existingId), data);
      return existingId;
    } else {
      const docRef = await addDoc(collection(_db, 'quizzes'), data);
      return docRef.id;
    }
  }
  // Demo mode
  const id = existingId || 'quiz_' + Date.now();
  const quizzes = lsGet(LS_KEYS.quizzes, []);
  const idx = quizzes.findIndex(q => q.id === id);
  const quiz = { id, ...quizData, createdAt: new Date().toISOString() };
  if (idx >= 0) quizzes[idx] = quiz;
  else quizzes.push(quiz);
  lsSet(LS_KEYS.quizzes, quizzes);
  return id;
}

export async function deleteQuiz(quizId) {
  if (useFirebase) {
    const { doc, deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(_db, 'quizzes', quizId));
    return;
  }
  const quizzes = lsGet(LS_KEYS.quizzes, []).filter(q => q.id !== quizId);
  lsSet(LS_KEYS.quizzes, quizzes);
}

// --- Sessions ---
export async function createSession(pin, sessionData) {
  if (useFirebase) {
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(_db, 'sessions', pin), sessionData);
    return;
  }
  lsSet(LS_KEYS.session(pin), sessionData);
  lsSet(LS_KEYS.players(pin), []);
  addActivePin(pin);
}

export async function getSession(pin) {
  if (useFirebase) {
    const { doc, getDoc } = await import('firebase/firestore');
    const snap = await getDoc(doc(_db, 'sessions', pin));
    if (!snap.exists()) return null;
    return snap.data();
  }
  return lsGet(LS_KEYS.session(pin), null);
}

export async function updateSession(pin, updates) {
  if (useFirebase) {
    const { doc, updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(_db, 'sessions', pin), updates);
    return;
  }
  const session = lsGet(LS_KEYS.session(pin), null);
  if (session) {
    Object.assign(session, updates);
    lsSet(LS_KEYS.session(pin), session);
  }
}

export async function deleteSession(pin) {
  if (useFirebase) {
    const { doc, deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(_db, 'sessions', pin));
    return;
  }
  lsRemove(LS_KEYS.session(pin));
  lsRemove(LS_KEYS.players(pin));
  removeActivePin(pin);
}

export function onSessionChange(pin, callback) {
  if (useFirebase) {
    const { doc, onSnapshot } = requireFirestore();
    return onSnapshot(doc(_db, 'sessions', pin), (snap) => {
      if (!snap.exists()) callback(null);
      else callback(snap.data());
    });
  }
  // Demo: poll localStorage for session changes
  return startPolling(`session:${pin}`, () => lsGet(LS_KEYS.session(pin), null), callback);
}

// --- Players ---
export async function addPlayer(pin, playerId, playerData) {
  if (useFirebase) {
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(_db, 'sessions', pin, 'players', playerId), playerData);
    return;
  }
  const players = lsGet(LS_KEYS.players(pin), []);
  const idx = players.findIndex(p => p.id === playerId);
  const entry = { id: playerId, ...playerData };
  if (idx >= 0) players[idx] = entry;
  else players.push(entry);
  lsSet(LS_KEYS.players(pin), players);
}

export async function updatePlayer(pin, playerId, updates) {
  if (useFirebase) {
    const { doc, updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(_db, 'sessions', pin, 'players', playerId), updates);
    return;
  }
  const players = lsGet(LS_KEYS.players(pin), []);
  const idx = players.findIndex(p => p.id === playerId);
  if (idx >= 0) {
    Object.assign(players[idx], updates);
    lsSet(LS_KEYS.players(pin), players);
  }
}

export async function getAllPlayers(pin) {
  if (useFirebase) {
    const { collection, getDocs } = await import('firebase/firestore');
    const snap = await getDocs(collection(_db, 'sessions', pin, 'players'));
    const results = [];
    snap.forEach(d => results.push({ id: d.id, ...d.data() }));
    return results;
  }
  return lsGet(LS_KEYS.players(pin), []);
}

export function onPlayersChange(pin, callback) {
  if (useFirebase) {
    const { collection: col, onSnapshot } = requireFirestore();
    return onSnapshot(col(_db, 'sessions', pin, 'players'), (snap) => {
      const results = [];
      snap.forEach(d => results.push({ id: d.id, ...d.data() }));
      callback(results);
    });
  }
  // Demo: poll localStorage for player changes
  return startPolling(`players:${pin}`, () => lsGet(LS_KEYS.players(pin), []), callback);
}

// --- Image upload ---
export async function uploadImage(file) {
  if (useFirebase) {
    const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
    const path = `question-images/${Date.now()}_${file.name}`;
    const storageRef = ref(_storage, path);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
  }
  // Demo: convert to data URL
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
