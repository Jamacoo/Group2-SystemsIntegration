// admin.js — manages exams: list, add, inline edit, delete, and
// generates shareable student portal links.

const API_BASE = 'http://localhost:3000/api';

function portalLink(examId) {
  return `${window.location.origin}/exam.html?examId=${examId}`;
}

function showStatus(message, isError) {
  const el = document.getElementById('status-msg');
  el.textContent = message;
  el.className = isError ? 'error' : 'success';
  setTimeout(() => { el.textContent = ''; el.className = ''; }, 3000);
}

async function fetchExams() {
  const res = await fetch(`${API_BASE}/exams`);
  if (!res.ok) throw new Error('Failed to load exams');
  return res.json();
}

function renderRow(exam) {
  const tr = document.createElement('tr');
  tr.dataset.examId = exam.id;

  const link = portalLink(exam.id);

  tr.innerHTML = `
    <td class="name-cell">${exam.exam_name}</td>
    <td>
      <div class="link-cell">
        <code>${link}</code>
        <button class="copy-btn">Copy Link</button>
      </div>
    </td>
    <td>
      <div class="actions">
        <button class="edit-btn">Edit</button>
        <button class="delete-btn">Delete</button>
      </div>
    </td>
  `;

  tr.querySelector('.copy-btn').addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(link);
      const btn = e.target;
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = original; }, 1500);
    } catch (err) {
      showStatus('Could not copy — copy the link manually.', true);
    }
  });

  tr.querySelector('.edit-btn').addEventListener('click', () => enterEditMode(tr, exam));
  tr.querySelector('.delete-btn').addEventListener('click', () => deleteExam(exam.id, exam.exam_name));

  return tr;
}

function enterEditMode(tr, exam) {
  tr.innerHTML = `
    <td><input type="text" class="edit-name" value="${exam.exam_name}"></td>
    <td><input type="text" class="edit-url" value="${exam.form_url}" style="width:100%;"></td>
    <td>
      <div class="actions">
        <button class="save-btn">Save</button>
        <button class="cancel-btn">Cancel</button>
      </div>
    </td>
  `;

  tr.querySelector('.save-btn').addEventListener('click', async () => {
    const examName = tr.querySelector('.edit-name').value.trim();
    const formUrl = tr.querySelector('.edit-url').value.trim();
    if (!examName || !formUrl) {
      showStatus('Exam name and form URL are both required.', true);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/exams/${exam.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examName, formUrl })
      });
      if (!res.ok) throw new Error('Update failed');
      showStatus('Exam updated.', false);
      loadExams();
    } catch (err) {
      showStatus('Failed to update exam.', true);
    }
  });

  tr.querySelector('.cancel-btn').addEventListener('click', loadExams);
}

async function deleteExam(examId, examName) {
  if (!confirm(`Delete "${examName}"? This cannot be undone.`)) return;
  try {
    const res = await fetch(`${API_BASE}/exams/${examId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      showStatus(data.error || 'Failed to delete exam.', true);
      return;
    }
    showStatus('Exam deleted.', false);
    loadExams();
  } catch (err) {
    showStatus('Failed to delete exam.', true);
  }
}

async function addExam() {
  const nameInput = document.getElementById('new-exam-name');
  const urlInput = document.getElementById('new-exam-url');
  const examName = nameInput.value.trim();
  const formUrl = urlInput.value.trim();

  if (!examName || !formUrl) {
    showStatus('Please fill in both the exam name and the form URL.', true);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/exams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ examName, formUrl })
    });
    if (!res.ok) throw new Error('Create failed');
    nameInput.value = '';
    urlInput.value = '';
    showStatus('Exam added.', false);
    loadExams();
  } catch (err) {
    showStatus('Failed to add exam. Is the backend server running?', true);
  }
}

async function loadExams() {
  const tbody = document.getElementById('exams-body');
  const emptyMsg = document.getElementById('empty-msg');
  try {
    const exams = await fetchExams();
    tbody.innerHTML = '';
    if (exams.length === 0) {
      emptyMsg.style.display = 'block';
      return;
    }
    emptyMsg.style.display = 'none';
    exams.forEach(exam => tbody.appendChild(renderRow(exam)));
  } catch (err) {
    showStatus('Could not load exams. Is the backend server running?', true);
  }
}

document.getElementById('add-btn').addEventListener('click', addExam);

loadExams();
