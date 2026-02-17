/* =========================================================
   UI interactions + Scroll Reveal + Estimate helpers
   ========================================================= */

// ===== Mobile nav toggle =====
(function initMobileNav() {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (!toggle || !links) return;

  const mq = window.matchMedia("(max-width: 900px)");
  const setState = (open) => {
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    links.classList.toggle("is-open", open);
    if (open) {
      links.removeAttribute("aria-hidden");
    } else {
      links.setAttribute("aria-hidden", "true");
    }
  };

  const syncForViewport = () => {
    if (mq.matches) {
      setState(false);
    } else {
      links.classList.remove("is-open");
      links.removeAttribute("aria-hidden");
      toggle.setAttribute("aria-expanded", "false");
    }
  };

  toggle.addEventListener("click", () => {
    const isOpen = toggle.getAttribute("aria-expanded") === "true";
    setState(!isOpen);
  });

  links.addEventListener("click", (event) => {
    if (mq.matches && event.target.closest("a")) {
      setState(false);
    }
  });

  syncForViewport();
  mq.addEventListener("change", syncForViewport);
})();

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
  const serviceCards = document.querySelectorAll('.service-card[data-tier]');
  if (!btns.length && !serviceCards.length) return;

  const form = document.querySelector('#estimate form');
  const selectedPlan = document.getElementById('selected_plan');
  const essential = document.querySelector('details[data-tier="essential"]');
  const standard  = document.querySelector('details[data-tier="standard"]');
  const premium   = document.querySelector('details[data-tier="premium"]');
  const storm     = document.querySelector('details[data-tier="storm"]');

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

  const setChecked = (container, labels) => {
    if (!container) return;
    labels.forEach(v => {
      const input = container.querySelector(`input[type="checkbox"][value="${v}"]`);
      if (input) input.checked = true;
    });
  };

  const clearAll = () => {
    form.querySelectorAll('input[type="checkbox"][name="services"]').forEach(i => (i.checked = false));
    form.querySelectorAll('input[type="checkbox"][name^="storm_"]').forEach(i => (i.checked = false));
  };

  const openDetails = (details) => {
    details.forEach(d => d && d.setAttribute('open', ''));
  };

  const selectTier = (plan) => {
    if (selectedPlan) selectedPlan.value = plan;
    clearAll();
    openDetails([essential, standard, premium, storm]);

    if (plan === 'essential') {
      setChecked(essential, E);
    } else if (plan === 'standard') {
      setChecked(essential, E);
      setChecked(standard, S);
    } else if (plan === 'premium') {
      setChecked(essential, E);
      setChecked(standard, S);
      setChecked(premium, P);
    } else if (plan === 'storm') {
      form.querySelectorAll('input[type="checkbox"][name^="storm_"]').forEach(i => (i.checked = true));
    }

    document.getElementById('estimate').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const plan = btn.dataset.plan; // 'essential' | 'standard' | 'premium'
      selectTier(plan);
    });
  });

  serviceCards.forEach(card => {
    const plan = card.dataset.tier;
    const handleActivate = () => selectTier(plan);
    card.addEventListener('click', handleActivate);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleActivate();
      }
    });
  });
})();

// ===== Estimate form required-field prompts =====
(function initEstimateValidation() {
  const form = document.querySelector('#estimate form');
  if (!form) return;

  const requiredFields = Array.from(form.querySelectorAll('[required]'));
  const setRequiredMessage = (field) => {
    if (field.validity.valueMissing) {
      field.setCustomValidity('This is a required field.');
    } else {
      field.setCustomValidity('');
    }
  };

  requiredFields.forEach(field => {
    field.addEventListener('invalid', () => setRequiredMessage(field));
    const clearEvent = field.type === 'radio' || field.type === 'checkbox' ? 'change' : 'input';
    field.addEventListener(clearEvent, () => field.setCustomValidity(''));
  });

  form.addEventListener('submit', (event) => {
    if (!form.checkValidity()) {
      event.preventDefault();
      requiredFields.forEach(field => setRequiredMessage(field));
      form.reportValidity();
    }
  });
})();
