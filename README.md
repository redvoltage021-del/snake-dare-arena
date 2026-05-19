# Black Phoenix Portal

Browser game portal with:

- `Snake Dare Arena` for arcade survival and room-code multiplayer
- `Bagh-Chal` for traditional strategy, AI, and new live two-player team-code matches

## Run locally

1. Install Node.js 18 or newer.
2. Run `npm install`
3. Run `npm start`
4. Open `http://localhost:3000`
5. Use:
   - `http://localhost:3000/` for the portal
   - `http://localhost:3000/snake` for Snake
   - `http://localhost:3000/bagh-chal` for Bagh-Chal

## Split Deploy: Vercel + Render

Recommended production setup:

- `Vercel` hosts the frontend pages
- `Render` hosts the Express + Socket.io backend

### 1. Deploy the backend to Render

Use the included `render.yaml`, or create a Node web service manually with:

- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

The default frontend runtime config expects the Render backend at:

- `https://snake-lodu.onrender.com`

If your real Render URL changes, update:

- `public/js/backendConfig.js`

### 2. Deploy the frontend to Vercel

The Vercel frontend should use:

- Project root directory: `public`
- Framework preset: `Other`

The frontend folder already contains:

- `public/vercel.json` for route rewrites
- `public/shared/*` for browser-safe shared modules
- `public/js/backendConfig.js` for the Render backend origin

Once the frontend is on Vercel, Snake and Bagh-Chal will load their realtime/API backend from the Render service automatically through `public/js/backendConfig.js`.

Current live frontend:

- `https://black-phoenix-frontend.vercel.app`

## Features

- Solo snake gameplay on an HTML canvas grid
- Dynamic dare system with score, survival, and turn-restriction challenges
- Power-ups: speed boost, shield, and double score
- Multiplayer snake rooms with live syncing and snake-vs-snake collisions
- Bagh-Chal local, AI, and online team-code matches for two players
- In-memory leaderboard API for the snake backend
