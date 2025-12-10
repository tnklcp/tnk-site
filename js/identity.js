<!-- Keep this as a standalone file at js/identity.js and include it after the Netlify widget on pages that need auth. -->
<script>
/**
 * Netlify Identity helpers for role-gated pages.
 * Usage:
 *   <script src="https://identity.netlify.com/v1/netlify-identity-widget.js"></script>
 *   <script src="js/identity.js"></script>
 *   await TNK.requireRole(['admin']); // or ['employee'], ['customer']
 */

window.TNK = window.TNK || {};

TNK.identityReady = new Promise((resolve) => {
  function onReady() { resolve(); }
  if (window.netlifyIdentity) {
    netlifyIdentity.on('init', onReady);
    netlifyIdentity.on('login', () => location.reload());
    netlifyIdentity.on('logout', () => location.href = 'index.html');
    netlifyIdentity.init(); // boot the widget
  } else {
    setTimeout(onReady, 50);
  }
});

TNK.getUser = function getUser() {
  return window.netlifyIdentity ? netlifyIdentity.currentUser() : null;
};

TNK.hasRole = function hasRole(user, role) {
  const roles = user?.app_metadata?.roles || [];
  return roles.includes(role);
};

TNK.requireRole = async function requireRole(allowed = []) {
  await TNK.identityReady;
  const user = TNK.getUser();
  if (!user) {
    if (window.netlifyIdentity) netlifyIdentity.open('login');
    throw new Error('Not signed in');
  }
  if (allowed.length === 0) return user;
  if (TNK.hasRole(user, 'admin')) return user; // admin bypass
  const ok = allowed.some(r => TNK.hasRole(user, r));
  if (!ok) throw new Error('Insufficient role');
  return user;
};

TNK.logout = function logout() {
  if (window.netlifyIdentity) netlifyIdentity.logout();
};

TNK.renderUserBadge = async function renderUserBadge(elId) {
  await TNK.identityReady;
  const el = document.getElementById(elId);
  if (!el) return;
  const user = TNK.getUser();
  if (!user) { el.innerHTML = ''; return; }
  const roles = (user.app_metadata?.roles || []).join(', ') || 'user';
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;">
      <span>Signed in as <strong>${user.email}</strong> (${roles})</span>
      <button class="button" onclick="TNK.logout()">Log Out</button>
    </div>
  `;
};
</script>
