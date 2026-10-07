// dashboard.js — loads the session summary and renders it as a
// sortable, expandable table for the instructor.

const API_BASE = 'http://localhost:3000/api';

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

function renderTable(sessions) {
  const tbody = document.getElementById('sessions-body');
  const emptyMsg = document.getElementById('empty-msg');
  tbody.innerHTML = '';

  if (sessions.length === 0) {
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
      <td>${formatDateTime(session.ended_at)}</td>
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

// For sessions still running, show whether the browser extension and the
// desktop monitor are currently reporting in.
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
      cell.innerHTML = dot(st.extensionAlive, 'Extension') + '<br>' + dot(st.monitorAlive, 'Monitor') +
        (st.monitorInfo && st.monitorInfo.limited
          ? '<div class="muted">Monitor limited on this OS</div>' : '');
    } catch {
      cell.innerHTML = '<span class="muted">unknown</span>';
    }
  }));
}

async function loadDashboard() {
  try {
    const sessions = await fetchSessions();
    renderTable(sessions);
    loadStatuses(sessions);
    document.getElementById('last-updated').textContent =
      'Last updated: ' + new Date().toLocaleTimeString();
  } catch (err) {
    console.error('Failed to load dashboard:', err);
    document.getElementById('last-updated').textContent =
      'Failed to load — is the backend running?';
  }
}

document.getElementById('refresh-btn').addEventListener('click', () => {
  violationCache.clear();
  loadDashboard();
});

loadDashboard();

// Live view: re-fetch every 10s (clearing the cache so open rows pick up new events).
setInterval(() => {
  if (document.getElementById('auto-refresh').checked) {
    violationCache.clear();
    loadDashboard();
  }
}, 10000);
