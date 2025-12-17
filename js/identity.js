/* =========================================================
   TNK Identity wrapper for Netlify Identity
   - No localStorage
   - Normalizes roles from app_metadata.roles OR user_metadata.role
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

    const roles = Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles : [];
    if (roles.includes("admin")) return "admin";
    if (roles.includes("employee")) return "employee";
    if (roles.includes("customer")) return "customer";

    const metaRole = String(user?.user_metadata?.role || "").toLowerCase();
    if (metaRole === "admin" || metaRole === "employee" || metaRole === "customer") return metaRole;

    return "customer";
  }

  const TNKIdentity = {
    _redirects: {
      admin: "admin.html",
      employee: "employee.html",
      customer: "customer.html",
      home: "index.html",
      loginEmployee: "login.html",
      loginCustomer: "login-customer.html",
    },

    configure(opts = {}) {
      this._redirects = { ...this._redirects, ...(opts.redirects || {}) };
    },

    user() {
      try {
        return w.netlifyIdentity?.currentUser() || null;
      } catch {
        return null;
      }
    },

    role() {
      const u = this.user();
      return normalizeRole(u);
    },

    email() {
      return this.user()?.email || null;
    },

    async token() {
      const u = this.user();
      if (!u) return null;
      return u.jwt(true);
    },

    logout() {
      try {
        sessionStorage.removeItem("tnk_role");
        sessionStorage.removeItem("tnk_user_email");
      } catch {}
      if (w.netlifyIdentity && w.netlifyIdentity.currentUser()) w.netlifyIdentity.logout();
      else location.replace(this._redirects.home);
    },

    _syncSession(user) {
      const role = normalizeRole(user);
      try {
        if (role) sessionStorage.setItem("tnk_role", role);
        else sessionStorage.removeItem("tnk_role");
        if (user?.email) sessionStorage.setItem("tnk_user_email", String(user.email).toLowerCase());
        else sessionStorage.removeItem("tnk_user_email");
      } catch {}
      return role;
    },

    init(opts = {}) {
      this.configure(opts);
      ensureWidgetLoaded(() => {
        const id = w.netlifyIdentity;
        if (!id) return;

        const u = id.currentUser();
        if (u) this._syncSession(u);

        id.on("login", (user) => {
          this._syncSession(user);
        });

        id.on("logout", () => {
          try {
            sessionStorage.removeItem("tnk_role");
            sessionStorage.removeItem("tnk_user_email");
          } catch {}
          location.replace(this._redirects.home);
        });

        id.init();
      });
    },
  };

  w.TNKIdentity = TNKIdentity;
})(window, document);
