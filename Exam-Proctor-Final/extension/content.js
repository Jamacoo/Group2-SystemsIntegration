// content.js — runs only on the exam portal page. Relays messages between
// proctor.js (the page) and background.js (the extension).

function announceReady() {
  window.postMessage({ source: 'proctor-ext', type: 'READY' }, '*');
}
announceReady();

window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data) return;

  // proctor.js asking "are you installed?"
  if (e.data.source === 'proctor-ping') return announceReady();

  if (e.data.source === 'proctor') {
    chrome.runtime.sendMessage({
      type: e.data.end ? 'PROCTOR_END' : 'PROCTOR_SESSION',
      data: { sessionId: e.data.sessionId, studentId: e.data.studentId, apiBase: e.data.apiBase }
    });
  }
});
