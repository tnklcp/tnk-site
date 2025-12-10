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

// On submit for Netlify “estimate” form, always aggregate choices
document.addEventListener("submit", (e) => {
  const form = e.target;
  if (!(form instanceof HTMLFormElement)) return;

  // Honeypot: if bot filled the hidden "company" field, stop
  const hp = form.querySelector("input[name='company']");
  if (hp && hp.value.trim() !== "") {
    e.preventDefault();
    return;
  }

  // Estimate form is now identified by form name
  const isEstimate = (form.getAttribute("name") || "").toLowerCase() === "estimate";
  if (isEstimate) {
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




