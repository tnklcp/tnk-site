// js/api.js
const TNK_API = (() => {
  const base = '/.netlify/functions/data';

  async function authedFetch(url, options = {}) {
    const opts = { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } };
    try {
      const user = window.netlifyIdentity?.currentUser?.();
      if (user) {
        const token = await user.jwt();
        opts.headers.Authorization = `Bearer ${token}`;
      }
    } catch {}
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  }

  return {
    async get(key) {
      const u = new URL(base, location.origin);
      u.searchParams.set('key', key);
      const data = await authedFetch(u.toString(), { method: 'GET' });
      return data.rows || [];
    },
    async post(key, rows) {
      const u = new URL(base, location.origin);
      u.searchParams.set('key', key);
      const data = await authedFetch(u.toString(), { method: 'POST', body: JSON.stringify(rows) });
      return data.rows || [];
    },
    async put(key, rows) {
      const u = new URL(base, location.origin);
      u.searchParams.set('key', key);
      const data = await authedFetch(u.toString(), { method: 'PUT', body: JSON.stringify(rows) });
      return data.rows || [];
    },
    async del(key, id) {
      const u = new URL(base, location.origin);
      u.searchParams.set('key', key);
      return authedFetch(u.toString(), { method: 'DELETE', body: JSON.stringify({ id }) });
    },
  };
})();
window.TNK_API = TNK_API;
