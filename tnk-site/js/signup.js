(() => {
  const status = document.getElementById("signup-status");
  const button = document.getElementById("signup-button");

  if (!button) return;

  const updateStatus = (message) => window.tnkAuth?.setStatus(status, message);

  const redirectByRole = (roles = []) => {
    const config = window.tnkAuth.getConfig?.() || {};
    const adminRole = config.adminRole || "admin";
    const employeeRole = config.employeeRole || "employee";
    if (roles.includes(adminRole)) {
      window.location.href = "admin.html";
      return;
    }
    if (roles.includes(employeeRole)) {
      window.location.href = "employee.html";
      return;
    }
    window.location.href = "employee.html";
  };

  const attachIdentityHandlers = async () => {
    const identity = await window.tnkAuth.getIdentity();
    const handleAccess = async () => {
      updateStatus("Account ready. Redirecting...");
      const profile = await window.tnkAuth.getUserProfile();
      if (typeof identity.close === "function") {
        identity.close();
      }
      redirectByRole(profile.roles);
    };
    identity.on("signup", handleAccess);
    identity.on("login", handleAccess);
  };

  const boot = async () => {
    try {
      updateStatus("Loading secure signup...");
      await window.tnkAuth.init();
      await attachIdentityHandlers();
      const user = await window.tnkAuth.getCurrentUser();
      if (user) {
        const profile = await window.tnkAuth.getUserProfile();
        redirectByRole(profile.roles);
        return;
      }
      updateStatus("Ready to create your account.");
    } catch (error) {
      updateStatus("Unable to load signup. Please try again.");
    }
  };

  button.addEventListener("click", (event) => {
    event.preventDefault();
    updateStatus("Opening account setup...");
    window.tnkAuth.signup();
  });

  boot();
})();
