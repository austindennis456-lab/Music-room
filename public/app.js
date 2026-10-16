const socket = io();
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let roomId = (params.get("room") || "just-us").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32) || "just-us";
let roomState = { queue: [], index: 0, playing: false, position: 0 };
let player = null, playerReady = false, hasJoinedAudio = false;
let suppressPlayerEvents = false, lastAppliedRevision = -1, seekTimer = null, progressTimer = null, toastTimer = null;

function toast(message) {
  $("toast").textContent = message; $("toast").classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2800);
}
function formatTime(n) { n = Math.max(0, Math.floor(Number(n) || 0)); return `${Math.floor(n/60)}:${String(n%60).padStart(2,"0")}`; }
function getPosition() {
  if (playerReady && player && typeof player.getCurrentTime === "function") {
    try { const t = player.getCurrentTime(); if (Number.isFinite(t)) return t; } catch (_) {}
  }
  return roomState.position || 0;
}
function currentVideo() { return roomState.queue?.[roomState.index] || null; }
function parseYouTubeId(raw) {
  try {
    const u = new URL(raw);
    if (u.hostname === "youtu.be" || u.hostname.endsWith(".youtu.be")) return u.pathname.split("/").filter(Boolean)[0] || null;
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtube-nocookie.com")) {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const bits = u.pathname.split("/").filter(Boolean);
      if (["embed","shorts","live"].includes(bits[0])) return bits[1] || null;
    }
  } catch (_) {}
  return null;
}
function render() {
  const video = currentVideo();
  $("roomLabel").textContent = roomId;
  $("nowTitle").textContent = video ? video.title : "Add a song to begin";
  $("trackName").textContent = video ? video.title : "Nothing playing yet";
  $("playStatus").textContent = video ? (roomState.playing ? "Playing in your shared room" : "Ready when you are") : "Your room is waiting";
  $("playBtn").textContent = roomState.playing ? "Ⅱ" : "▶";
  $("queueCount").textContent = `${roomState.queue.length} song${roomState.queue.length === 1 ? "" : "s"}`;
  const queue = $("queue"); queue.innerHTML = "";
  if (!roomState.queue.length) {
    queue.innerHTML = '<div class="empty"><span>♫</span><p>Your shared queue will appear here.</p></div>';
  } else {
    roomState.queue.forEach((song, i) => {
      const row = document.createElement("div");
      row.className = "song" + (i === roomState.index ? " active" : "");
      row.innerHTML = `<span class="song-num">${i === roomState.index && roomState.playing ? "♫" : String(i+1).padStart(2,"0")}</span><span class="song-title"></span><span class="song-state">${i === roomState.index ? (roomState.playing ? "PLAYING" : "CURRENT") : "PLAY"}</span>`;
      row.querySelector(".song-title").textContent = song.title;
      row.addEventListener("click", () => socket.emit("control", { action: "play-index", index: i }));
      queue.appendChild(row);
    });
  }
}
function applyState(state) {
  if (!state) return;
  const changedVideo = roomState.queue?.[roomState.index]?.id !== state.queue?.[state.index]?.id;
  roomState = state;
  render();
  if (!playerReady || !player) return;
  const video = currentVideo();
  if (!video) { try { player.stopVideo(); } catch (_) {} return; }
  if (!hasJoinedAudio) {
    $("syncNote").textContent = "Tap play once to enable audio on this phone.";
    return;
  }
  const target = Math.max(0, state.position || 0) + (state.playing ? 0.35 : 0);
  suppressPlayerEvents = true;
  try {
    const loadedId = player.getVideoData()?.video_id;
    if (changedVideo || loadedId !== video.id) {
      if (state.playing) player.loadVideoById({ videoId: video.id, startSeconds: target });
      else player.cueVideoById({ videoId: video.id, startSeconds: target });
    } else {
      const now = player.getCurrentTime();
      if (Math.abs(now - target) > 2.5) player.seekTo(target, true);
      if (state.playing) player.playVideo(); else player.pauseVideo();
    }
  } catch (_) {}
  lastAppliedRevision = state.revision ?? lastAppliedRevision;
  setTimeout(() => { suppressPlayerEvents = false; }, 700);
  $("syncNote").textContent = "Playback is shared. Small delays can happen on YouTube.";
}
window.onYouTubeIframeAPIReady = function () {
  player = new YT.Player("youtubePlayer", {
    width: "1", height: "1", videoId: "",
    playerVars: { playsinline: 1, controls: 0, rel: 0, enablejsapi: 1 },
    events: {
      onReady: () => { playerReady = true; if (roomState.queue.length) applyState(roomState); },
      onStateChange: (event) => {
        if (suppressPlayerEvents || !currentVideo()) return;
        if (event.data === YT.PlayerState.PLAYING) {
          socket.emit("control", { action: "play", position: getPosition() });
        } else if (event.data === YT.PlayerState.PAUSED && hasJoinedAudio) {
          socket.emit("control", { action: "pause", position: getPosition() });
        } else if (event.data === YT.PlayerState.ENDED) {
          socket.emit("control", { action: "next" });
        }
      },
      onError: () => toast("This video can't play here. Try another YouTube link.")
    }
  });
};
socket.on("connect", () => {
  $("connectionText").textContent = "Connected";
  $("connectionDot").classList.add("on");
  socket.emit("join-room", roomId);
});
socket.on("disconnect", () => {
  $("connectionText").textContent = "Reconnecting…";
  $("connectionDot").classList.remove("on");
});
socket.on("room-id", id => {
  roomId = id; $("roomLabel").textContent = id;
  const u = new URL(location.href); u.searchParams.set("room", id); history.replaceState({}, "", u);
});
socket.on("room-state", state => applyState(state));
socket.on("presence", data => {
  $("connectionText").textContent = data.count > 1 ? `${data.count} in room` : "You're here";
});

