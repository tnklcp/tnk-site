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

  const boot = async () => {
    try {
      updateStatus("Loading secure signup...");
      await window.tnkAuth.init();
      await window.tnkAuth.handleRedirectIfPresent();
      const { client } = await window.tnkAuth.init();
      const isAuthenticated = await client.isAuthenticated();
      if (isAuthenticated) {
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
    updateStatus("Opening Auth0 signup...");
    window.tnkAuth.signup();
  });

  boot();
})();
