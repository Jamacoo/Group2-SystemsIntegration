// background.js — reports the active tab's site to the proctoring backend
// while an exam session is running.

const AI_SITES = {
  'chatgpt.com': 'ChatGPT',
  'chat.openai.com': 'ChatGPT',
  'claude.ai': 'Claude',
  'gemini.google.com': 'Gemini',
  'copilot.microsoft.com': 'Copilot',
  'perplexity.ai': 'Perplexity',
  'deepseek.com': 'DeepSeek',
  'poe.com': 'Poe'
};
const REPORT_OTHER_SITES = true;   // false = only flag AI sites

const getSession = () => chrome.storage.session.get(['sessionId', 'studentId', 'apiBase']);

// Returns { type, site, host, category } for any http(s) page, or null.
// `type` is the violation to raise (null = just log it as activity).
function classify(url, apiBase) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;                 // chrome://, about:, etc.
  const host = u.hostname.replace(/^www\./, '');
  if (apiBase && u.origin === new URL(apiBase).origin) {
    return { type: null, site: 'Exam portal', host, category: 'EXAM' };
  }
  if (host === 'docs.google.com' && u.pathname.startsWith('/forms')) {
    return { type: null, site: 'Google Forms', host, category: 'EXAM' };
  }
  for (const [domain, name] of Object.entries(AI_SITES)) {
    if (host === domain || host.endsWith('.' + domain)) {
      return { type: 'AI_SITE_VISITED', site: name, host, category: 'AI_SITE' };
    }
  }
  return { type: REPORT_OTHER_SITES ? 'OTHER_SITE_VISITED' : null, site: host, host, category: 'BROWSER' };
}

let last = { host: '', ts: 0 };
let browserFocused = false;   // false after focus leaves the browser, so the next return is logged

async function handleTab(tab) {
  if (!tab || !tab.url) return;
  const s = await getSession();
  if (!s.sessionId) return;                       // no active exam

  const result = classify(tab.url, s.apiBase);
  if (!result) return;

  // onActivated + onUpdated often fire together — skip duplicates
  const now = Date.now();
  if (result.host === last.host && now - last.ts < 3000) return;
  last = { host: result.host, ts: now };

  const post = (path, body) => fetch(`${s.apiBase}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).catch((err) => console.error('[proctor-ext] report failed', err));

  // Live Activity: the browser is the foreground application
  if (!browserFocused) {
    browserFocused = true;
    post('activity', {
      sessionId: s.sessionId, studentId: s.studentId, source: 'extension',
      category: 'BROWSER', label: 'Web Browser',
      occurredAt: new Date().toISOString()
    });
  }

  // Suspicious sites -> violations (the Live Activity page only shows app names)
  if (result.type) {
    post('violations', {
      sessionId: s.sessionId, studentId: s.studentId, type: result.type,
      occurredAt: new Date().toISOString(),
      details: { source: 'extension', site: result.site, host: result.host, title: tab.title }
    });
  }
}

// Student switches tabs
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try { handleTab(await chrome.tabs.get(tabId)); } catch {}
});

// A page finishes loading / navigates in the active tab
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && tab.active) handleTab(tab);
});

// Student alt-tabs to a different browser WINDOW (no tab event fires for this)
chrome.windows.onFocusChanged.addListener(async (winId) => {
  if (winId === chrome.windows.WINDOW_ID_NONE) { browserFocused = false; return; }   // focus left the browser; the desktop monitor logs what is opened instead
  try {
    const [tab] = await chrome.tabs.query({ active: true, windowId: winId });
    handleTab(tab);
  } catch {}
});

// Heartbeat so the backend (and the desktop monitor) know the extension is alive.
async function sendHeartbeat() {
  const s = await getSession();
  if (!s.sessionId) return;
  fetch(`${s.apiBase}/sessions/${s.sessionId}/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'extension' })
  }).catch(() => {});
}
chrome.alarms.create('heartbeat', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'heartbeat') sendHeartbeat(); });

// Messages relayed from the exam page
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'PROCTOR_SESSION') {
    browserFocused = false;
    chrome.storage.session.set(msg.data).then(sendHeartbeat);
  }
  if (msg.type === 'PROCTOR_END') chrome.storage.session.clear();
});
