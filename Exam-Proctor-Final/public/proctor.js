// proctor.js — runs on the wrapper page. Handles starting/ending the
// exam session and detecting + logging suspicious behavior.

const API_BASE = 'http://localhost:3000/api';
const params = new URLSearchParams(window.location.search);
const examId = params.get('examId') || '1';

let studentId = null;
let sessionId = null;
let examActive = false;

// --- Browser extension handshake ---
// The extension's content script announces itself on this page. Set to false
// to let students take the exam without the extension installed.
const REQUIRE_EXTENSION = true;
let extensionReady = false;
window.addEventListener('message', (e) => {
  if (e.source === window && e.data && e.data.source === 'proctor-ext' && e.data.type === 'READY') {
    extensionReady = true;
  }
});
window.postMessage({ source: 'proctor-ping' }, '*');

// If the page was opened with ?studentId=... in the URL, prefill it.
window.addEventListener('DOMContentLoaded', () => {
  const prefill = params.get('studentId');
  if (prefill) {
    document.getElementById('studentIdInput').value = prefill;
  }
});

function showWarning(message) {
  const banner = document.getElementById('warning-banner');
  banner.textContent = message;
  banner.style.display = 'block';
  setTimeout(() => { banner.style.display = 'none'; }, 3000);
}

async function logViolation(type, details = {}) {
  console.log('[proctor] logViolation called:', type, '| sessionId =', sessionId);
  if (!sessionId) {
    console.warn('[proctor] No active sessionId — violation was NOT sent.');
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/violations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        studentId,
        type,
        occurredAt: new Date().toISOString(),
        details
      })
    });
    console.log('[proctor] Violation POST response status:', res.status);
  } catch (err) {
    console.error('[proctor] Failed to log violation:', err);
  }
  showWarning(`⚠️ Violation logged: ${type.replace(/_/g, ' ')}`);
}

async function startExam() {
  const input = document.getElementById('studentIdInput');
  studentId = input.value.trim();
  if (!studentId) {
    alert('Please enter your Student ID.');
    return;
  }

  if (REQUIRE_EXTENSION && !extensionReady) {
    alert('The Exam Proctor browser extension is not installed or not enabled. Install it, reload this page, and try again.');
    return;
  }

  // Request fullscreen FIRST, synchronously, before any await. Browsers
  // only honor fullscreen requests made within a short window of the
  // original click — if we wait until after network calls finish, the
  // browser may silently ignore the request.
  document.documentElement.requestFullscreen().catch(() => {
    console.warn('[proctor] Fullscreen request was blocked or unsupported.');
  });

  // 1. Look up which Google Form this exam uses.
  let examData;
  try {
    const res = await fetch(`${API_BASE}/exams/${examId}`);
    if (!res.ok) throw new Error('Exam not found');
    examData = await res.json();
  } catch (err) {
    alert('Could not load the exam. Make sure the backend server is running.');
    return;
  }

  // 2. Create a session so violations have something to attach to.
  try {
    const res = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, examId })
    });
    const data = await res.json();
    sessionId = data.sessionId;
    console.log('[proctor] Session started, sessionId =', sessionId);
    // Hand the session to the browser extension so it can report sites visited.
    window.postMessage({ source: 'proctor', sessionId, studentId, apiBase: API_BASE }, '*');
  } catch (err) {
    alert('Could not start the session. Make sure the backend server is running.');
    return;
  }

  // 3. Swap the UI over to the exam view.
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('end-session-bar').style.display = 'block';
  const frame = document.getElementById('exam-frame');
  frame.src = examData.form_url;
  frame.style.display = 'block';

  examActive = true;
  console.log('[proctor] Exam is now active — monitoring started.');
}

async function endSession() {
  if (!sessionId) return;
  examActive = false;
  window.postMessage({ source: 'proctor', end: true }, '*');

  try {
    await fetch(`${API_BASE}/sessions/${sessionId}/end`, { method: 'PATCH' });
  } catch (err) {
    console.error('Failed to end session:', err);
  }

  if (document.fullscreenElement) {
    document.exitFullscreen();
  }

  document.getElementById('end-session-bar').style.display = 'none';
  document.getElementById('exam-frame').style.display = 'none';
  alert('Session ended. You may close this tab.');
}

// --- Detection listeners ---

document.addEventListener('visibilitychange', () => {
  console.log('[proctor] visibilitychange fired | hidden =', document.hidden, '| examActive =', examActive);
  if (examActive && document.hidden) {
    logViolation('TAB_HIDDEN');
  }
});

window.addEventListener('blur', () => {
  // A short delay lets document.hasFocus() settle before we check it.
  setTimeout(() => {
    const stillHasFocus = document.hasFocus();
    console.log('[proctor] window blur fired | examActive =', examActive, '| document.hasFocus() =', stillHasFocus);

    if (!examActive) return;

    // If the browser window still has focus overall, this blur was
    // caused by focus moving INTO the embedded exam iframe (e.g. the
    // student clicking to start answering, or the submit confirmation
    // inside the form) — not by switching to a different window or
    // app. That's expected exam interaction, not a violation.
    if (stillHasFocus) {
      console.log('[proctor] Blur was internal (focus moved into the form) — not logging.');
      return;
    }

    logViolation('WINDOW_BLUR');
  }, 50);
});

document.addEventListener('fullscreenchange', () => {
  console.log('[proctor] fullscreenchange fired | fullscreenElement =', document.fullscreenElement, '| examActive =', examActive);
  if (examActive && !document.fullscreenElement) {
    logViolation('EXITED_FULLSCREEN');
  }
});

document.addEventListener('copy', () => {
  console.log('[proctor] copy fired | examActive =', examActive);
  if (examActive) logViolation('COPY_ATTEMPT');
});

document.addEventListener('contextmenu', (e) => {
  console.log('[proctor] contextmenu fired on:', e.target.tagName, '| examActive =', examActive);
  if (examActive) {
    e.preventDefault();
    logViolation('RIGHT_CLICK_ATTEMPT');
  }
});

window.addEventListener('beforeunload', (e) => {
  if (examActive) {
    // sendBeacon works more reliably than fetch during page unload.
    navigator.sendBeacon(
      `${API_BASE}/violations`,
      new Blob([JSON.stringify({
        sessionId,
        studentId,
        type: 'TAB_CLOSE_ATTEMPT',
        occurredAt: new Date().toISOString()
      })], { type: 'application/json' })
    );
    e.preventDefault();
    e.returnValue = '';
  }
});

document.getElementById('start-btn').addEventListener('click', startExam);
document.getElementById('end-btn').addEventListener('click', endSession);

// --- Fallback: periodic focus poll ---
// Event-based detection (blur/visibilitychange) doesn't fire
// reliably in every browser/OS combination — some Windows + Chrome
// fullscreen transitions to other apps don't dispatch a blur event
// at all. This polls document.hasFocus() every 2 seconds as a
// safety net so those cases still get caught.
let missedFocusAlready = false;
setInterval(() => {
  if (!examActive) return;
  const hasFocus = document.hasFocus();
  if (!hasFocus && !missedFocusAlready) {
    missedFocusAlready = true;
    console.log('[proctor] Poll check detected focus loss (fallback)');
    logViolation('FOCUS_LOST_POLL');
  } else if (hasFocus) {
    missedFocusAlready = false;
  }
}, 2000);
