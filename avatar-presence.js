/* V4.19.3 — state-based visual posture observing the stable avatar engine. */
(() => {
  "use strict";
  function init() {
    const container = document.getElementById("sofiaAvatar");
    if (!container || document.getElementById("sofia-presence-style")) return;
    const style = document.createElement("style");
    style.id = "sofia-presence-style";
    style.textContent = `
      #sofiaAvatar[data-presence-motion] {
        transform-origin: 50% 42%;
        animation: sofiaPresenceBreath 9.6s ease-in-out infinite;
        animation-play-state: paused;
        rotate: 0deg;
        translate: 0 0;
        scale: 1;
        transition: rotate 1.2s ease-in-out, translate 1.2s ease-in-out, scale 1.2s ease-in-out;
      }
      #sofiaAvatar[data-presence-motion="active"] { animation-play-state: running; }
      #sofiaAvatar[data-presence-state="listening"][data-presence-motion="active"] {
        rotate: -.55deg; translate: 0 -1px; scale: 1.002;
      }
      #sofiaAvatar[data-presence-state="thinking"][data-presence-motion="active"] {
        rotate: .35deg; translate: 0 .5px; scale: 1;
      }
      #sofiaAvatar[data-presence-state="speaking"][data-presence-motion="active"] {
        rotate: 0deg; translate: 0 0; scale: 1;
      }
      @keyframes sofiaPresenceBreath {
        0%, 100% { transform: scale(1.008) translateY(0); }
        50% { transform: scale(1.012) translateY(-1px); }
      }
      @media (prefers-reduced-motion: reduce) {
        #sofiaAvatar[data-presence-motion] { animation: none !important; transform: none; }
      }
    `;
    document.head.appendChild(style);
    const syncState = () => {
      const state = container.querySelector(".sofia-avatar-v435")?.dataset.state;
      container.dataset.presenceState = ["idle", "listening", "thinking", "speaking"].includes(state) ? state : "idle";
    };
    if (typeof MutationObserver === "function") {
      const observer = new MutationObserver(syncState);
      observer.observe(container, { attributes: true, attributeFilter: ["data-state"], childList: true, subtree: true });
    }
    syncState();
    const sync = () => { container.dataset.presenceMotion = document.hidden ? "paused" : "active"; };
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pagehide", () => { container.dataset.presenceMotion = "paused"; });
    window.addEventListener("pageshow", sync);
    sync();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
