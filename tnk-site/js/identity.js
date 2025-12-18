/* =========================================================
   TNK Identity wrapper for Netlify Identity (no localStorage)
   Exposes: TNKIdentity.user(), role(), email(), token(), routeAfterLogin(), logout(), init()
   ========================================================= */
(function (w, d) {
  const WIDGET_SRC = "https://identity.netlify.com/v1/netlify-identity-widget.js";

  function ensureWidgetLoaded(cb) {
    if (w.netlifyIdentity) return cb();
    const s = d.createElement("script");
    s.src = WIDGET_SRC;
    s.onload = cb;
    d.head.appendChild(s);
  }

  function normalizeRole(user) {
    if (!user) return null;
    const roles = Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles : [];
    if (roles.includes("admin")) return "admin";
    if (roles.includes("employee")) return "employee";
    return "customer";
  }

  function setSession(user) {
    try {
      if (!user) {
        sessionStorage.removeItem("tnk_role");
        sessionStorage.removeItem("tnk_user_email");
        return;
      }
      sessionStorage.setItem("tnk_role", normalizeRole(user) || "customer");
      sessionStorage.setItem("tnk_user_email", user.email || "");
    } catch {}
  }

  function redirectOnce(url) {
    try {
      const now = Date.now();
      const last = Number(sessionStorage.getItem("tnk_redirect_lock") || 0);
      if (now - last < 1200) return; // prevent ping-pong
      sessionStorage.setItem("tnk_redirect_lock", String(now));
    } catch {}
    w.location.replace(url);
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
      return normalizeRole(this.user());
    },

    email() {
      return this.user()?.email || null;
    },

    async token() {
      const u = this.user();
      if (!u) return null;
      try { return await u.jwt(true); } catch { return null; }
    },

    routeAfterLogin(user) {
      const role = normalizeRole(user) || "customer";
      setSession(user);
      const dest = this._redirects[role] || this._redirects.customer;
      redirectOnce(dest);
    },

    logout() {
      setSession(null);
      try {
        if (w.netlifyIdentity && w.netlifyIdentity.currentUser()) {
          w.netlifyIdentity.logout();
          return;
        }
      } catch {}
      redirectOnce(this._redirects.home);
    },

    init(opts = {}) {
      this.configure(opts);

      ensureWidgetLoaded(() => {
        const id = w.netlifyIdentity;
        if (!id) return;

        let initCalled = false;

        id.on("init", (user) => {
          setSession(user);
          if (!initCalled) {
            initCalled = true;
            opts.onInit && opts.onInit(user);
          }
        });

        id.on("login", (user) => {
          setSession(user);
          opts.onLogin ? opts.onLogin(user) : this.routeAfterLogin(user);
        });

        id.on("logout", () => {
          setSession(null);
          opts.onLogout ? opts.onLogout() : redirectOnce(this._redirects.home);
        });

        id.init();
      });
    },
  };

  w.TNKIdentity = TNKIdentity;
})(window, document);
