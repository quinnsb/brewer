/* ============================================================
   SOUND — one preference, and the Spotify player that obeys it

   Opening an album plays it. That is the point of a record shelf, and it is
   what the volume control in the corner is for: one switch, remembered, that
   decides whether the library makes noise at all.

   Playback goes through Spotify's iframe API rather than a bare embed, because
   a bare embed cannot be told to start, stopped when the panel closes, or
   paused when the switch is flipped. The bare embed stays as the fallback: if
   the API script is blocked, the player still renders and still works, it just
   waits to be pressed.

   Autoplay policy is why this is wired to a click. Every play() here happens
   inside the gesture that opened the detail panel, which is what browsers ask
   for. Nothing plays on page load.
   ============================================================ */

const KEY = "library-sound";
const API_SRC = "https://open.spotify.com/embed/iframe-api/v1";
const listeners = new Set();

/* On by default, because the request was for albums to play when opened. The
   switch is in the corner of every library page, and the answer is remembered,
   so a visitor who turns it off is not asked twice. */
export function soundOn() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSound(on) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch { /* private mode: the preference just does not outlive the tab */ }
  if (!on) stop();
  for (const listener of listeners) listener(on);
}

export function onSoundChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/* ---------- the Spotify iframe API ---------- */

let apiPromise = null;

function loadApi() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    if (window.__spotifyIframeApi) return resolve(window.__spotifyIframeApi);
    /* The API calls this global once, so it is stashed for every later album
       rather than reloading the script per panel. */
    window.onSpotifyIframeApiReady = (api) => {
      window.__spotifyIframeApi = api;
      resolve(api);
    };
    const script = document.createElement("script");
    script.src = API_SRC;
    script.async = true;
    script.onerror = () => reject(new Error("Spotify's player script did not load"));
    document.head.append(script);
    /* If the script is blocked by an extension it may never fire either
       handler, and a promise that never settles would hang every album. */
    setTimeout(() => reject(new Error("Spotify's player script timed out")), 6000);
  }).catch((error) => {
    apiPromise = null;
    throw error;
  });
  return apiPromise;
}

let current = null;

export function stop() {
  if (!current) return;
  try {
    current.controller?.pause();
    current.controller?.destroy?.();
  } catch { /* the panel is going away regardless */ }
  current = null;
}

/* Renders the player for one album into `host`, and starts it if sound is on.
   Falls back to the plain embed, unplayed, if the API is unavailable. */
export async function playAlbum(host, item) {
  stop();
  if (!item.spotifyId) return;

  const token = {};
  current = { token, controller: null };

  let api;
  try {
    api = await loadApi();
  } catch {
    fallbackEmbed(host, item);
    return;
  }
  /* The panel may have been closed, or another album opened, while the script
     was loading. Without this the old album would start under the new one. */
  if (current?.token !== token) return;

  const slot = document.createElement("div");
  host.replaceChildren(slot);

  api.createController(
    slot,
    { uri: `spotify:album:${item.spotifyId}`, width: "100%", height: 352 },
    (controller) => {
      if (current?.token !== token) {
        try { controller.destroy?.(); } catch { /* nothing to clean up */ }
        return;
      }
      current.controller = controller;
      if (soundOn()) controller.play();
    }
  );
}

function fallbackEmbed(host, item) {
  const frame = document.createElement("iframe");
  frame.className = "spotify-player";
  frame.src = item.spotifyEmbedUrl;
  frame.title = `Play ${item.title} by ${item.creator} on Spotify`;
  frame.loading = "lazy";
  frame.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
  frame.setAttribute("allowfullscreen", "");
  host.replaceChildren(frame);
}

/* ---------- the switch ---------- */

const SPEAKER = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor"/><path class="sound-wave" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path class="sound-cross" d="M16 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

export function wireSoundToggle(button) {
  if (!button) return;
  button.innerHTML = `${SPEAKER}<span class="sound-toggle-text"></span>`;
  const text = button.querySelector(".sound-toggle-text");

  const paint = (on) => {
    button.classList.toggle("is-off", !on);
    button.setAttribute("aria-pressed", String(on));
    /* The label says what the button will do, not what the state is, which is
       the one thing screen reader users cannot infer from the icon. */
    button.setAttribute("aria-label", on ? "Turn album sound off" : "Turn album sound on");
    text.textContent = on ? "Sound on" : "Sound off";
  };

  paint(soundOn());
  /* setSound notifies every listener, and paint is one of them, so the click
     does not repaint by hand. */
  onSoundChange(paint);
  button.addEventListener("click", () => setSound(!soundOn()));
}

/* Wired here rather than from each page's entry script: library.js imports this
   module and both library pages load library.js, directly or through
   library-lists.js, so one hook covers both without either page knowing. */
const wire = () => wireSoundToggle(document.querySelector("[data-sound-toggle]"));
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
else wire();
