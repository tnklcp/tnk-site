/* =========================================================
   TNK Identity wrapper for Netlify Identity
   - NO redirect-on-init (prevents redirect races)
   - Session is stored in sessionStorage only (NO localStorage)
   - Exposes: TNKIdentity.user(), role(), email(), token(), logout(), init()
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

  function roleFromUser(user) {
    if (!user) return null;
    const roles = user.app_metadata?.roles || [];
    if (Array.isArray(roles)) {
      if (roles.includes("admin")) return "admin";
      if (roles.includes("employee")) return "employee";
      if (roles.includes("customer")) return "customer";
    }
    const metaRole = (user.user_metadata?.role || "").toLowerCase();
    if (metaRole === "admin" || metaRole === "employee" || metaRole === "customer") return metaRole;
    return "customer";
  }

  function setSession(user) {
    if (!user) return;
    try {
      sessionStorage.setItem("tnk_user_email", (user.email || "").toLowerCase());
      sessionStorage.setItem("tnk_role", roleFromUser(user) || "customer");
    } catch {}
  }

  function clearSession() {
    try {
      sessionStorage.removeItem("tnk_user_email");
      sessionStorage.removeItem("tnk_role");
    } catch {}
  }

  function routeByRole(role) {
    if (role === "admin") return "admin.html";
    if (role === "employee") return "employee.html";
    return "customer.html";
  }

  const TNKIdentity = {
    _inited: false,

    user() {
      try { return w.netlifyIdentity?.currentUser?.() || null; } catch { return null; }
    },

    role() {
      return sessionStorage.getItem("tnk_role") || roleFromUser(this.user());
    },

    email() {
      return sessionStorage.getItem("tnk_user_email") || this.user()?.email || null;
    },

    async token() {
      const u = this.user();
      if (!u) return null;
      try { return await u.jwt(true); } catch { return null; }
    },

    logout() {
      clearSession();
      try {
        if (w.netlifyIdentity?.currentUser?.()) w.netlifyIdentity.logout();
      } catch {}
      // Do NOT force redirect here; pages decide.
    },

    /**
     * init({
     *   onLogin?: (user)=>void,
     *   onLogout?: ()=>void,
     *   onInit?: (user)=>void,
     * })
     */
    init(opts = {}) {
      if (this._inited) return;
      this._inited = true;

      ensureWidgetLoaded(() => {
        const id = w.netlifyIdentity;
        if (!id) return;

        id.on("init", (user) => {
          if (user) setSession(user);
          try { opts.onInit && opts.onInit(user); } catch {}
        });

        id.on("login", (user) => {
          setSession(user);
          try { opts.onLogin && opts.onLogin(user); } catch {}
        });

        id.on("logout", () => {
          clearSession();
          try { opts.onLogout && opts.onLogout(); } catch {}
        });

        id.init();
      });
    },

    // Helper used by login pages
    routeAfterLogin(user) {
      const role = roleFromUser(user) || "customer";
      const dest = routeByRole(role);
      // lock to prevent rapid repeated redirects
      try {
        const now = Date.now();
        const last = Number(sessionStorage.getItem("tnk_redirect_lock") || 0);
        if (now - last < 1200) return;
        sessionStorage.setItem("tnk_redirect_lock", String(now));
      } catch {}
      location.replace(dest);
    },
  };

  w.TNKIdentity = TNKIdentity;
})(window, document);
