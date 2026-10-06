/* V4.19.2: optional eye overlay; existing audio/face controller remains owner. */
(() => {
  "use strict";
  function init() {
    const host = document.getElementById("sofiaAvatar");
    if (!host || document.getElementById("sofia-gaze-overlay")) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const img = document.createElement("img");
    img.id = "sofia-gaze-overlay";
    img.className = "sofia-avatar-v435-layer";
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.src = "./avatar/sofia-gaze-left.png?v=4192g1";
    img.style.opacity = "1";
    img.style.pointerEvents = "none";
    img.hidden = true;
    // The same root and object-fit rules keep the source coordinates aligned.
    let root, ready = false, active = false, timer = null, destroyed = false;
    function attach() {
      const next = host.querySelector(".sofia-avatar-v435");
      if (next && next !== root) { root = next; root.appendChild(img); }
    }
    function allowed() {
      return ready && root && !document.hidden && !reduced.matches &&
        ["idle", "listening"].includes(root.dataset.state) &&
        !root.querySelector('.active[data-frame="blink"], .active[data-frame="wink"], .active[data-frame="small"], .active[data-frame="medium"], .active[data-frame="wide"]');
    }
    function hide() { active = false; img.hidden = true; }
    function schedule() {
      clearTimeout(timer);
      if (destroyed || document.hidden || reduced.matches) return;
      timer = setTimeout(() => {
        if (allowed()) {
          active = true; img.hidden = false;
          timer = setTimeout(() => { hide(); schedule(); }, 850);
        } else schedule();
      }, 18000 + Math.random() * 12000);
    }
    function sync() {
      attach();
      if (active && !allowed()) { hide(); schedule(); }
    }
    const observer = new MutationObserver(sync);
    observer.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state", "class"] });
    img.addEventListener("load", () => { ready = true; });
    img.addEventListener("error", () => { ready = false; hide(); });
    const lifecycle = () => { hide(); schedule(); };
    document.addEventListener("visibilitychange", lifecycle);
    reduced.addEventListener("change", lifecycle);
    window.addEventListener("pagehide", () => { destroyed = true; clearTimeout(timer); hide(); });
    window.addEventListener("pageshow", () => { destroyed = false; sync(); schedule(); });
    attach(); schedule();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
