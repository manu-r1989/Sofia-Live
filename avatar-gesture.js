/* V4.19.5: occasional listening gesture outside the stable face/audio engine. */
(() => {
  "use strict";
  function init() {
    const host = document.getElementById("sofiaAvatar");
    if (!host || host.dataset.gestureReady || typeof host.animate !== "function") return;
    host.dataset.gestureReady = "true";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer = null, animation = null, lastState = null, lastNod = -Infinity, suspended = false;
    function allowed() {
      const root = host.querySelector(".sofia-avatar-v435");
      return !suspended && !document.hidden && !reduced.matches && root?.dataset.state === "listening" &&
        !root.querySelector('.active[data-frame="blink"], .active[data-frame="wink"], .active[data-frame="small"], .active[data-frame="medium"], .active[data-frame="wide"]');
    }
    function cancel() {
      clearTimeout(timer); timer = null;
      if (animation) { animation.cancel(); animation = null; }
    }
    function sync() {
      const state = host.querySelector(".sofia-avatar-v435")?.dataset.state;
      if (!allowed()) cancel();
      if (state !== lastState) {
        lastState = state;
        if (allowed() && Date.now() - lastNod >= 35000) {
          timer = window.setTimeout(() => {
            timer = null;
            if (!allowed() || Date.now() - lastNod < 35000) return;
            const style = getComputedStyle(host);
            const base = { rotate: style.rotate, translate: style.translate };
            try {
              animation = host.animate([
                base,
                { rotate: ((parseFloat(style.rotate) || 0) + .3) + "deg", translate: "0 .2px" },
                base
              ], { duration: 950, easing: "ease-in-out", fill: "none" });
              lastNod = Date.now();
              const current = animation;
              current.onfinish = () => { if (animation === current) animation = null; };
            } catch { animation = null; }
          }, 2200);
        }
      }
    }
    const observer = new MutationObserver(sync);
    observer.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state", "class"] });
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    window.addEventListener("pagehide", () => { suspended = true; cancel(); });
    window.addEventListener("pageshow", () => { suspended = false; sync(); });
    sync();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
