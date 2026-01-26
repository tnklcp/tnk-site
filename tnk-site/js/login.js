(() => {
  const status = document.getElementById("login-status");
  const button = document.getElementById("login-button");

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
      updateStatus("Loading secure login...");
      await window.tnkAuth.init();
      await window.tnkAuth.handleRedirectIfPresent();
      const { client } = await window.tnkAuth.init();
      const isAuthenticated = await client.isAuthenticated();
      if (isAuthenticated) {
        const profile = await window.tnkAuth.getUserProfile();
        redirectByRole(profile.roles);
        return;
      }
      updateStatus("Ready to sign in.");
    } catch (error) {
      updateStatus("Unable to load login. Please try again.");
    }
  };

  button.addEventListener("click", (event) => {
    event.preventDefault();
    updateStatus("Redirecting to Auth0...");
    window.tnkAuth.login();
  });

  boot();
})();
