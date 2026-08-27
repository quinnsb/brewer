import {
  onSoundChange,
  setSound,
  soundOn,
  stop as stopAlbum,
} from "./library-sound.js?v=library-player1";
import { libraryPlaylist } from "./library-playlist.js?v=library-player3";

const VOLUME_KEY = "library-player-volume";
const SPEED_KEY = "library-player-speed";
/* The ends of the pitch fader, and the pull of its centre detent. A DJ fader
   rests dead centre and clicks back into it, so anything inside the detent
   reads as exactly normal speed rather than as 0.99. */
const MIN_SPEED = 0.5;
const MAX_SPEED = 1.5;
const SPEED_DETENT = 0.02;
const LAST_START_KEY = "library-player-last-start";
const PLAYBACK_STATE_KEY = "library-player-playback";
const PLAYBACK_HANDOFF_MS = 30000;

const player = document.querySelector("[data-library-player]");

if (player) {
  const playlist = libraryPlaylist.filter((track) =>
    track && typeof track.src === "string" && track.src.trim()
  );
  const audio = new Audio();
  const titles = [...player.querySelectorAll("[data-player-title]")];
  const artists = [...player.querySelectorAll("[data-player-artist]")];
  const disclosure = player.querySelector("[data-player-disclosure]");
  const panel = player.querySelector("[data-player-panel]");
  let hero = document.querySelector("#hero, [data-stream-hero]");
  let revealBoundary = document.getElementById("shelves") || hero?.nextElementSibling;
  const soundButton = player.querySelector("[data-player-sound]");
  const soundText = player.querySelector("[data-player-sound-text]");
  const volume = player.querySelector("[data-player-volume]");
  const speed = player.querySelector("[data-player-speed]");
  const speedText = player.querySelector("[data-player-speed-text]");
  const speedReset = player.querySelector("[data-player-speed-reset]");
  const progress = player.querySelector("[data-player-progress]");
  const currentTime = player.querySelector("[data-player-current-time]");
  const duration = player.querySelector("[data-player-duration]");
  const previousButtons = [...player.querySelectorAll("[data-player-previous]")];
  const playButtons = [...player.querySelectorAll("[data-player-play]")];
  const nextButtons = [...player.querySelectorAll("[data-player-next]")];

  const restored = navigationKind() === "reload" ? null : restoredPlayback();
  const startIndex = restored?.index ?? randomStartIndex();
  const playOrder = restored?.playOrder ?? shuffledOrder(playlist.length, startIndex);
  let orderPosition = restored?.orderPosition ?? 0;
  let index = playOrder[orderPosition] ?? 0;
  let expanded = false;
  let revealFrame = 0;
  let documentRoute = `${location.pathname}${location.search}`;
  let navigating = false;

  audio.preload = "metadata";
  audio.volume = savedVolume();
  volume.value = String(audio.volume);
  paintRange(volume, audio.volume * 100);
  let rate = savedSpeed();

  const hasTracks = playlist.length > 0;
  for (const control of [...previousButtons, ...playButtons, ...nextButtons]) {
    control.disabled = !hasTracks;
  }
  player.classList.toggle("is-empty", !hasTracks);

  function savedVolume() {
    try {
      const saved = localStorage.getItem(VOLUME_KEY);
      if (saved === null) return 0.7;
      const value = Number(saved);
      return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.7;
    } catch {
      return 0.7;
    }
  }

  function storeVolume(value) {
    try {
      localStorage.setItem(VOLUME_KEY, String(value));
    } catch { /* The setting simply lasts for this visit in private mode. */ }
  }

  function savedSpeed() {
    try {
      const saved = Number(localStorage.getItem(SPEED_KEY));
      return Number.isFinite(saved) && saved >= MIN_SPEED && saved <= MAX_SPEED ? saved : 1;
    } catch {
      return 1;
    }
  }

  function storeSpeed(value) {
    try {
      localStorage.setItem(SPEED_KEY, String(value));
    } catch { /* The setting simply lasts for this visit in private mode. */ }
  }

  function randomIndex(exclude = -1) {
    if (playlist.length < 2) return 0;
    let next = exclude;
    while (next === exclude) next = Math.floor(Math.random() * playlist.length);
    return next;
  }

  function randomStartIndex() {
    if (!playlist.length) return 0;
    let previousSrc = "";
    try {
      previousSrc = sessionStorage.getItem(LAST_START_KEY) || "";
    } catch { /* A random start still works when session storage is unavailable. */ }
    const previousIndex = playlist.findIndex((track) => track.src === previousSrc);
    const next = randomIndex(previousIndex);
    try {
      sessionStorage.setItem(LAST_START_KEY, playlist[next].src);
    } catch { /* Nothing needs to persist beyond this load. */ }
    return next;
  }

  function shuffledOrder(length, start) {
    if (!length) return [];
    const rest = Array.from({ length }, (_, itemIndex) => itemIndex)
      .filter((itemIndex) => itemIndex !== start);
    for (let itemIndex = rest.length - 1; itemIndex > 0; itemIndex -= 1) {
      const swapIndex = Math.floor(Math.random() * (itemIndex + 1));
      [rest[itemIndex], rest[swapIndex]] = [rest[swapIndex], rest[itemIndex]];
    }
    return [start, ...rest];
  }

  function navigationKind() {
    try {
      return performance.getEntriesByType("navigation")[0]?.type || "navigate";
    } catch {
      return "navigate";
    }
  }

  function restoredPlayback() {
    let saved;
    try {
      saved = JSON.parse(sessionStorage.getItem(PLAYBACK_STATE_KEY) || "null");
    } catch {
      return null;
    }
    if (!saved || Date.now() - Number(saved.savedAt) > PLAYBACK_HANDOFF_MS) return null;

    const currentIndex = playlist.findIndex((track) => track.src === saved.src);
    if (currentIndex < 0) return null;

    const restoredOrder = Array.isArray(saved.order)
      ? saved.order
          .map((src) => playlist.findIndex((track) => track.src === src))
          .filter((itemIndex, position, order) => itemIndex >= 0 && order.indexOf(itemIndex) === position)
      : [];
    for (const itemIndex of shuffledOrder(playlist.length, currentIndex)) {
      if (!restoredOrder.includes(itemIndex)) restoredOrder.push(itemIndex);
    }

    const restoredPosition = restoredOrder.indexOf(currentIndex);
    const elapsedDuringNavigation = saved.playing
      ? Math.max(0, (Date.now() - Number(saved.savedAt)) / 1000)
      : 0;
    return {
      index: currentIndex,
      playOrder: restoredOrder,
      orderPosition: restoredPosition < 0 ? 0 : restoredPosition,
      currentTime: Math.max(0, Number(saved.currentTime) || 0) + elapsedDuringNavigation,
      playing: Boolean(saved.playing),
    };
  }

  function storePlayback() {
    if (!hasTracks) return;
    try {
      sessionStorage.setItem(PLAYBACK_STATE_KEY, JSON.stringify({
        src: playlist[index].src,
        currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
        playing: !audio.paused && !audio.ended,
        order: playOrder.map((itemIndex) => playlist[itemIndex].src),
        savedAt: Date.now(),
      }));
    } catch { /* Cross-page playback simply falls back to a fresh song. */ }
  }

  function paintSound(on) {
    audio.muted = !on;
    player.classList.toggle("is-sound-off", !on);
    soundButton.setAttribute("aria-pressed", String(on));
    soundButton.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on");
    soundText.textContent = on ? "Sound on" : "Sound off";
  }

  function paintPlayback() {
    const playing = !audio.paused && !audio.ended;
    player.classList.toggle("is-playing", playing);
    for (const button of playButtons) {
      button.setAttribute("aria-label", playing ? "Pause" : "Play");
    }
  }

  function paintTrack() {
    const track = playlist[index];
    for (const title of titles) title.textContent = track?.title || "Song name";
    for (const artist of artists) artist.textContent = track?.artist || "Artist";
  }

  function paintRange(input, percent) {
    const safePercent = Math.min(100, Math.max(0, percent || 0));
    input.style.setProperty("--player-range-progress", `${safePercent}%`);
  }

  /* The fader is drawn out from its centre, so the track needs the two ends of
     the travelled span rather than one fill percentage. */
  function paintCenterRange(input, percent) {
    const safePercent = Math.min(100, Math.max(0, percent));
    input.style.setProperty("--player-range-low", `${Math.min(50, safePercent)}%`);
    input.style.setProperty("--player-range-high", `${Math.max(50, safePercent)}%`);
  }

  /* Speed and pitch move together here, which is the whole point: a record spun
     faster comes out higher, and the browsers correct pitch by default, so the
     correction is turned off. `defaultPlaybackRate` is set alongside the live
     rate because loading the next song resets `playbackRate` back to it. */
  function applySpeed() {
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;
    audio.preservesPitch = false;
    audio.mozPreservesPitch = false;
    audio.webkitPreservesPitch = false;
  }

  function paintSpeed() {
    applySpeed();
    speed.value = String(rate);
    speedText.textContent = `${rate.toFixed(2)}\u00d7`;
    speed.setAttribute("aria-valuetext", `${Math.round(rate * 100)} percent speed`);
    speedReset.setAttribute(
      "aria-label",
      rate === 1 ? "Speed is normal" : "Reset speed to normal"
    );
    player.classList.toggle("is-speed-shifted", rate !== 1);
    paintCenterRange(speed, ((rate - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)) * 100);
  }

  function setSpeed(next) {
    const clamped = Math.min(MAX_SPEED, Math.max(MIN_SPEED, next));
    rate = Math.abs(clamped - 1) < SPEED_DETENT ? 1 : clamped;
    paintSpeed();
    storeSpeed(rate);
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
    const wholeSeconds = Math.floor(seconds);
    return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
  }

  function paintProgress() {
    const total = Number.isFinite(audio.duration) ? audio.duration : 0;
    const elapsed = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    progress.max = String(total);
    progress.value = String(elapsed);
    currentTime.textContent = formatTime(elapsed);
    duration.textContent = total ? formatTime(total) : "--:--";
    paintRange(progress, total ? (elapsed / total) * 100 : 0);
    progress.setAttribute(
      "aria-valuetext",
      total ? `${formatTime(elapsed)} of ${formatTime(total)}` : "Duration unavailable"
    );
  }

  function setExpanded(nextExpanded, returnFocus = false) {
    expanded = nextExpanded;
    player.classList.toggle("is-expanded", expanded);
    disclosure.setAttribute("aria-expanded", String(expanded));
    disclosure.setAttribute("aria-label", expanded ? "Collapse music player" : "Open music player");
    panel.setAttribute("aria-hidden", String(!expanded));
    panel.inert = !expanded;
    if (!expanded && returnFocus) disclosure.focus();
  }

  /* When the player is allowed to appear.

     Two heroes, two shapes. The catalog pages have an ordinary one, as tall as
     it looks, and the section under it arrives when it scrolls away. The
     library home has a 220vh scroll track with a pinned pane inside it, and
     the shelves ride up over that pane rather than following it, so waiting on
     the shelves alone meant a screen and a half of scrolling — most of it with
     book covers already filling the view — before the player turned up.

     So either is enough: a full pane of hero scrolled past, or the first
     section after it reaching the top of the screen. On the home page the
     first fires, on a catalog page the second does, and each page reveals the
     player at the point its own hero is finished rather than at the point the
     other page's would be.

     The 84 is the player's own footprint, its offset plus its height plus a
     gap, so it lands on the new section rather than over the hero's last inch.
     A pane is the hero or the screen, whichever is shorter: that is the pinned
     pane on the home page and the whole hero everywhere else. */
  function updateReveal() {
    revealFrame = 0;
    const heroBox = hero?.getBoundingClientRect();
    const paneHeight = heroBox ? Math.min(heroBox.height, window.innerHeight) : 0;
    const pastPane = heroBox ? heroBox.top <= -paneHeight : true;
    const pastBoundary = revealBoundary
      ? revealBoundary.getBoundingClientRect().top <= 84
      : !heroBox || heroBox.bottom <= 0;
    const pastHero = pastPane || pastBoundary;
    player.classList.toggle("is-revealed", pastHero);
    /* The Menu pill waits on the same moment on the library home. It is worked
       out here rather than twice, and published on the body because the pill is
       site-menu.js's element, not this module's. */
    document.body.classList.toggle("is-past-hero", pastHero);
    if (!pastHero && expanded) setExpanded(false);
  }

  function queueRevealUpdate() {
    if (!revealFrame) revealFrame = requestAnimationFrame(updateReveal);
  }

  function isLibraryRoute(url) {
    if (url.origin !== location.origin) return false;
    const pageName = url.pathname.split("/").pop();
    return pageName === "library.html" || pageName === "library-lists" || pageName === "library-lists.html";
  }

  async function mountLibraryRoute(url, { push = true } = {}) {
    if (navigating) return;
    navigating = true;
    player.classList.remove("is-revealed");
    setExpanded(false);

    try {
      const response = await fetch(url, { headers: { "X-Library-Navigation": "soft" } });
      if (!response.ok) throw new Error(`Library page returned ${response.status}`);
      const incoming = new DOMParser().parseFromString(await response.text(), "text/html");
      const nextChildren = [...incoming.body.children]
        .filter((child) => !child.matches("[data-library-player], script"))
        .map((child) => document.importNode(child, true));

      document.title = incoming.title;
      document.body.className = incoming.body.className;
      document.body.id = incoming.body.id;
      document.body.replaceChildren(player, ...nextChildren);
      if (push) history.pushState({ libraryRoute: true }, "", url);
      documentRoute = `${url.pathname}${url.search}`;

      document.dispatchEvent(new CustomEvent("site-menu:mount"));
      if (document.getElementById("shelves")) {
        const { initLibrary } = await import("./library.js?v=library-continuous2");
        await initLibrary();
      } else {
        const { initLibraryLists } = await import("./library-lists.js?v=library-continuous2");
        await initLibraryLists();
      }

      hero = document.querySelector("#hero, [data-stream-hero]");
      revealBoundary = document.getElementById("shelves") || hero?.nextElementSibling;
      const hashTarget = url.hash ? document.querySelector(url.hash) : null;
      if (hashTarget) hashTarget.scrollIntoView();
      else scrollTo(0, 0);
      updateReveal();
    } catch (error) {
      console.warn(`Continuous library navigation failed: ${error.message}`);
      location.href = url.href;
    } finally {
      navigating = false;
    }
  }

  function loadTrack(nextIndex) {
    if (!hasTracks) return;
    index = (nextIndex + playlist.length) % playlist.length;
    audio.src = playlist[index].src;
    applySpeed();
    paintTrack();
    paintProgress();
    storePlayback();
  }

  async function start() {
    if (!hasTracks) return;
    if (!audio.src) loadTrack(index);
    stopAlbum();
    try {
      await audio.play();
    } catch {
      paintPlayback();
    }
  }

  function adjacent(direction, keepPlaying = !audio.paused && !audio.ended) {
    if (!hasTracks) return;
    orderPosition = (orderPosition + direction + playOrder.length) % playOrder.length;
    loadTrack(playOrder[orderPosition]);
    if (keepPlaying) start();
  }

  paintSound(soundOn());
  paintSpeed();
  paintTrack();
  paintPlayback();
  paintProgress();
  setExpanded(false);
  updateReveal();
  onSoundChange(paintSound);

  disclosure.addEventListener("click", () => setExpanded(!expanded));
  soundButton.addEventListener("click", () => setSound(!soundOn()));
  volume.addEventListener("input", () => {
    const value = Number(volume.value);
    audio.volume = value;
    storeVolume(value);
    paintRange(volume, value * 100);
    setSound(value > 0);
    storePlayback();
  });
  speed.addEventListener("input", () => setSpeed(Number(speed.value)));
  speed.addEventListener("dblclick", () => setSpeed(1));
  speedReset.addEventListener("click", () => setSpeed(1));
  progress.addEventListener("input", () => {
    if (!Number.isFinite(audio.duration)) return;
    audio.currentTime = Number(progress.value);
    paintProgress();
    storePlayback();
  });
  for (const button of playButtons) {
    button.addEventListener("click", () => {
      if (audio.paused || audio.ended) start();
      else audio.pause();
    });
  }
  for (const button of previousButtons) button.addEventListener("click", () => adjacent(-1));
  for (const button of nextButtons) button.addEventListener("click", () => adjacent(1));

  audio.addEventListener("play", () => {
    paintPlayback();
    storePlayback();
  });
  audio.addEventListener("pause", () => {
    paintPlayback();
    storePlayback();
  });
  /* Anything that reloads the element can hand the rate back to 1, so the
     fader's position is re-asserted rather than trusted. */
  audio.addEventListener("loadstart", applySpeed);
  audio.addEventListener("ratechange", () => {
    if (audio.playbackRate !== rate) applySpeed();
  });
  audio.addEventListener("timeupdate", paintProgress);
  audio.addEventListener("loadedmetadata", paintProgress);
  audio.addEventListener("durationchange", paintProgress);
  audio.addEventListener("ended", () => adjacent(1, true));
  audio.addEventListener("error", paintPlayback);
  window.addEventListener("library:album-play", () => audio.pause());
  document.addEventListener("pointerdown", (event) => {
    const menuHit = event.target.closest?.(".menu-btn, .menu-bar, .menu-dock");
    if (expanded && !player.contains(event.target) && !menuHit) setExpanded(false);
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest?.(".menu-btn")) setExpanded(false);
  });
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.("a[href]");
    if (!link || link.target || link.hasAttribute("download")) return;
    const url = new URL(link.href, location.href);
    const nextRoute = `${url.pathname}${url.search}`;
    if (!isLibraryRoute(url) || nextRoute === documentRoute || audio.paused || audio.ended) return;
    event.preventDefault();
    mountLibraryRoute(url);
  });
  document.addEventListener("keydown", (event) => {
    if (expanded && event.key === "Escape") setExpanded(false, true);
  });
  window.addEventListener("pagehide", storePlayback);
  window.addEventListener("scroll", queueRevealUpdate, { passive: true });
  window.addEventListener("resize", queueRevealUpdate, { passive: true });
  window.addEventListener("popstate", () => {
    const nextRoute = `${location.pathname}${location.search}`;
    if (nextRoute !== documentRoute && isLibraryRoute(new URL(location.href))) {
      mountLibraryRoute(new URL(location.href), { push: false });
    }
  });

  if (hasTracks) {
    if (restored) {
      audio.preload = "auto";
      audio.addEventListener("loadedmetadata", () => {
        audio.currentTime = Math.min(restored.currentTime, Math.max(0, audio.duration - 0.1));
        paintProgress();
        if (restored.playing) start();
      }, { once: true });
    }
    loadTrack(index);
  }
}
