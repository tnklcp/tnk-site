/* =========================================================
   TNK Identity wrapper for Netlify Identity
   - Loads widget if missing
   - Normalizes roles
   - Handles login/logout redirects
   - Exposes:
     TNKIdentity.init()
     TNKIdentity.user()
     TNKIdentity.role()
     TNKIdentity.email()
     TNKIdentity.token()
     TNKIdentity.logout()
     TNKIdentity.routeAfterLogin(user)   <-- ADDED (fixes your error)
   ========================================================= */
(function (w, d) {
  const WIDGET_SRC = "https://identity.netlify.com/v1/netlify-identity-widget.js";
  const REDIRECT_LOCK_KEY = "tnk_redirect_lock";

  function ensureWidgetLoaded(cb) {
    if (w.netlifyIdentity) return cb();
    const s = d.createElement("script");
    s.src = WIDGET_SRC;
    s.onload = cb;
    d.head.appendChild(s);
  }

  function redirectOnce(url) {
    const now = Date.now();
    const last = Number(sessionStorage.getItem(REDIRECT_LOCK_KEY) || 0);
    if (now - last < 1500) return;
    sessionStorage.setItem(REDIRECT_LOCK_KEY, String(now));
    w.location.replace(url);
  }

  // Optional testing helpers (kept, but safe)
  function emailLists() {
    try {
      return {
        admins: (JSON.parse(localStorage.getItem("tnk_admin_emails")) || []).map(x => String(x).toLowerCase()),
        employees: (JSON.parse(localStorage.getItem("tnk_employee_emails")) || []).map(x => String(x).toLowerCase()),
      };
    } catch {
      return { admins: [], employees: [] };
    }
  }

  function normalizeRole(user) {
    if (!user) return null;

    // Prefer app_metadata.roles
    const roles = Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles : [];
    if (roles.includes("admin")) return "admin";
    if (roles.includes("employee")) return "employee";
    if (roles.includes("customer")) return "customer";

    // Fallback: user_metadata.role
    const metaRole = (user?.user_metadata?.role || "").toLowerCase();
    if (metaRole === "admin" || metaRole === "employee" || metaRole === "customer") return metaRole;

    // LAST fallback: email allowlists (useful while testing)
    const em = String(user.email || "").toLowerCase();
    const lists = emailLists();
    if (lists.admins.includes(em)) return "admin";
    if (lists.employees.includes(em)) return "employee";

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

    // ===== ADDED: public routing function =====
    routeAfterLogin(user) {
      const role = normalizeRole(user) || "customer";
      try {
        sessionStorage.setItem("tnk_role", role);
        sessionStorage.setItem("tnk_user_email", user?.email || "");
      } catch {}

      const dest = this._redirects[role] || this._redirects.customer;
      redirectOnce(dest);
    },

    logout() {
      try {
        sessionStorage.removeItem("tnk_role");
        sessionStorage.removeItem("tnk_user_email");
      } catch {}

      if (w.netlifyIdentity && w.netlifyIdentity.currentUser()) {
        w.netlifyIdentity.logout();
      } else {
        redirectOnce(this._redirects.home);
      }
    },

    init(opts = {}) {
      this.configure(opts);

      ensureWidgetLoaded(() => {
        const id = w.netlifyIdentity;
        if (!id) return;

        // If already logged in, ensure sessionStorage is set
        const u = id.currentUser();
        if (u) {
          try {
            sessionStorage.setItem("tnk_role", normalizeRole(u) || "customer");
            sessionStorage.setItem("tnk_user_email", u.email || "");
          } catch {}
        }

        // Allow pages to hook init/login/logout if they want
        id.on("init", (user) => {
          try { opts.onInit && opts.onInit(user); } catch {}
        });

        id.on("login", (user) => {
          try { opts.onLogin && opts.onLogin(user); } catch {}
          // Default behavior: route after login
          this.routeAfterLogin(user);
        });

        id.on("logout", () => {
          try {
            sessionStorage.removeItem("tnk_role");
            sessionStorage.removeItem("tnk_user_email");
          } catch {}
          try { opts.onLogout && opts.onLogout(); } catch {}
          // Default behavior: go home
          redirectOnce(this._redirects.home);
        });

        id.on("error", (e) => {
          try { opts.onError && opts.onError(e); } catch {}
        });

        id.init();
      });
    },
  };

  w.TNKIdentity = TNKIdentity;
})(window, document);

