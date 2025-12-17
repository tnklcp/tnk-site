// js/api.js
const TNK_API = (() => {
  const base = "/.netlify/functions/data";

  async function authedFetch(url, options = {}) {
    const opts = {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    };

    const user = window.netlifyIdentity?.currentUser?.();
    if (user) {
      const token = await user.jwt(true);
      opts.headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(url, opts);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`TNK_API ${res.status} ${res.statusText} — ${txt}`);
    }
    return res.json();
  }

  function urlFor(key) {
    const u = new URL(base, location.origin);
    u.searchParams.set("key", key);
    return u.toString();
  }

  return {
    // GET anything: array OR object OR null
    async get(key) {
      const data = await authedFetch(urlFor(key), { method: "GET" });
      // server returns both rows/value; prefer value
      return data.value ?? data.rows ?? null;
    },

    // Overwrite anything (object or array)
    async set(key, value) {
      const data = await authedFetch(urlFor(key), {
        method: "PUT",
        body: JSON.stringify({ __mode: "set", value }),
      });
      return data.value ?? data.rows ?? null;
    },

    // Upsert into array collections by id (single object OR array of objects)
    async upsert(key, rows) {
      const data = await authedFetch(urlFor(key), {
        method: "PUT",
        body: JSON.stringify(rows),
      });
      return data.value ?? data.rows ?? null;
    },

    // Append into array collections
    async append(key, rows) {
      const data = await authedFetch(urlFor(key), {
        method: "POST",
        body: JSON.stringify(rows),
      });
      return data.value ?? data.rows ?? null;
    },

    // Delete from array collections
    async del(key, id) {
      return authedFetch(urlFor(key), {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
    },
  };
})();
window.TNK_API = TNK_API;
