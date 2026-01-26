(() => {
  const state = {
    client: null,
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

  const init = async () => {
    if (state.ready) return state.ready;

    state.ready = (async () => {
      const config = await loadConfig();
      if (!window.createAuth0Client) {
        throw new Error("Auth0 SDK failed to load.");
      }
      const client = await window.createAuth0Client({
        domain: config.domain,
        clientId: config.clientId,
        authorizationParams: {
          audience: config.audience || undefined,
          redirect_uri: config.redirectUri || `${window.location.origin}/login.html`
        },
        cacheLocation: "localstorage",
        useRefreshTokens: true
      });
      state.client = client;
      state.config = config;
      return { client, config };
    })();

    return state.ready;
  };

  const handleRedirectIfPresent = async () => {
    const query = window.location.search;
    if (!query.includes("code=") || !query.includes("state=")) {
      return false;
    }
    const { client } = await init();
    await client.handleRedirectCallback();
    window.history.replaceState({}, document.title, window.location.pathname);
    return true;
  };

  const getRolesFromClaims = (claims, config) => {
    if (!claims) return [];
    const configured = config?.rolesClaim && claims[config.rolesClaim];
    const fallback = claims["https://tnk/roles"] || claims.roles;
    const roles = configured || fallback;
    if (Array.isArray(roles)) return roles.map((role) => String(role));
    if (typeof roles === "string") return [roles];
    return [];
  };

  const getUserProfile = async () => {
    const { client, config } = await init();
    const [user, claims] = await Promise.all([client.getUser(), client.getIdTokenClaims()]);
    return {
      user,
      roles: getRolesFromClaims(claims || {}, config),
      claims
    };
  };

  const login = async () => {
    const { client, config } = await init();
    await client.loginWithRedirect({
      authorizationParams: {
        redirect_uri: config.redirectUri || `${window.location.origin}/login.html`
      }
    });
  };

  const signup = async () => {
    const { client, config } = await init();
    await client.loginWithRedirect({
      authorizationParams: {
        redirect_uri: config.redirectUri || `${window.location.origin}/login.html`,
        screen_hint: "signup"
      }
    });
  };

  const logout = async (returnTo) => {
    const { client } = await init();
    client.logout({
      logoutParams: {
        returnTo: returnTo || `${window.location.origin}/login.html`
      }
    });
  };

  const getAccessToken = async () => {
    const { client, config } = await init();
    return client.getTokenSilently({
      authorizationParams: {
        audience: config.audience || undefined
      }
    });
  };

  const requireAuth = async (redirectTo) => {
    const { client, config } = await init();
    await handleRedirectIfPresent();
    const isAuthenticated = await client.isAuthenticated();
    if (!isAuthenticated) {
      await client.loginWithRedirect({
        authorizationParams: {
          redirect_uri:
            redirectTo ||
            config.redirectUri ||
            `${window.location.origin}${window.location.pathname}`
        }
      });
      return null;
    }
    return client;
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
    getConfig: () => state.config
  };
})();
