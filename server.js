const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok: true }));

// In-memory rooms: suitable for a small personal room. Restarting the server clears them.
const rooms = new Map();
const cleanRoom = (s) => String(s || "just-us").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32) || "just-us";

function getRoom(id) {
  if (!rooms.has(id)) rooms.set(id, {
    queue: [],
    index: 0,
    playing: false,
    position: 0,
    updatedAt: Date.now(),
    revision: 0
  });
  return rooms.get(id);
}
function snapshot(room) {
  return { ...room, position: room.playing ? room.position + (Date.now() - room.updatedAt) / 1000 : room.position };
}
function broadcast(id) {
  const state = getRoom(id);
  // Fold elapsed playback time into position before resetting the clock.
  if (state.playing) state.position += (Date.now() - state.updatedAt) / 1000;
  state.updatedAt = Date.now();
  state.revision += 1;
  io.to(id).emit("room-state", snapshot(state));
}

io.on("connection", (socket) => {
  socket.on("join-room", (rawId) => {
    const id = cleanRoom(rawId);
    if (socket.data.room) socket.leave(socket.data.room);
    socket.data.room = id;
    socket.join(id);
    socket.emit("room-state", snapshot(getRoom(id)));
    socket.emit("room-id", id);
    io.to(id).emit("presence", { count: io.sockets.adapter.rooms.get(id)?.size || 1 });
  });

  socket.on("add-video", (video) => {
    const id = socket.data.room;
    if (!id || !video || !/^[a-zA-Z0-9_-]{11}$/.test(video.id)) return;
    const state = getRoom(id);
    state.queue.push({ id: video.id, title: String(video.title || "YouTube video").slice(0, 120) });
    if (state.queue.length === 1) { state.index = 0; state.position = 0; state.playing = false; }
    broadcast(id);
  });

  socket.on("control", (payload) => {
    const id = socket.data.room;
    if (!id || !payload || typeof payload.action !== "string") return;
    const state = getRoom(id);
    const current = state.queue[state.index];
    switch (payload.action) {
      case "play":
        if (!current) return;
        state.position = Math.max(0, Number(payload.position) || state.position);
        state.playing = true;
        state.updatedAt = Date.now();
        break;
      case "pause":
        state.position = Math.max(0, Number(payload.position) || 0);
        state.playing = false;
        state.updatedAt = Date.now();
        break;
      case "seek":
        state.position = Math.max(0, Number(payload.position) || 0);
        state.updatedAt = Date.now();
        break;
      case "next":
        if (!state.queue.length) return;
        state.index = (state.index + 1) % state.queue.length;
        state.position = 0;
        state.playing = true;
        state.updatedAt = Date.now();
        break;
      case "previous":
        if (!state.queue.length) return;
        state.index = (state.index - 1 + state.queue.length) % state.queue.length;
        state.position = 0;
        state.playing = true;
        state.updatedAt = Date.now();
        break;
      case "play-index":
        if (!Number.isInteger(payload.index) || payload.index < 0 || payload.index >= state.queue.length) return;
        state.index = payload.index;
        state.position = 0;
        state.playing = true;
        state.updatedAt = Date.now();
        break;
      default: return;
    }
    broadcast(id);
  });

  socket.on("disconnect", () => {
    const id = socket.data.room;
    if (id) io.to(id).emit("presence", { count: io.sockets.adapter.rooms.get(id)?.size || 0 });
  });
});

server.listen(PORT, "0.0.0.0", () => console.log(`Just Us Music Room listening on ${PORT}`));