/* =========================================================
   UI interactions + Scroll Reveal + Form helpers
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

// ===== Form helpers: collect selected options into hidden fields =====
function collectSelections(form) {
  const services = [...form.querySelectorAll("input[name='services']:checked")].map(i => i.value);
  const sched = [...form.querySelectorAll("input[name='storm_schedule']:checked")].map(i => i.value);
  const checks = [...form.querySelectorAll("input[name='storm_checks']:checked")].map(i => i.value);

  const setHidden = (name, values) => {
    const field = form.querySelector(`input[name='${name}']`);
    if (field) field.value = values.join(", ");
  };
  setHidden("selected_services", services);
  setHidden("selected_storm_schedule", sched);
  setHidden("selected_storm_checks", checks);
}

document.addEventListener("submit", (e) => {
  const form = e.target;
  if (!(form instanceof HTMLFormElement)) return;

  // Honeypot: if bot filled the hidden "company" field, stop
  const hp = form.querySelector("input[name='company']");
  if (hp && hp.value.trim() !== "") {
    e.preventDefault();
    return;
  }

  // For estimate form, populate hidden fields
  if (form.matches("form[name='estimate']")) {
    collectSelections(form);
  }
});

// ===== Scroll Reveal (IntersectionObserver) =====
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

// ===== Tier preselection + smooth scroll to form =====
(function initTierSelection() {
  const buttons = document.querySelectorAll("[data-select-tier]");
  if (!buttons.length) return;

  const estimateSection = document.querySelector("#estimate");
  const estimateForm = document.querySelector("form[name='estimate']");
  if (!estimateForm) return;

  // exact checkbox values in the form:
  const ESSENTIAL = [
    "Lawn Mowing (Alternating Patterns)",
    "String Trimming (Edges, Trees, Beds)",
    "Blowing Off Sidewalks, Driveways, Patios",
    "Turf Inspection (Bare Spots, Pests, Water Issues)"
  ];
  const STANDARD_ONLY = [
    "Shrub & Plant Pruning",
    "Collect & Bag Debris (Leaves, Branches, Trimmings)",
    "Inspect Shrubs/Plants for Disease or Stress",
    "Hand-Pull Weeds From Walkways"
  ];
  const PREMIUM_ONLY = [
    "Hand-Weeding Garden Beds",
    "Hand-Pull Weeds From Lawn Areas",
    "Check/Insulate Hose Spigots (Seasonal)",
    "Remove Cobwebs (Entryways/Structures)",
    "Fertilize Lawn/Gardens (Log Product/Date)",
    "Inspect Mulch & Soil Condition"
  ];

  function setOpenStates(tier) {
    // Open relevant <details> blocks for visibility
    const dEssential = document.getElementById("details-essential");
    const dStandard  = document.getElementById("details-standard");
    const dPremium   = document.getElementById("details-premium");
    if (dEssential) dEssential.open = true;
    if (dStandard)  dStandard.open  = tier !== "essential";
    if (dPremium)   dPremium.open   = tier === "premium";
  }

  function preselectTier(tier) {
    // clear all first
    estimateForm.querySelectorAll("input[name='services'][type='checkbox']").forEach(cb => cb.checked = false);

    // pick list(s)
    let list = [];
    if (tier === "essential") {
      list = [...ESSENTIAL];
    } else if (tier === "standard") {
      list = [...ESSENTIAL, ...STANDARD_ONLY];
    } else if (tier === "premium") {
      list = [...ESSENTIAL, ...STANDARD_ONLY, ...PREMIUM_ONLY];
    }

    // check matching boxes
    list.forEach(val => {
      const el = estimateForm.querySelector(`input[name="services"][value="${CSS.escape(val)}"]`);
      if (el) el.checked = true;
    });

    setOpenStates(tier);
  }

  function scrollToForm() {
    if (!estimateSection) return;
    estimateSection.scrollIntoView({ behavior: "smooth", block: "start" });
    // focus first field after a brief delay so the scroll can start
    setTimeout(() => {
      const first = estimateForm.querySelector("input, textarea, select");
      if (first) first.focus({ preventScroll: true });
    }, 300);
  }

  buttons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      const tier = btn.getAttribute("data-select-tier");
      if (tier) {
        // we still let the #estimate anchor work, but ensure preselect happens before
        preselectTier(tier);
      }
      // prevent default jump to avoid double-scroll jerk, we scroll ourselves
      e.preventDefault();
      scrollToForm();
    });
  });
})();
