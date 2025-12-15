/* =========================================================
   UI interactions + Scroll Reveal + Estimate helpers
   ========================================================= */

// ===== Modal open/close =====
const body = document.body;
const openButtons = document.querySelectorAll("[data-modal-open]");
const closeSelectors = "[data-modal-close], .modal__backdrop";

openButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const id = btn.getAttribute("data-modal-open");
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.setAttribute("aria-hidden", "false");
    body.classList.add("modal-open");
    const firstInput = modal.querySelector("input, textarea, button, a");
    if (firstInput) firstInput.focus({ preventScroll: true });
  });
});
document.addEventListener("click", (e) => {
  if (e.target.matches(closeSelectors)) {
    const modal = e.target.closest(".modal") || document.querySelector(".modal[aria-hidden='false']");
    if (!modal) return;
    modal.setAttribute("aria-hidden", "true");
    body.classList.remove("modal-open");
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal").forEach(m => m.setAttribute("aria-hidden", "true"));
    body.classList.remove("modal-open");
  }
});

// ===== Scroll Reveal =====
(function initScrollReveal() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || items.length === 0) {
    items.forEach(el => el.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0.15 });
  items.forEach(el => io.observe(el));
})();

// ===== Estimate Tier Auto-Select + Scroll =====
(function initTierButtons() {
  const btns = document.querySelectorAll('[data-plan]');
  if (!btns.length) return;
  const form = document.querySelector('#estimate form');
  const setChecked = (container, labels) => {
    labels.forEach(v => {
      const input = container.querySelector(`input[type="checkbox"][value="${v}"]`);
      if (input) input.checked = true;
    });
  };

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const plan = btn.dataset.plan; // 'essential' | 'standard' | 'premium'
      document.getElementById('selected_plan').value = plan;

      // Clear previous checks
      form.querySelectorAll('input[type="checkbox"][name="services"]').forEach(i => (i.checked = false));

      const essential = document.querySelector('details[data-tier="essential"]');
      const standard  = document.querySelector('details[data-tier="standard"]');
      const premium   = document.querySelector('details[data-tier="premium"]');

      const E = [
        'Lawn Mowing (Alternating Patterns)',
        'String Trimming (Edges, Beds)',
        'Blowing Off Hard Surfaces',
        'Turf Inspection'
      ];
      const S = [
        'Shrub & Plant Pruning',
        'Collect & Bag Debris',
        'Plant Health Inspection',
        'Hand-Pull Weeds (Walkways)'
      ];
      const P = [
        'Hand-Weeding Garden Beds',
        'Hand-Pull Weeds (Lawn)',
        'Insulate Hose Spigots',
        'Remove Cobwebs',
        'Seasonal Fertilization',
        'Inspect Mulch Condition'
      ];

      // open accordions for visibility
      [essential, standard, premium].forEach(d => d && d.setAttribute('open',''));

      if (plan === 'essential') {
        setChecked(essential, E);
      } else if (plan === 'standard') {
        setChecked(essential, E);
        setChecked(standard,  S);
      } else if (plan === 'premium') {
        setChecked(essential, E);
        setChecked(standard,  S);
        setChecked(premium,   P);
      }

      document.getElementById('estimate').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
})();
