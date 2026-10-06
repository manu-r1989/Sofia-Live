/* =========================================================
   SOFIA V4.3.1 — SERVICE WORKER
   ========================================================= */

const CACHE = "sofia-live-v41810c1";


const ASSETS = [

  "./",

  "./index.html",

  "./style.css",

  "./app.js?v=41810c1",

  "./live.js?v=41810",

  "./sofia-avatar.js",

  /*
    WICHTIG:
    Master-Datei heißt exakt .PNG
  */
  "./sofia-avatar.PNG",


  /*
    V4.3 Avatar States
  */
  "./avatar/sofia-blink-closed.png",

  "./avatar/sofia-mouth-small.png",

  "./avatar/sofia-mouth-medium.png",

  "./avatar/sofia-mouth-wide.png",


  /*
    PWA
  */
  "./manifest.webmanifest",

  "./icons/icon-192.png",

  "./icons/icon-512.png",

  "./icons/apple-touch-icon.png"

];


/* =========================================================
   INSTALL
   ========================================================= */

self.addEventListener(
  "install",
  (event) => {

    event.waitUntil(

      caches
        .open(CACHE)

        .then(
          (cache) => {

            return cache.addAll(
              ASSETS
            );

          }
        )

        .then(
          () => {

            return self.skipWaiting();

          }
        )

    );

  }
);


/* =========================================================
   ACTIVATE
   Alte Sofia-Caches entfernen
   ========================================================= */

self.addEventListener(
  "activate",
  (event) => {

    event.waitUntil(

      caches
        .keys()

        .then(
          (keys) => {

            return Promise.all(

              keys

                .filter(
                  (key) =>
                    key !== CACHE
                )

                .map(
                  (key) =>
                    caches.delete(
                      key
                    )
                )

            );

          }
        )

        .then(
          () => {

            return self.clients.claim();

          }
        )

    );

  }
);


/* =========================================================
   FETCH
   ========================================================= */

self.addEventListener(
  "fetch",
  (event) => {

    /*
      Nur GET Requests cachen.
    */

    if (
      event.request.method !==
      "GET"
    ) {

      return;

    }


    // Authenticated API responses must never be served from the PWA cache.
    if (new URL(event.request.url).pathname.startsWith("/api/")) {
      return;
    }

    // Refresh the document online so it can reference the current asset version.
    const cachedLookup = event.request.mode === "navigate"
      ? Promise.resolve(undefined)
      : caches.match(event.request);

    event.respondWith(

      cachedLookup
        .then(
          (cachedResponse) => {

            /*
              Cache vorhanden.
            */

            if (
              cachedResponse
            ) {

              return cachedResponse;

            }


            /*
              Sonst Netzwerk.
            */

            return fetch(
              event.request
            )

              .then(
                (response) => {

                  /*
                    Fehlerhafte Antworten
                    nicht speichern.
                  */

                  if (
                    !response ||
                    response.status !== 200
                  ) {

                    return response;

                  }


                  const copy =
                    response.clone();


                  caches
                    .open(CACHE)

                    .then(
                      (cache) => {

                        cache.put(
                          event.request,
                          copy
                        );

                      }
                    );


                  return response;

                }
              )

              .catch(
                () => {

                  /*
                    Offline-Fallback nur
                    bei Navigation.
                  */

                  if (
                    event.request.mode ===
                    "navigate"
                  ) {

                    return caches.match(event.request).then(
                      cached => cached || caches.match("./index.html")
                    ).then(cached => cached || Response.error());

                  }


                  return Response.error();

                }
              );

          }
        )

    );

  }
);
