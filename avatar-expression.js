/* V4.19.6: approved friendly and thoughtful mouths, observing the existing avatar state. */
(() => {
  "use strict";
  function init() {
    const host = document.getElementById("sofiaAvatar");
    if (!host || document.getElementById("sofia-friendly-overlay")) return;
    const img = document.createElement("img");
    img.id = "sofia-friendly-overlay";
    img.className = "sofia-avatar-v435-layer";
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.style.opacity = "1";
    img.style.pointerEvents = "none";
    img.hidden = true;
    const thoughtful = document.createElement("img");
    thoughtful.id = "sofia-thoughtful-overlay";
    thoughtful.className = img.className;
    thoughtful.alt = "";
    thoughtful.setAttribute("aria-hidden", "true");
    thoughtful.style.opacity = "1";
    thoughtful.style.pointerEvents = "none";
    thoughtful.hidden = true;
    let root, ready = false, thoughtfulReady = false, suspended = false;
    let thinkingTimer = null, thinkingSettled = false;
    function resetThinking() {
      if (thinkingTimer !== null) clearTimeout(thinkingTimer);
      thinkingTimer = null;
      thinkingSettled = false;
    }
    function sync() {
      const next = host.querySelector(".sofia-avatar-v435");
      if (next && next !== root) { resetThinking(); root = next; root.appendChild(img); root.appendChild(thoughtful); }
      const allowed = next && !document.hidden && !suspended &&
        !next.querySelector('.active[data-frame="wink"], .active[data-frame="small"], .active[data-frame="medium"], .active[data-frame="wide"]');
      img.hidden = !(allowed && ready && next.dataset.state === "listening");
      const canThink = allowed && thoughtfulReady && next.dataset.state === "thinking";
      if (!canThink) resetThinking();
      else if (!thinkingSettled && thinkingTimer === null) {
        thinkingTimer = window.setTimeout(() => {
          thinkingTimer = null;
          thinkingSettled = true;
          sync();
        }, 250);
      }
      // Avoid a brief expression flash on short processing states. Speech and
      // existing mouth/wink frames still remove both overlays immediately.
      thoughtful.hidden = !(canThink && thinkingSettled);
    }
    img.addEventListener("load", () => { ready = true; sync(); });
    img.addEventListener("error", () => { ready = false; sync(); });
    thoughtful.addEventListener("load", () => { thoughtfulReady = true; sync(); });
    thoughtful.addEventListener("error", () => { thoughtfulReady = false; sync(); });
    const observer = new MutationObserver(sync);
    observer.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state", "class"] });
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pagehide", () => { suspended = true; sync(); });
    window.addEventListener("pageshow", () => { suspended = false; sync(); });
    // Static expression stays available with reduced motion; no audio access.
    sync();
    img.src = "./avatar/sofia-friendly-mouth.png?v=4194e1";
    thoughtful.src = "./avatar/sofia-thoughtful-mouth.png?v=4194e2";
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
