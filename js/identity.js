/* =========================================================
   TNK Identity wrapper for Netlify Identity (Session-only)
   - No localStorage
   - Roles ONLY from Netlify Identity app_metadata.roles
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
    const roles = user?.app_metadata?.roles || [];
    if (roles.includes("admin")) return "admin";
    if (roles.includes("employee")) return "employee";
    return "customer";
  }

  const TNKIdentity = {
    _redirects: {
      admin: "admin.html",
      employee: "employee.html",
      customer: "customer.html",
      home: "index.html",
    },

    configure(opts = {}) {
      this._redirects = { ...this._redirects, ...(opts.redirects || {}) };
    },

    user() {
      try {
        return w.netlifyIdentity?.currentUser?.() || null;
      } catch {
        return null;
      }
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
      try {
        return await u.jwt();
      } catch {
        return null;
      }
    },

    logout() {
      try {
        sessionStorage.removeItem("tnk_role");
        sessionStorage.removeItem("tnk_user_email");
      } catch {}
      if (w.netlifyIdentity?.currentUser?.()) {
        w.netlifyIdentity.logout();
      } else {
        location.replace(this._redirects.home);
      }
    },

    init(opts = {}) {
      this.configure(opts);
      ensureWidgetLoaded(() => {
        const id = w.netlifyIdentity;
        if (!id) return;

        // On load: populate session if logged in
        const u = id.currentUser?.();
        if (u) {
          try {
            sessionStorage.setItem("tnk_role", normalizeRole(u) || "customer");
            sessionStorage.setItem("tnk_user_email", (u.email || "").toLowerCase());
          } catch {}
        }

        id.on("login", (user) => {
          const role = normalizeRole(user) || "customer";
          try {
            sessionStorage.setItem("tnk_role", role);
            sessionStorage.setItem("tnk_user_email", (user.email || "").toLowerCase());
          } catch {}
          location.replace(this._redirects[role] || this._redirects.customer);
        });

        id.on("logout", () => {
          try {
            sessionStorage.removeItem("tnk_role");
            sessionStorage.removeItem("tnk_user_email");
          } catch {}
          location.replace(this._redirects.home);
        });

        // Note: do not auto-open widget (avoids popups)
      });
    },
  };

  w.TNKIdentity = TNKIdentity;
})(window, document);
