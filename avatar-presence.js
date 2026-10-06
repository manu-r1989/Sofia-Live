/* V4.19.1 preparation — visual presence outside the stable avatar engine. */
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
      }
      #sofiaAvatar[data-presence-motion="active"] { animation-play-state: running; }
      @keyframes sofiaPresenceBreath {
        0%, 100% { transform: scale(1.008) translateY(0); }
        50% { transform: scale(1.012) translateY(-1px); }
      }
      @media (prefers-reduced-motion: reduce) {
        #sofiaAvatar[data-presence-motion] { animation: none !important; transform: none; }
      }
    `;
    document.head.appendChild(style);
    const sync = () => { container.dataset.presenceMotion = document.hidden ? "paused" : "active"; };
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pagehide", () => { container.dataset.presenceMotion = "paused"; });
    window.addEventListener("pageshow", sync);
    sync();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
