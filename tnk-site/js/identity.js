/* =========================================================
   TNK Identity wrapper for Netlify Identity
   - Loads widget if missing
   - Normalizes roles from Identity metadata
   - Handles login/logout routing (optional)
   - NO localStorage
   - FAILS LOUDLY (throws) if Identity is missing when required
   - Exposes: TNKIdentity.user(), role(), email(), token(), init()
   ========================================================= */
(function (w, d) {
  const WIDGET_SRC = "https://identity.netlify.com/v1/netlify-identity-widget.js";

  function ensureWidgetLoaded() {
    return new Promise((resolve, reject) => {
      if (w.netlifyIdentity) return resolve();
      const s = d.createElement("script");
      s.src = WIDGET_SRC;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load Netlify Identity widget"));
      d.head.appendChild(s);
    });
  }

  function normalizeRole(user) {
    if (!user) return null;

    // Prefer app_metadata.roles (array), then user_metadata.role (string)
    const roles = Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles : [];
    if (roles.includes("admin")) return "admin";
    if (roles.includes("employee")) return "employee";
    if (roles.includes("customer")) return "customer";

    const metaRole = String(user?.user_metadata?.role || "").toLowerCase().trim();
    if (metaRole === "admin" || metaRole === "employee" || metaRole === "customer") return metaRole;

    // Default (but still explicit)
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

    // prevents redirect ping-pong across rapid events
    _redirectLockMs: 1200,
    _lastRedirectAt: 0,
    _safeReplace(url) {
      const now = Date.now();
      if (now - this._lastRedirectAt < this._redirectLockMs) return;
      this._lastRedirectAt = now;
      location.replace(url);
    },

    configure(opts = {}) {
      if (opts.redirects) this._redirects = { ...this._redirects, ...opts.redirects };
    },

    user() {
      try {
        return w.netlifyIdentity?.currentUser?.() || null;
      } catch {
        return null;
      }
    },

    role() {
      const u = this.user();
      return u ? normalizeRole(u) : null;
    },

    email() {
      return this.user()?.email || null;
    },

    async token(forceFresh = false) {
      const u = this.user();
      if (!u) return null;
      try {
        // Netlify Identity supports jwt(forceRefresh?)
        return await u.jwt(!!forceFresh);
      } catch {
        return null;
      }
    },

    logout() {
      try {
        sessionStorage.removeItem("tnk_role");
        sessionStorage.removeItem("tnk_user_email");
      } catch {}
      if (w.netlifyIdentity && w.netlifyIdentity.currentUser()) {
        w.netlifyIdentity.logout();
      } else {
        this._safeReplace(this._redirects.home);
      }
    },

    _persistSession(user) {
      const role = normalizeRole(user) || "customer";
      try {
        sessionStorage.setItem("tnk_role", role);
        sessionStorage.setItem("tnk_user_email", user?.email || "");
      } catch (e) {
        // fail loudly
        throw new Error("SessionStorage unavailable: cannot persist identity session.");
      }
      return role;
    },

    /**
     * init({
     *   redirects?: { ... },
     *   autoRoute?: boolean (default true),
     *   onInit?: (user)=>void,
     *   onLogin?: (user)=>void,
     *   onLogout?: ()=>void,
     * })
     */
    async init(opts = {}) {
      this.configure(opts);

      await ensureWidgetLoaded();

      const id = w.netlifyIdentity;
      if (!id) throw new Error("Netlify Identity is not available after loading the widget.");

      const autoRoute = opts.autoRoute !== false;

      // INIT
      id.on("init", (user) => {
        if (user) this._persistSession(user);
        if (typeof opts.onInit === "function") opts.onInit(user);

        if (autoRoute && user) {
          const role = normalizeRole(user);
          const dest = this._redirects[role] || this._redirects.customer;
          this._safeReplace(dest);
        }
      });

      // LOGIN
      id.on("login", (user) => {
        this._persistSession(user);
        if (typeof opts.onLogin === "function") opts.onLogin(user);

        if (autoRoute) {
          const role = normalizeRole(user);
          const dest = this._redirects[role] || this._redirects.customer;
          this._safeReplace(dest);
        }
      });

      // LOGOUT
      id.on("logout", () => {
        try {
          sessionStorage.removeItem("tnk_role");
          sessionStorage.removeItem("tnk_user_email");
        } catch {}
        if (typeof opts.onLogout === "function") opts.onLogout();
        if (autoRoute) this._safeReplace(this._redirects.home);
      });

      id.init();
    },
  };

  w.TNKIdentity = TNKIdentity;
})(window, document);
