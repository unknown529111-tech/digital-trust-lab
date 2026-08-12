/* BridgeNet service worker — offline-first for low-bandwidth users.
   Cache-first for app shell; network fallback; versioned cache. */
"use strict";

var CACHE = "bridgenet-v1";
var SHELL = ["./", "./index.html", "./css/app.css", "./js/app.js", "./manifest.webmanifest"];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(SHELL); }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (resp) {
        // Cache successful same-origin GETs opportunistically (max 32 entries).
        if (resp && resp.ok && new URL(req.url).origin === self.location.origin) {
          var copy = resp.clone();
          caches.open(CACHE).then(function (cache) {
            cache.keys().then(function (keys) {
              if (keys.length > 32) cache.delete(keys[0]);
              cache.put(req, copy);
            });
          });
        }
        return resp;
      }).catch(function () {
        // Offline: fall back to the cached page for navigation requests.
        if (req.mode === "navigate") return caches.match("./index.html");
        return new Response("", { status: 503, statusText: "Offline" });
      });
    })
  );
});