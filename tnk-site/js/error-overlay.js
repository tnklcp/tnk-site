(function () {
  if (window.__tnkErrorOverlayInstalled) return;
  window.__tnkErrorOverlayInstalled = true;

  const MAX_ENTRIES = 10;
  const entries = [];

  function safeStringify(value) {
    const seen = new WeakSet();
    return JSON.stringify(
      value,
      (key, val) => {
        if (typeof val === "object" && val !== null) {
          if (seen.has(val)) return "[Circular]";
          seen.add(val);
        }
        if (typeof val === "function") return `[Function ${val.name || "anonymous"}]`;
        return val;
      },
      2
    );
  }

  function formatErrorPayload(payload) {
    if (!payload) return "(no error payload)";
    if (payload instanceof Error) {
      return payload.stack || payload.message || String(payload);
    }
    if (typeof payload === "string") return payload;
    if (typeof payload === "object") {
      if (payload.message || payload.stack) {
        return [payload.message, payload.stack].filter(Boolean).join("\n");
      }
      try {
        return safeStringify(payload);
      } catch {
        return String(payload);
      }
    }
    return String(payload);
  }

  function formatEntry({ title, detail, location }) {
    const timestamp = new Date().toLocaleString();
    const header = `[${timestamp}] ${title}`;
    const where = location ? `Location: ${location}` : "";
    const body = detail ? `\n${detail}` : "";
    return [header, where, body].filter(Boolean).join("\n");
  }

  function ensureOverlay() {
    let overlay = document.getElementById("tnk-error-overlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "tnk-error-overlay";
    overlay.className = "tnk-error-overlay";
    overlay.setAttribute("role", "presentation");
    overlay.innerHTML = `
      <div class="tnk-error-window" role="dialog" aria-modal="true" aria-label="Application error">
        <div class="tnk-error-header">
          <div>
            <h2>Application Error</h2>
            <p>Errors are shown here and stay visible for debugging.</p>
          </div>
          <div class="tnk-error-actions">
            <button type="button" data-error-copy>Copy</button>
            <button type="button" data-error-close>Close</button>
          </div>
        </div>
        <div class="tnk-error-body">
          <div class="tnk-error-meta" data-error-meta></div>
          <pre data-error-details></pre>
          <div class="tnk-error-footnote">If this keeps appearing, copy the details and share them with support.</div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector("[data-error-close]")?.addEventListener("click", () => {
      overlay.classList.remove("is-visible");
    });

    overlay.querySelector("[data-error-copy]")?.addEventListener("click", async () => {
      const details = overlay.querySelector("[data-error-details]")?.textContent || "";
      try {
        await navigator.clipboard.writeText(details);
      } catch {
        // Fallback: select text for manual copy
        const range = document.createRange();
        const pre = overlay.querySelector("[data-error-details]");
        if (pre) {
          range.selectNodeContents(pre);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    });

    return overlay;
  }

  function showOverlay(entryText, metaLines) {
    const overlay = ensureOverlay();
    const meta = overlay.querySelector("[data-error-meta]");
    const details = overlay.querySelector("[data-error-details]");

    entries.unshift(entryText);
    while (entries.length > MAX_ENTRIES) entries.pop();

    if (meta) {
      meta.innerHTML = metaLines.map((line) => `<div>${line}</div>`).join("");
    }
    if (details) {
      details.textContent = entries.join("\n\n-----\n\n");
    }

    overlay.classList.add("is-visible");
  }

  window.addEventListener("error", (event) => {
    const detail = formatErrorPayload(event.error || event.message || event);
    const location = event.filename ? `${event.filename}:${event.lineno || 0}:${event.colno || 0}` : "";
    const entry = formatEntry({
      title: "Uncaught Error",
      detail,
      location
    });

    console.error("Uncaught Error:", event.error || event.message || event);

    showOverlay(entry, ["Type: Uncaught Error", location ? `Source: ${location}` : "Source: (unknown)"]);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const detail = formatErrorPayload(event.reason || event);
    const entry = formatEntry({
      title: "Unhandled Promise Rejection",
      detail,
      location: "Promise rejection"
    });

    console.error("Unhandled Promise Rejection:", event.reason || event);

    showOverlay(entry, ["Type: Unhandled Promise Rejection", "Source: Promise rejection"]);
  });
})();
