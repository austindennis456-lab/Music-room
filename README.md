# just us. — shared YouTube music room

A small Node.js + Express + Socket.IO website. Anyone with the room URL can join the same queue and control playback.

## Run locally

Requirements: Node.js 18 or newer.

```bash
npm install
npm start
```

Open `http://localhost:3000/?room=just-us` on your computer. To test on two phones, deploy it publicly or use a secure tunnel. Localhost links won't work on someone else's phone.

## Publish a shareable link (Render)

1. Create a GitHub account if you don't already have one.
2. Create a new repository named `just-us-music-room`.
3. Upload the files in this folder to the repository (keep `server.js`, `package.json`, and the `public` folder at the repository root).
4. Sign in to Render and choose **New → Web Service**; connect your GitHub repository.
5. Use these settings:
   - Runtime: **Node**
   - Build command: `npm install`
   - Start command: `npm start`
6. Deploy and wait for Render to provide an HTTPS address such as `https://your-service-name.onrender.com`.
7. Open the address, add `?room=sarah-and-austin` to the end, and open it. Share that exact URL with Sarah. Example:
   `https://your-service-name.onrender.com/?room=sarah-and-austin`

Choose a room name that's easy to share but not personally sensitive. Anyone who knows the URL can join; this starter version has no password or access control.

## How to use

1. Both people open the same room link.
2. Paste a YouTube video URL and choose **Add song**.
3. Tap **Play** once on each phone if the browser requires a user gesture to enable audio.
4. Either person can play/pause, seek, skip, or tap a song in the shared queue.

## Important limitations

- The YouTube IFrame Player is used; playback availability, ads, age/region restrictions, buffering, and browser autoplay rules are controlled by YouTube/browser settings.
- It synchronizes shared playback state and periodically corrects drift, but cannot guarantee perfectly simultaneous sound.
- Some mobile browsers restrict audio while the tab is backgrounded or the phone is locked. Keep the page open for best results.
- Rooms and queues are held in server memory and are lost if the service restarts or sleeps. For a durable production version, add persistent storage.
- This starter version is intended for personal use. Anyone with the room URL can control the queue; there is no account system or moderation.
- Don't use this to re-host or redistribute copyrighted music files. The site embeds YouTube's player.
