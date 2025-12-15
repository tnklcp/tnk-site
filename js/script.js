/* =========================================================
   UI interactions + Scroll Reveal + Form helpers + Tier cascade
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
  if (form.matches("form[action='/api/estimate'], form[netlify][name='estimate']")) {
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

/* ===== Tier cascade for Estimate form =====
   If a user checks anything in:
   - Standard  -> auto-check all Essential
   - Premium   -> auto-check all Standard + Essential
   We only auto-CHECK lower tiers (never auto-uncheck).
*/
(function initTierCascade() {
  // Find the estimate form (works whether you're posting to /api/estimate or using Netlify)
  const estForm = document.querySelector("#estimate form");
  if (!estForm) return;

  // We’ll identify the three <details> blocks by order:
  //  0: Essential Care
  //  1: Standard Care (Includes Essential +)
  //  2: Premium Care  (Includes Standard +)
  const groups = [...estForm.querySelectorAll(".details-card")];
  if (groups.length < 3) return;

  const essential = groups[0];
  const standard  = groups[1];
  const premium   = groups[2];

  function checkAllIn(container, selector = "input[type='checkbox']") {
    container.querySelectorAll(selector).forEach(cb => { cb.checked = true; });
  }

  // When any Standard checkbox is checked -> ensure Essential all checked
  standard.addEventListener("change", (e) => {
    const t = e.target;
    if (t && t.matches("input[type='checkbox']") && t.checked) {
      checkAllIn(essential);
    }
  });

  // When any Premium checkbox is checked -> ensure Standard + Essential all checked
  premium.addEventListener("change", (e) => {
    const t = e.target;
    if (t && t.matches("input[type='checkbox']") && t.checked) {
      checkAllIn(standard);
      checkAllIn(essential);
    }
  });

  // Bonus: If user clicks the “Pick Standard / Pick Premium” buttons in pricing cards,
  // pre-check tiers and scroll to the form (these buttons link to #estimate already).
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href*='#estimate']");
    if (!a) return;

    // Detect which pricing card they clicked from (based on text)
    const card = e.target.closest(".price-card");
    if (!card) return;

    const title = (card.querySelector("h3")?.textContent || "").toLowerCase();

    // Clear all first (so it’s deterministic)
    estForm.querySelectorAll("input[type='checkbox'][name='services']").forEach(cb => { cb.checked = false; });

    if (title.includes("premium")) {
      checkAllIn(premium);
      checkAllIn(standard);
      checkAllIn(essential);
    } else if (title.includes("standard")) {
      checkAllIn(standard);
      checkAllIn(essential);
    } else if (title.includes("essential")) {
      checkAllIn(essential);
    }

    // Make sure hidden fields reflect current selection if the user submits immediately
    collectSelections(estForm);
  });
})();
