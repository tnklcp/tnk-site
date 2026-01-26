(() => {
  const state = {
    identity: null,
    config: null,
    ready: null
  };

  const setStatus = (el, message) => {
    if (el) {
      el.textContent = message;
    }
  };

  const loadConfig = async () => {
    const response = await fetch("/api/auth/config", { credentials: "omit" });
    if (!response.ok) {
      throw new Error("Unable to load authentication settings.");
    }
    return response.json();
  };

  const getIdentity = () => {
    if (state.identity) return state.identity;
    if (!window.netlifyIdentity) {
      throw new Error("Netlify Identity widget failed to load.");
    }
    state.identity = window.netlifyIdentity;
    return state.identity;
  };

  const init = async () => {
    if (state.ready) return state.ready;

    state.ready = (async () => {
      const config = await loadConfig();
      const identity = getIdentity();
      identity.init();
      state.config = config;
      return { identity, config };
    })();

    return state.ready;
  };

  const handleRedirectIfPresent = async () => false;

  const normalizeRoles = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((role) => String(role));
    if (typeof value === "string") return [value];
    return [];
  };

  const getRolesFromUser = (user, config) => {
    if (!user) return [];
    const rolesClaim = config?.rolesClaim;
    const appMetadata = user.app_metadata || {};
    const userMetadata = user.user_metadata || {};
    const configuredRoles = rolesClaim
      ? appMetadata[rolesClaim] ?? userMetadata[rolesClaim] ?? user[rolesClaim]
      : undefined;
    const fallback = configuredRoles ?? appMetadata.roles ?? userMetadata.roles ?? user.roles;
    return normalizeRoles(fallback);
  };

  const getUserProfile = async () => {
    const { identity, config } = await init();
    const user = identity.currentUser();
    return {
      user,
      roles: getRolesFromUser(user, config),
      claims: user?.app_metadata || {}
    };
  };

  const getCurrentUser = async () => {
    const { identity } = await init();
    return identity.currentUser();
  };

  const login = async () => {
    const { identity } = await init();
    identity.open("login");
  };

  const signup = async () => {
    const { identity } = await init();
    identity.open("signup");
  };

  const logout = async (returnTo) => {
    const { identity } = await init();
    identity.logout();
    if (returnTo) {
      window.location.href = returnTo;
    }
  };

  const getAccessToken = async () => {
    const { identity } = await init();
    const user = identity.currentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }
    if (typeof user.jwt === "function") {
      return user.jwt();
    }
    const token = user.token?.access_token;
    if (!token) {
      throw new Error("Missing access token");
    }
    return token;
  };

  const requireAuth = async (redirectTo) => {
    const { identity } = await init();
    const user = identity.currentUser();
    if (!user) {
      window.location.href = redirectTo || "login.html";
      return null;
    }
    return user;
  };

  const onEvent = async (event, handler) => {
    const { identity } = await init();
    identity.on(event, handler);
  };

  window.tnkAuth = {
    init,
    handleRedirectIfPresent,
    getUserProfile,
    getAccessToken,
    login,
    signup,
    logout,
    requireAuth,
    setStatus,
    getConfig: () => state.config,
    getCurrentUser,
    getIdentity: async () => (await init()).identity,
    onEvent
  };
})();
