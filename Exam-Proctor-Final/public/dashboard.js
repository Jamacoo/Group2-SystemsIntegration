// dashboard.js — loads the session summary and renders it as a
// sortable, expandable table for the instructor.

// Uses whatever address this page was opened from (works on localhost and on the network).
const API_BASE = window.location.origin + '/api';

// Rows already expanded, so a refresh doesn't collapse what the
// instructor was looking at. Keyed by session_id.
const expandedSessions = new Set();
// Cache of fetched violation details per session, to avoid re-fetching
// every time a row is toggled open and closed.
const violationCache = new Map();

function riskLabel(score) {
  if (score === 0) return { text: 'Clean', className: 'risk-clean' };
  if (score <= 4) return { text: 'Low', className: 'risk-low' };
  if (score <= 14) return { text: 'Medium', className: 'risk-medium' };
  return { text: 'High', className: 'risk-high' };
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

async function fetchSessions() {
  const res = await fetch(`${API_BASE}/dashboard/sessions`);
  if (!res.ok) throw new Error('Failed to load dashboard data');
  return res.json();
}

async function fetchViolationsForSession(sessionId) {
  if (violationCache.has(sessionId)) {
    return violationCache.get(sessionId);
  }
  const res = await fetch(`${API_BASE}/violations/session/${sessionId}`);
  const data = await res.json();
  violationCache.set(sessionId, data);
  return data;
}

// Mirrors the backend's heuristic (routes/dashboard.js): a violation
// close to the LAST violation recorded in its session is likely the
// Google Forms submission dialog, not mid-exam cheating.
const SUBMISSION_DIALOG_WINDOW_SECONDS = 10;
const SUBMISSION_DIALOG_TYPES = new Set(['EXITED_FULLSCREEN', 'FOCUS_LOST_POLL']);

function isLikelySubmissionDialog(violation, latestOccurredAtMs) {
  if (!SUBMISSION_DIALOG_TYPES.has(violation.type)) return false;
  const diffSeconds = Math.abs(
    (new Date(violation.occurred_at).getTime() - latestOccurredAtMs) / 1000
  );
  return diffSeconds <= SUBMISSION_DIALOG_WINDOW_SECONDS;
}

// Window titles and page titles come from OTHER websites/apps, so they must
// be escaped before going into innerHTML.
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Friendly label + severity for each event type the system can log.
const TYPE_INFO = {
  AI_SITE_VISITED:     { label: 'AI site opened',        icon: '🤖', sev: 'high' },
  OTHER_APP_OPENED:    { label: 'Other app opened',      icon: '🖥️', sev: 'medium' },
  OTHER_SITE_VISITED:  { label: 'Other site opened',     icon: '🌐', sev: '' },
  EXITED_FULLSCREEN:   { label: 'Exited fullscreen',     icon: '⛶',  sev: 'medium' },
  TAB_CLOSE_ATTEMPT:   { label: 'Tried to close tab',    icon: '✖',  sev: 'medium' },
  TAB_HIDDEN:          { label: 'Switched tab',          icon: '🗂️', sev: '' },
  WINDOW_BLUR:         { label: 'Left exam window',      icon: '↗',  sev: '' },
  FOCUS_LOST_POLL:     { label: 'Lost focus',            icon: '↗',  sev: '' },
  COPY_ATTEMPT:        { label: 'Copy attempt',          icon: '📋', sev: '' },
  RIGHT_CLICK_ATTEMPT: { label: 'Right-click attempt',   icon: '🖱️', sev: '' }
};

function parseDetails(v) {
  let d = v.details;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
  return d || {};
}

function describeViolation(v, d) {
  if (v.type === 'AI_SITE_VISITED' || v.type === 'OTHER_SITE_VISITED') {
    const name = d.site || d.host || d.activity || 'Unknown site';
    const host = d.host && d.host !== name ? ` <span class="muted">(${esc(d.host)})</span>` : '';
    const title = d.title || d.windowTitle;
    return `<strong>${esc(name)}</strong>${host}` +
           (title ? `<div class="muted">${esc(title)}</div>` : '');
  }
  if (v.type === 'OTHER_APP_OPENED') {
    return `<strong>${esc(d.process || d.activity || 'Unknown app')}</strong>` +
           (d.windowTitle ? `<div class="muted">${esc(d.windowTitle)}</div>` : '');
  }
  return '<span class="muted">—</span>';
}

function sourceBadge(d) {
  const src = d.source || 'page';
  const label = { extension: 'Extension', monitor: 'Desktop monitor', page: 'Exam page' }[src] || src;
  return `<span class="src-badge src-${esc(src)}">${esc(label)}</span>`;
}

function renderDetailContent(violations) {
  if (violations.length === 0) {
    return '<div class="detail-content">No violations for this session.</div>';
  }
  const latestOccurredAtMs = Math.max(
    ...violations.map(v => new Date(v.occurred_at).getTime())
  );
  const rows = violations
    .map(v => {
      const info = TYPE_INFO[v.type] || { label: v.type.replace(/_/g, ' '), icon: '•', sev: '' };
      const d = parseDetails(v);
      const flag = isLikelySubmissionDialog(v, latestOccurredAtMs)
        ? '<div class="dialog-flag">likely Google Forms submission dialog, not a violation</div>'
        : '';
      return `<tr class="${info.sev ? 'sev-' + info.sev : ''}">
        <td>${formatDateTime(v.occurred_at)}</td>
        <td>${info.icon} <strong>${esc(info.label)}</strong>${flag}</td>
        <td>${describeViolation(v, d)}</td>
        <td>${sourceBadge(d)}</td>
      </tr>`;
    })
    .join('');
  return `<div class="detail-content">
    <table class="detail-table">
      <thead><tr><th>Time</th><th>Event</th><th>Details</th><th>Reported by</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

async function toggleRow(sessionId, rowEl) {
  const existingDetail = document.getElementById(`detail-${sessionId}`);
  if (existingDetail) {
    existingDetail.remove();
    expandedSessions.delete(sessionId);
    return;
  }

  expandedSessions.add(sessionId);
  const detailRow = document.createElement('tr');
  detailRow.className = 'detail-row';
  detailRow.id = `detail-${sessionId}`;
  const td = document.createElement('td');
  td.colSpan = 7;
  td.innerHTML = '<div class="detail-content">Loading…</div>';
  detailRow.appendChild(td);
  rowEl.after(detailRow);

  const violations = await fetchViolationsForSession(sessionId);
  td.innerHTML = renderDetailContent(violations);
}

function renderTable(sessions, hasAny) {
  const tbody = document.getElementById('sessions-body');
  const emptyMsg = document.getElementById('empty-msg');
  tbody.innerHTML = '';

  if (sessions.length === 0) {
    emptyMsg.textContent = hasAny
      ? 'No sessions match these filters.'
      : 'No exam sessions recorded yet.';
    emptyMsg.style.display = 'block';
    return;
  }
  emptyMsg.style.display = 'none';

  sessions.forEach(session => {
    const risk = riskLabel(session.risk_score);
    const row = document.createElement('tr');
    row.className = 'session-row';
    const caveat = session.likely_submission_dialog
      ? '<div class="caveat-note">⚠️ Likely includes a Google Forms submission dialog, not a real violation — check details</div>'
      : '';
    row.innerHTML = `
      <td>${esc(session.student_id)}</td>
      <td>${esc(session.exam_name || 'Exam #' + session.exam_id)}</td>
      <td>${formatDateTime(session.started_at)}</td>
      <td>${session.ended_at ? formatDateTime(session.ended_at) : '<span class="pill-live">Live</span>'}</td>
      <td>${session.violation_count}</td>
      <td>
        <span class="risk-badge ${risk.className}">${risk.text} (${session.risk_score})</span>
        ${caveat}
      </td>
      <td class="status-cell" id="status-${session.session_id}">${session.ended_at ? '<span class="muted">—</span>' : '…'}</td>
    `;
    row.addEventListener('click', () => toggleRow(session.session_id, row));
    tbody.appendChild(row);

    // Re-expand rows that were open before this refresh.
    if (expandedSessions.has(session.session_id)) {
      toggleRow(session.session_id, row);
    }
  });
}

// ---------- Filters ----------
let allSessions = [];
const $ = id => document.getElementById(id);

function saveFilter(key, value) {
  try { localStorage.setItem('dash-' + key, value); } catch (e) {}
}
function loadFilter(key) {
  try { return localStorage.getItem('dash-' + key) || ''; } catch (e) { return ''; }
}

function matchesFilters(s) {
  const exam = $('filter-exam').value;
  const status = $('filter-status').value;
  const risk = $('filter-risk').value;
  const q = $('filter-search').value.trim().toLowerCase();
  if (exam && String(s.exam_id) !== exam) return false;
  if (status === 'live' && s.ended_at) return false;
  if (status === 'ended' && !s.ended_at) return false;
  if (risk === 'clean' && s.risk_score !== 0) return false;
  if (risk === 'flagged' && s.risk_score === 0) return false;
  if (risk === 'high' && s.risk_score <= 14) return false;
  if (q && !String(s.student_id).toLowerCase().includes(q)) return false;
  return true;
}

function applyFilters() {
  const shown = allSessions.filter(matchesFilters);
  $('stat-total').textContent = shown.length;
  $('stat-live').textContent = shown.filter(s => !s.ended_at).length;
  $('stat-high').textContent = shown.filter(s => s.risk_score > 14).length;
  $('stat-violations').textContent = shown.reduce((n, s) => n + Number(s.violation_count || 0), 0);
  renderTable(shown, allSessions.length > 0);
  loadStatuses(shown);
}

// The Exam dropdown lists every exam this professor owns, even ones nobody has taken yet.
async function loadExamOptions() {
  const sel = $('filter-exam');
  const keep = sel.value || loadFilter('exam');
  let exams = [];
  try {
    const res = await fetch(`${API_BASE}/exams`);
    if (res.ok) exams = await res.json();
  } catch (e) {}
  sel.innerHTML = '<option value="">All exams</option>' +
    exams.map(e => `<option value="${e.id}">${esc(e.exam_name)}</option>`).join('');
  sel.value = exams.some(e => String(e.id) === String(keep)) ? keep : '';
}

// For sessions still running, show whether the browser extension is
// currently reporting in.
async function loadStatuses(sessions) {
  const active = sessions.filter(s => !s.ended_at);
  await Promise.all(active.map(async s => {
    const cell = document.getElementById(`status-${s.session_id}`);
    if (!cell) return;
    try {
      const res = await fetch(`${API_BASE}/sessions/${s.session_id}/status`);
      const st = await res.json();
      const dot = (on, name) =>
        `<span class="status-dot ${on ? 'status-on' : 'status-off'}">${on ? '●' : '○'} ${name}</span>`;
      cell.innerHTML = dot(st.extensionAlive, 'Extension');
    } catch {
      cell.innerHTML = '<span class="muted">unknown</span>';
    }
  }));
}

async function loadDashboard() {
  try {
    allSessions = (await fetchSessions()).map(s => ({
      ...s, risk_score: Number(s.risk_score), violation_count: Number(s.violation_count)
    }));
    applyFilters();
    $('last-updated').textContent = 'Last updated: ' + new Date().toLocaleTimeString();
  } catch (err) {
    console.error('Failed to load dashboard:', err);
    $('last-updated').textContent = 'Failed to load — is the backend running?';
  }
}

// Restore the last filters used.
$('filter-status').value = loadFilter('status');
$('filter-risk').value = loadFilter('risk');
$('filter-search').value = loadFilter('search');

['exam', 'status', 'risk'].forEach(key => {
  $('filter-' + key).addEventListener('change', () => {
    saveFilter(key, $('filter-' + key).value);
    applyFilters();
  });
});
$('filter-search').addEventListener('input', () => {
  saveFilter('search', $('filter-search').value);
  applyFilters();
});
$('clear-filters').addEventListener('click', () => {
  ['exam', 'status', 'risk'].forEach(key => { $('filter-' + key).value = ''; saveFilter(key, ''); });
  $('filter-search').value = '';
  saveFilter('search', '');
  applyFilters();
});

$('refresh-btn').addEventListener('click', () => {
  violationCache.clear();
  loadExamOptions().then(loadDashboard);
});

loadExamOptions().then(loadDashboard);

// Live view: re-fetch every 10s (clearing the cache so open rows pick up new events).
setInterval(() => {
  if ($('auto-refresh').checked) {
    violationCache.clear();
    loadDashboard();
  }
}, 10000);
