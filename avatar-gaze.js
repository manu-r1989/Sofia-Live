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
    img.src = "./avatar/sofia-gaze-left.png?v=4192g3";
    img.style.opacity = "1";
    img.style.pointerEvents = "none";
    img.hidden = true;
    const right = document.createElement("img");
    right.id = "sofia-gaze-right-overlay";
    right.className = img.className;
    right.alt = "";
    right.setAttribute("aria-hidden", "true");
    right.src = "./avatar/sofia-gaze-right.png?v=4192g2";
    right.style.opacity = "1";
    right.style.pointerEvents = "none";
    right.hidden = true;
    let rightReady = false, useRight = false;
    // The same root and object-fit rules keep the source coordinates aligned.
    let root, ready = false, active = false, timer = null, destroyed = false, lastState;
    function attach() {
      const next = host.querySelector(".sofia-avatar-v435");
      if (next && next !== root) { root = next; root.appendChild(img); root.appendChild(right); }
    }
    function allowed() {
      return ready && root && !document.hidden && !reduced.matches &&
        ["idle", "listening", "thinking"].includes(root.dataset.state) &&
        !root.querySelector('.active[data-frame="blink"], .active[data-frame="wink"], .active[data-frame="small"], .active[data-frame="medium"], .active[data-frame="wide"]');
    }
    function hide() { active = false; img.hidden = true; right.hidden = true; }
    function schedule() {
      clearTimeout(timer);
      if (destroyed || document.hidden || reduced.matches) return;
      timer = setTimeout(() => {
        if (allowed()) {
          active = true;
          (useRight && rightReady ? right : img).hidden = false;
          useRight = !useRight;
          timer = setTimeout(() => { hide(); schedule(); }, 850);
        } else schedule();
      }, root?.dataset.state === 'thinking' ? 5000 + Math.random() * 3000 : 18000 + Math.random() * 12000);
    }
    function sync() {
      attach();
      const state = root?.dataset.state, changed = state !== lastState;
      lastState = state;
      if (active && !allowed()) { hide(); schedule(); }
      else if (changed && !active) schedule();
    }
    const observer = new MutationObserver(sync);

    img.addEventListener("load", () => { ready = true; });
    img.addEventListener("error", () => { ready = false; hide(); });
    right.addEventListener("load", () => { rightReady = true; });
    right.addEventListener("error", () => { rightReady = false; hide(); schedule(); });
    const lifecycle = () => {
      observer.disconnect();
      if (!destroyed && !document.hidden) observer.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state", "class"] });
      hide(); sync(); schedule();
    };
    document.addEventListener("visibilitychange", lifecycle);
    reduced.addEventListener("change", lifecycle);
    window.addEventListener("pagehide", () => { destroyed = true; lifecycle(); });
    window.addEventListener("pageshow", () => { destroyed = false; lifecycle(); });
    lifecycle();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();

