/* =========================================================
   TNK Identity wrapper for Netlify Identity
   - Loads widget if missing
   - Normalizes roles (NO localStorage)
   - Handles login/logout redirects
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

  function normalizeRole(user) {
    if (!user) return null;

    // Preferred: app_metadata.roles (array)
    const roles = Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles : [];
    if (roles.includes("admin")) return "admin";
    if (roles.includes("employee")) return "employee";
    if (roles.includes("customer")) return "customer";

    // Fallback: user_metadata.role (string)
    const metaRole = String(user?.user_metadata?.role || "").toLowerCase().trim();
    if (metaRole === "admin" || metaRole === "employee" || metaRole === "customer") return metaRole;

    // Default
    return "customer";
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
      if (!u) return null;
      return normalizeRole(u);
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
      if (w.netlifyIdentity && w.netlifyIdentity.currentUser()) {
        w.netlifyIdentity.logout();
      } else {
        location.replace(this._redirects.home);
      }
    },

    _persistSession(user) {
      const role = normalizeRole(user) || "customer";
      try {
        sessionStorage.setItem("tnk_role", role);
        sessionStorage.setItem("tnk_user_email", (user?.email || "").toLowerCase());
      } catch {}
      return role;
    },

    _onLogin(user) {
      const role = this._persistSession(user);
      const dest = this._redirects[role] || this._redirects.customer;
      location.replace(dest);
    },

    _onLogout() {
      try {
        sessionStorage.removeItem("tnk_role");
        sessionStorage.removeItem("tnk_user_email");
      } catch {}
      location.replace(this._redirects.home);
    },

    init(opts = {}) {
      this.configure(opts);
      ensureWidgetLoaded(() => {
        const id = w.netlifyIdentity;
        if (!id) return;

        const u = id.currentUser();
        if (u) this._persistSession(u);

        id.on("login", (user) => this._onLogin(user));
        id.on("logout", () => this._onLogout());

        id.init();
      });
    },
  };

  w.TNKIdentity = TNKIdentity;
})(window, document);
