/* =========================================================
   TNK Identity wrapper for Netlify Identity
   - Session-only state
   - Roles ONLY from Netlify Identity
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

    user() {
      try { return w.netlifyIdentity?.currentUser() || null; } catch { return null; }
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
      try { return await u.jwt(); } catch { return null; }
    },

    logout() {
      sessionStorage.clear();
      if (w.netlifyIdentity?.currentUser()) {
        w.netlifyIdentity.logout();
      } else {
        location.replace(this._redirects.home);
      }
    },

    init() {
      ensureWidgetLoaded(() => {
        const id = w.netlifyIdentity;
        if (!id) return;

        const u = id.currentUser();
        if (u) {
          sessionStorage.setItem("tnk_role", normalizeRole(u));
          sessionStorage.setItem("tnk_user_email", u.email || "");
        }

        id.on("login", (user) => {
          const role = normalizeRole(user);
          sessionStorage.setItem("tnk_role", role);
          sessionStorage.setItem("tnk_user_email", user.email || "");
          location.replace(this._redirects[role] || this._redirects.customer);
        });

        id.on("logout", () => {
          sessionStorage.clear();
          location.replace(this._redirects.home);
        });
      });
    },
  };

  w.TNKIdentity = TNKIdentity;
})(window, document);
