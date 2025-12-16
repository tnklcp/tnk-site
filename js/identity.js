/* =========================================================
   TNK Identity wrapper for Netlify Identity
   - Loads widget if missing
   - Normalizes roles
   - Handles login/logout redirects
   - Exposes: TNKIdentity.user(), role(), email(), token()
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

  function emailLists() {
    try {
      return {
        admins: (JSON.parse(localStorage.getItem("tnk_admin_emails")) || []).map(x=>String(x).toLowerCase()),
        employees: (JSON.parse(localStorage.getItem("tnk_employee_emails")) || []).map(x=>String(x).toLowerCase()),
      };
    } catch { return { admins: [], employees: [] }; }
  }

  function normalizeRole(user) {
    if (!user) return null;
    const meta = user.app_metadata || {};
    const roles = Array.isArray(meta.roles) ? meta.roles : [];
    if (roles.includes("admin")) return "admin";
    if (roles.includes("employee")) return "employee";
    // Fallback by email lists (handy while you’re testing)
    const em = (user.email || "").toLowerCase();
    const lists = emailLists();
    if (lists.admins.includes(em)) return "admin";
    if (lists.employees.includes(em)) return "employee";
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
      try { return (await u.jwt()); } catch { return null; }
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

    _onLogin(user) {
      const role = normalizeRole(user) || "customer";
      // Persist for your existing guards
      try {
        sessionStorage.setItem("tnk_role", role);
        sessionStorage.setItem("tnk_user_email", user.email || "");
      } catch {}
      // Route by role
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

        // If already logged in, make sure session values are set
        const u = id.currentUser();
        if (u) {
          try {
            sessionStorage.setItem("tnk_role", normalizeRole(u) || "customer");
            sessionStorage.setItem("tnk_user_email", u.email || "");
          } catch {}
        }

        id.on("login", (user) => this._onLogin(user));
        id.on("logout", () => this._onLogout());

        // Optional: open widget if you’re on a login page without a session
        // (Keep closed by default to avoid pop-ups)
      });
    },
  };

  w.TNKIdentity = TNKIdentity;

})(window, document);