$("addForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const raw = $("youtubeUrl").value.trim();
  const id = parseYouTubeId(raw);
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) { toast("Paste a valid YouTube video link."); return; }
  let title = "YouTube video";
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent("https://www.youtube.com/watch?v="+id)}&format=json`);
    if (response.ok) { const data = await response.json(); title = data.title || title; }
  } catch (_) {}
  socket.emit("add-video", { id, title });
  $("youtubeUrl").value = "";
  toast("Song added to your shared queue.");
});
$("playBtn").addEventListener("click", () => {
  if (!currentVideo()) { toast("Add a YouTube song first."); return; }
  hasJoinedAudio = true;
  if (playerReady && player) {
    if (roomState.playing) {
      const position = getPosition();
      socket.emit("control", { action: "pause", position });
    } else {
      socket.emit("control", { action: "play", position: getPosition() });
      try { player.playVideo(); } catch (_) {}
    }
    $("syncNote").textContent = "This phone is ready to listen with the room.";
    applyState({ ...roomState, playing: !roomState.playing, position: getPosition() });
  } else {
    socket.emit("control", { action: "play", position: roomState.position || 0 });
    toast("Player is loading. Tap play again in a moment.");
  }
});
$("nextBtn").addEventListener("click", () => { hasJoinedAudio = true; socket.emit("control", { action: "next" }); if (playerReady) setTimeout(() => applyState(roomState), 200); });
$("prevBtn").addEventListener("click", () => { hasJoinedAudio = true; socket.emit("control", { action: "previous" }); if (playerReady) setTimeout(() => applyState(roomState), 200); });
$("seek").addEventListener("input", () => {
  const duration = playerReady ? player.getDuration() : 0;
  $("elapsed").textContent = formatTime(duration * Number($("seek").value) / 100);
});
$("seek").addEventListener("change", () => {
  if (!playerReady || !currentVideo()) return;
  const duration = player.getDuration() || 0;
  const position = duration * Number($("seek").value) / 100;
  socket.emit("control", { action: "seek", position });
  try { player.seekTo(position, true); } catch (_) {}
});
$("shareBtn").addEventListener("click", async () => {
  const link = location.href;
  try {
    if (navigator.share) await navigator.share({ title: "just us. — shared music room", text: "Join my shared music room 🎧", url: link });
    else if (navigator.clipboard) { await navigator.clipboard.writeText(link); toast("Room link copied. Send it to Sarah."); }
    else { prompt("Copy your room link:", link); }
  } catch (err) { if (err.name !== "AbortError") toast("Copy the link from your browser's address bar."); }
});
setInterval(() => {
  const duration = playerReady && player ? player.getDuration() || 0 : 0;
  const pos = playerReady && player ? getPosition() : roomState.position || 0;
  $("elapsed").textContent = formatTime(pos);
  $("duration").textContent = formatTime(duration);
  if (duration > 0 && !$("seek").matches(":active")) $("seek").value = String(Math.min(100, pos / duration * 100));
}, 500);

// Keep a late-joining listener aligned when they tap the player after the room has started.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && playerReady && hasJoinedAudio) applyState(roomState);
});
