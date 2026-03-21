# Snake Dare Arena

Browser-based snake game with solo challenges, power-ups, and Socket.io multiplayer rooms.

## Run locally

1. Install Node.js 18 or newer.
2. Run `npm install`
3. Run `npm start`
4. Open `http://localhost:3000`

## Deploy online on Render

Use the one-click button below after you create your Render account:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/redvoltage021-del/snake-dare-arena)

Manual path:

1. Sign in to Render and connect your GitHub account.
2. Create a new Blueprint or Web Service from `redvoltage021-del/snake-dare-arena`.
3. Render can use the included `render.yaml`, or you can enter these settings manually:
   - Runtime: `node`
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Health Check Path: `/health`
4. After deploy finishes, Render gives you a public `onrender.com` URL.
5. Share that URL with other players, then anyone can open it and join rooms.

Notes:
- This app already reads Render's `PORT` automatically.
- The server now binds to `0.0.0.0`, which Render requires for public web services.
- The leaderboard is currently in memory, so online scores reset if the service restarts.

## Features

- Solo snake gameplay on an HTML canvas grid
- Dynamic dare system with score, survival, and turn-restriction challenges
- Power-ups: speed boost, shield, and double score
- Multiplayer rooms with live snake syncing and snake-vs-snake collisions
- In-memory leaderboard API
