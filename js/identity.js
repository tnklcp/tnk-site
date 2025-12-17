/* =========================================================
   TNK Identity — single authority (NO redirect races)
   ========================================================= */
(function (w, d) {
  const SRC = "https://identity.netlify.com/v1/netlify-identity-widget.js";

  function load(cb) {
    if (w.netlifyIdentity) return cb();
    const s = d.createElement("script");
    s.src = SRC;
    s.onload = cb;
    d.head.appendChild(s);
  }

  function roleFromUser(user) {
    if (!user) return null;
    const roles = user.app_metadata?.roles || [];
    if (roles.includes("admin")) return "admin";
    if (roles.includes("employee")) return "employee";
    return "customer";
  }

  function setSession(user) {
    if (!user) return;
    sessionStorage.setItem("tnk_user_email", user.email || "");
    sessionStorage.setItem("tnk_role", roleFromUser(user));
  }

  function clearSession() {
    sessionStorage.removeItem("tnk_user_email");
    sessionStorage.removeItem("tnk_role");
  }

  function route(role) {
    if (role === "admin") location.replace("/admin.html");
    else if (role === "employee") location.replace("/employee.html");
    else if (role === "customer") location.replace("/customer.html");
    else location.replace("/login.html");
  }

  w.TNKIdentity = {
    init() {
      load(() => {
        const id = w.netlifyIdentity;
        if (!id) return;

        id.on("init", (user) => {
          if (!user) return;
          setSession(user);
          route(roleFromUser(user));
        });

        id.on("login", (user) => {
          setSession(user);
          route(roleFromUser(user));
        });

        id.on("logout", () => {
          clearSession();
          location.replace("/login.html");
        });

        id.init();
      });
    },

    logout() {
      clearSession();
      try { w.netlifyIdentity.logout(); } catch {}
    },

    role() {
      return sessionStorage.getItem("tnk_role");
    },

    email() {
      return sessionStorage.getItem("tnk_user_email");
    }
  };
})(window, document);
