/* =========================================================
   SOFIA V4.27.7 — SERVICE WORKER
   ========================================================= */

const CACHE = "sofia-live-v4277";


const ASSETS = [

  "./",

  "./index.html",

  "./style.css?v=4277",

  "./action-feedback.js?v=4277",
  "./sofia-images.js?v=4277",
  "./app.js?v=4277",

  "./live.js?v=4277",

  "./sofia-avatar.js?v=4192c1",

  "./avatar-presence.js?v=4193p3",
  "./avatar-gesture.js?v=4197m1",
  "./avatar-expression.js?v=4197m1",
  "./avatar/sofia-friendly-mouth.png?v=4194e1",
  "./avatar/sofia-thoughtful-mouth.png?v=4194e2",

  "./avatar-gaze.js?v=4197m1",

  "./avatar/sofia-gaze-left.png?v=4192g3",

  "./avatar/sofia-gaze-right.png?v=4192g2",

  /*
    WICHTIG:
    Master-Datei heißt exakt .PNG
  */
  "./sofia-avatar.PNG?v=4192c1",


  /*
    V4.3 Avatar States
  */
  "./avatar/sofia-blink-closed.png?v=4192c1",

  "./avatar/sofia-mouth-small.png?v=4192c1",

  "./avatar/sofia-mouth-medium.png?v=4192c1",

  "./avatar/sofia-mouth-wide.png?v=4192c1",

  "./avatar/sofia-local-wink.png?v=4192c1",


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
