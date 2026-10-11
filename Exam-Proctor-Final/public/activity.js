// activity.js — shows which APPLICATION each student is in right now
// (Notepad / Microsoft Word / Web Browser / Other Application), plus a
// per-session log of every app switch and how long each lasted.

// Uses whatever address this page was opened from (works on localhost and on the network).
const API_BASE = window.location.origin + '/api';

let sessions = new Map();     // session_id -> row from /dashboard/sessions
let selected = null;          // session_id currently shown in the log

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function fmtTime(v) { return new Date(v).toLocaleTimeString(); }

function fmtDuration(ms) {
  if (ms == null || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

async function getJSON(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(path);
  return res.json();
}

async function loadLive() {
  const box = document.getElementById('live');
  try {
    const rows = await getJSON('/activity/live');
    if (!rows.length) {
      box.innerHTML = '<span class="muted">No active exam sessions are reporting right now.</span>';
      return;
    }
    box.innerHTML = rows.map(a => `
      <div class="card ${a.session_id === selected ? 'sel' : ''}" data-session="${a.session_id}">
        <div class="who">${esc(a.student_id)} <span class="muted">· session ${a.session_id}</span></div>
        <div class="now">${esc(a.label)}</div>
        <div class="muted">since ${fmtTime(a.occurred_at)}</div>
      </div>`).join('');
    box.querySelectorAll('.card').forEach(el => el.addEventListener('click', () => {
      selected = Number(el.dataset.session);
      document.getElementById('session-select').value = selected;
      loadLog();
    }));
  } catch {
    box.innerHTML = '<span class="muted">Failed to load — is the backend running?</span>';
  }
}

async function loadSessions() {
  const list = await getJSON('/dashboard/sessions');
  list.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  sessions = new Map(list.map(s => [s.session_id, s]));
  const sel = document.getElementById('session-select');
  sel.innerHTML = list.map(s =>
    `<option value="${s.session_id}">${s.ended_at ? '' : '● LIVE · '}${esc(s.student_id)} — ${esc(s.exam_name || 'Exam #' + s.exam_id)} (session ${s.session_id})</option>`
  ).join('');
  if (selected == null && list.length) {
    selected = (list.find(s => !s.ended_at) || list[0]).session_id;
  }
  if (selected != null) sel.value = selected;
}

async function loadLog() {
  if (selected == null) return;
  const rows = await getJSON(`/activity/session/${selected}?limit=300`);   // newest first
  const s = sessions.get(selected);
  const live = s && !s.ended_at;
  document.getElementById('empty').style.display = rows.length ? 'none' : 'block';

  document.getElementById('log-body').innerHTML = rows.map((a, i) => {
    // An entry lasts until the next (newer) one starts.
    const start = new Date(a.occurred_at).getTime();
    const end = i === 0
      ? (live ? Date.now() : (s && s.ended_at ? new Date(s.ended_at).getTime() : null))
      : new Date(rows[i - 1].occurred_at).getTime();
    const dur = fmtDuration(end == null ? null : end - start) + (i === 0 && live ? ' (now)' : '');
    return `<tr>
      <td>${fmtTime(a.occurred_at)}</td>
      <td>${dur}</td>
      <td><strong>${esc(a.label)}</strong></td>
    </tr>`;
  }).join('');
  document.getElementById('updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
}

async function refresh() {
  try { await loadSessions(); } catch {}
  await Promise.all([loadLive(), loadLog().catch(() => {})]);
}

document.getElementById('session-select').addEventListener('change', e => {
  selected = Number(e.target.value);
  loadLog();
});

refresh();
setInterval(() => { if (document.getElementById('auto').checked) refresh(); }, 3000);
