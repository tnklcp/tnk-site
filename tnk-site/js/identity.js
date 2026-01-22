/* =========================================================
   TNK Identity wrapper for Netlify Identity (NO localStorage)
   - Single owner of routing to prevent redirect race
   - Exposes: TNKIdentity.init(), user(), role(), email(), token(), logout(), routeAfterLogin()
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
    const appRoles = Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles : [];
    const appRole = typeof user?.app_metadata?.role === "string" ? [user.app_metadata.role] : [];
    const metaRoles = Array.isArray(user?.user_metadata?.roles) ? user.user_metadata.roles : [];
    const metaRole = typeof user?.user_metadata?.role === "string" ? [user.user_metadata.role] : [];
    const roles = [...appRoles, ...appRole, ...metaRoles, ...metaRole]
      .map((r) => String(r || "").toLowerCase())
      .filter(Boolean);
    if (roles.includes("admin")) return "admin";
    if (roles.includes("employee")) return "employee";
    return "customer";
  }

  const TNKIdentity = {
    _redirects: { admin: "admin.html", employee: "employee.html", customer: "customer.html", home: "index.html" },
    _routingLock: false,

    configure(opts = {}) {
      this._redirects = { ...this._redirects, ...(opts.redirects || {}) };
    },

    user() {
      try { return w.netlifyIdentity?.currentUser?.() || null; } catch { return null; }
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

    logout() {
      try {
        sessionStorage.removeItem("tnk_role");
        sessionStorage.removeItem("tnk_user_email");
      } catch {}
      try {
        if (w.netlifyIdentity?.currentUser?.()) w.netlifyIdentity.logout();
        else location.replace(this._redirects.home);
      } catch {
        location.replace(this._redirects.home);
      }
    },

    // The ONE official redirect function (prevents page-level race)
    routeAfterLogin(user) {
      if (this._routingLock) return;
      this._routingLock = true;

      const role = normalizeRole(user) || "customer";

      try {
        sessionStorage.setItem("tnk_role", role);
        sessionStorage.setItem("tnk_user_email", user?.email || "");
      } catch {}

      const dest = this._redirects[role] || this._redirects.customer;
      location.replace(dest);
    },

    _applyGuard(guard, user) {
      // guard values:
      // "admin", "employee-or-admin", "customer"
      if (!guard) return;

      if (!user) {
        if (guard === "customer") return location.replace("login-customer.html");
        return location.replace("login.html");
      }

      const role = normalizeRole(user);

      if (guard === "admin") {
        if (role !== "admin") return location.replace(role === "employee" ? "employee.html" : "login.html");
      }

      if (guard === "employee-or-admin") {
        if (role !== "employee" && role !== "admin") return location.replace("login.html");
      }

      if (guard === "customer") {
        if (role !== "customer") return location.replace(role === "admin" ? "admin.html" : "employee.html");
      }
    },

    async init(opts = {}) {
      this.configure(opts);

      await ensureWidgetLoaded();
      const id = w.netlifyIdentity;
      if (!id) return;

      const guard = opts.guard || d.body.getAttribute("data-role-guard") || null;

      // Ensure init runs only once per page load
      if (id.__tnk_bound) {
        const u = id.currentUser();
        if (u) {
          try {
            sessionStorage.setItem("tnk_role", normalizeRole(u) || "customer");
            sessionStorage.setItem("tnk_user_email", u.email || "");
          } catch {}
        }
        this._applyGuard(guard, u);
        if (opts.onInit) opts.onInit(u);
        return;
      }
      id.__tnk_bound = true;

      id.on("init", (user) => {
        if (user) {
          try {
            sessionStorage.setItem("tnk_role", normalizeRole(user) || "customer");
            sessionStorage.setItem("tnk_user_email", user.email || "");
          } catch {}
        }
        this._applyGuard(guard, user);
        if (opts.onInit) opts.onInit(user);
      });

      id.on("login", (user) => {
        // do NOT auto-route unless caller wants it
        try {
          sessionStorage.setItem("tnk_role", normalizeRole(user) || "customer");
          sessionStorage.setItem("tnk_user_email", user.email || "");
        } catch {}
        if (opts.onLogin) opts.onLogin(user);
      });

      id.on("logout", () => {
        try {
          sessionStorage.removeItem("tnk_role");
          sessionStorage.removeItem("tnk_user_email");
        } catch {}
        if (opts.onLogout) opts.onLogout();
      });

      id.init();
    }
  };

  w.TNKIdentity = TNKIdentity;
})(window, document);
