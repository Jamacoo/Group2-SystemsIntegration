// common.js — top navigation bar, "who is logged in", and a redirect to the
// login page whenever an instructor request comes back "not logged in".

(function () {
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (...args) {
    const res = await realFetch(...args);
    const url = String((args[0] && args[0].url) || args[0] || '');
    if (res.status === 401 && url.includes('/api/') && !url.includes('/api/account/')) {
      window.location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search);
    }
    return res;
  };

  const LINKS = [
    ['home', 'index.html', 'Home'],
    ['admin', 'admin.html', 'Admin Panel'],
    ['dashboard', 'dashboard.html', 'Dashboard'],
    ['activity', 'activity.html', 'Live Activity'],
    ['guide', 'guide.html', 'Setup Guide']
  ];
  const SHIELD = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M12 2.5l8 3v6.2c0 4.7-3.3 8.4-8 9.8-4.7-1.4-8-5.1-8-9.8V5.5l8-3z" fill="#177D81"/>' +
    '<path d="M8.3 12.2l2.7 2.7 4.9-5.3" stroke="#F2FBF8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function build() {
    const root = document.getElementById('nav-root');
    if (!root) return;
    const active = root.dataset.active || '';
    const nav = document.createElement('nav');
    nav.className = 'topbar';
    nav.innerHTML =
      `<a class="brand" href="index.html">${SHIELD}<span>TestGuard</span></a>` +
      LINKS.map(([key, href, label]) => `<a class="link ${key === active ? 'active' : ''}" href="${href}">${label}</a>`).join('') +
      '<span class="userchip" id="userchip"></span>';
    root.replaceWith(nav);

    const chip = document.getElementById('userchip');
    try {
      const res = await realFetch('/api/account/me');
      if (!res.ok) throw new Error('not logged in');
      const me = await res.json();
      chip.innerHTML =
        `<span class="avatar">${esc((me.name || '?').trim().charAt(0).toUpperCase())}</span>` +
        `<span class="who" title="${esc(me.email)}">${esc(me.name)}</span>` +
        '<button class="ghost small" id="logout-btn">Log out</button>';
      document.getElementById('logout-btn').addEventListener('click', async () => {
        await realFetch('/api/account/logout', { method: 'POST' });
        window.location.href = '/login.html';
      });
    } catch (err) {
      chip.innerHTML = '<a class="btn small" href="login.html">Log in</a>';
    }
  }

  build();
})();
