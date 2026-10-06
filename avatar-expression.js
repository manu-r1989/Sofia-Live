/* V4.19.4: approved friendly mouth, observing the existing avatar state. */
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
    let root, ready = false, suspended = false;
    function sync() {
      const next = host.querySelector(".sofia-avatar-v435");
      if (next && next !== root) { root = next; root.appendChild(img); }
      img.hidden = !(ready && next && !document.hidden && !suspended &&
        next.dataset.state === "listening" &&
        !next.querySelector('.active[data-frame="wink"], .active[data-frame="small"], .active[data-frame="medium"], .active[data-frame="wide"]'));
    }
    img.addEventListener("load", () => { ready = true; sync(); });
    img.addEventListener("error", () => { ready = false; sync(); });
    const observer = new MutationObserver(sync);
    observer.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state", "class"] });
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pagehide", () => { suspended = true; sync(); });
    window.addEventListener("pageshow", () => { suspended = false; sync(); });
    // Static expression stays available with reduced motion; no audio or timers.
    sync();
    img.src = "./avatar/sofia-friendly-mouth.png?v=4194e1";
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
