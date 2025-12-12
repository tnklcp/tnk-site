<!-- File: js/identity.js -->
<script>
  // Lightweight Identity helper
  window.TNKIdentity = (function () {
    const GoTrueURL = window.location.origin + '/.netlify/identity';

    let auth;
    function ensureAuth() {
      if (auth) return auth;
      if (!window.GoTrue) {
        throw new Error('GoTrue library not loaded');
      }
      auth = new GoTrue({ APIUrl: GoTrueURL, setCookie: true });
      return auth;
    }

    async function currentUser() {
      try {
        return await ensureAuth().currentUser();
      } catch (e) {
        console.error('[Identity] currentUser error:', e);
        return null;
      }
    }

    async function login(email, password) {
      try {
        const user = await ensureAuth().login(email, password, true);
        return { ok: true, user };
      } catch (e) {
        console.error('[Identity] login error:', e);
        // Friendly messages
        let msg = e && e.message ? e.message : 'Login failed';
        if (/confirmation/i.test(msg) || /confirmed/i.test(msg)) {
          msg = 'Please confirm your email before signing in.';
        }
        if (/invalid/i.test(msg) || /Unauthorized/i.test(msg)) {
          msg = 'Invalid email or password.';
        }
        return { ok: false, error: msg };
      }
    }

    async function logout() {
      try {
        const u = await currentUser();
        if (u) await u.logout();
        return { ok: true };
      } catch (e) {
        console.error('[Identity] logout error:', e);
        return { ok: false, error: 'Logout failed' };
      }
    }

    async function requestPasswordRecovery(email) {
      try {
        await ensureAuth().requestPasswordRecovery(email);
        return { ok: true };
      } catch (e) {
        console.error('[Identity] reset error:', e);
        return { ok: false, error: e?.message || 'Unable to send reset email.' };
      }
    }

    return { currentUser, login, logout, requestPasswordRecovery, GoTrueURL };
  })();
</script>
