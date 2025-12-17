/* =========================================================
   TNK Identity wrapper for Netlify Identity (RACE-SAFE)
   - Loads widget if missing
   - Normalizes roles (NO localStorage)
   - Persists role/email to sessionStorage
   - Exposes: TNKIdentity.user(), role(), email(), token(), logout(), init(), ready()
   ========================================================= */
(function (w, d) {
  const WIDGET_SRC = "https://identity.netlify.com/v1/netlify-identity-widget.js";

  function ensureWidgetLoaded() {
    return new Promise((resolve) => {
      if (w.netlifyIdentity) return resolve();
      const s = d.createElement("script");
      s.src = WIDGET_SRC;
      s.onload = () => resolve();
      d.head.appendChild(s);
    });
  }

  function normalizeRole(user) {
    if (!user) return null;

    const roles = Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles : [];
    if (roles.includes("admin")) return "admin";
    if (roles.includes("employee")) return "employee";
    if (roles.includes("customer")) return "customer";

    const metaRole = String(user?.user_metadata?.role || "").toLowerCase().trim();
    if (metaRole === "admin" || metaRole === "employee" || metaRole === "customer") return metaRole;

    return "customer";
  }

  let _readyPromise = null;
  let _readyResolve = null;

  function makeReadyPromise() {
    if (_readyPromise) return _readyPromise;
    _readyPromise = new Promise((res) => { _readyResolve = res; });
    return _readyPromise;
  }

  const TNKIdentity = {
    _redirects: { admin: "admin.html", employee: "employee.html", customer: "customer.html", home: "index.html" },

    configure(opts = {}) {
      this._redirects = { ...this._redirects, ...(opts.redirects || {}) };
    },

    user() {
      try { return w.netlifyIdentity?.currentUser() || null; } catch { return null; }
    },

    role() {
      const u = this.user();
      return u ? normalizeRole(u) : null;
    },

    email() {
      return this.user()?.email || null;
    },

    async token() {
      const u = this.user();
      if (!u) return null;
      try { return await u.jwt(true); } catch { return null; }
    },

    _persistSession(user) {
      const role = normalizeRole(user) || "customer";
      try {
        sessionStorage.setItem("tnk_role", role);
        sessionStorage.setItem("tnk_user_email", (user?.email || "").toLowerCase());
      } catch {}
      return role;
    },

    logout() {
      try {
        sessionStorage.removeItem("tnk_role");
        sessionStorage.removeItem("tnk_user_email");
      } catch {}
      try {
        if (w.netlifyIdentity && w.netlifyIdentity.currentUser()) w.netlifyIdentity.logout();
        else location.replace(this._redirects.home);
      } catch {
        location.replace(this._redirects.home);
      }
    },

    /**
     * init({ redirects, redirectOnLogin, redirectOnLogout })
     * Defaults: NO auto-redirect (prevents portal bounce/race)
     */
    async init(opts = {}) {
      this.configure(opts);
      makeReadyPromise();

      await ensureWidgetLoaded();
      const id = w.netlifyIdentity;
      if (!id) {
        _readyResolve?.(null);
        return null;
      }

      // Ensure we only bind once
      if (!id.__tnkBound) {
        id.__tnkBound = true;

        id.on("init", (user) => {
          if (user) this._persistSession(user);
          _readyResolve?.(user || null);
        });

        id.on("login", (user) => {
          if (user) this._persistSession(user);

          // Only redirect if explicitly enabled (use on login page, not portals)
          if (opts.redirectOnLogin) {
            const role = normalizeRole(user) || "customer";
            const dest = this._redirects[role] || this._redirects.customer;
            location.replace(dest);
          }
        });

        id.on("logout", () => {
          try {
            sessionStorage.removeItem("tnk_role");
            sessionStorage.removeItem("tnk_user_email");
          } catch {}

          if (opts.redirectOnLogout) {
            location.replace(this._redirects.home);
          }
        });

        id.init();
      } else {
        // Already bound; resolve immediately from current user
        const u = id.currentUser();
        if (u) this._persistSession(u);
        _readyResolve?.(u || null);
      }

      return this.user();
    },

    /** Await Identity init completion */
    async ready() {
      makeReadyPromise();
      // If init wasn't called yet, call it with safe defaults.
      if (!w.netlifyIdentity) await this.init();
      return _readyPromise;
    },
  };

  w.TNKIdentity = TNKIdentity;
})(window, document);
