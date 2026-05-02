# Kepler — Pokémon Card Marketplace

## Overview
A Pokémon card auction/marketplace app. The frontend is a single-page React app served via CDN scripts in `index.html`. The backend is a FastAPI Python service that exposes REST API endpoints for auction data.

## Architecture
- **Frontend**: `index.html` — self-contained single-page React app (CDN React 18, Babel standalone, no build step)
- **Backend**: `backend/` — FastAPI Python app with mock data in `data.py`
- **Server**: `server.py` — Combined FastAPI app serving both the static `index.html` at `/` and the API at `/api/*`

## Running the App
The single workflow (`Start application`) runs:
```
uvicorn server:app --host 0.0.0.0 --port 5000
```

## API Endpoints
- `GET /api/hero` — Hero slider data
- `GET /api/auctions` — Auction listings
- `GET /api/sidebar` — Sidebar auction list
- `GET /api/lots` — All lots
- `GET /api/lots/{lot_id}` — Single lot detail

## Key Files
- `index.html` — Full frontend (React + styles + logic)
- `server.py` — Combined server entry point
- `backend/main.py` — Original FastAPI app (standalone, not used directly)
- `backend/data.py` — Mock data for all API endpoints

## Dependencies
- Python: `fastapi`, `uvicorn` (installed via pip)
- Frontend: React 18, Babel (loaded from CDN, no npm)

## Deployment
Configured for autoscale deployment running `uvicorn server:app --host 0.0.0.0 --port 5000`
