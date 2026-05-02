from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from data import HERO_SLIDES, AUCTIONS_DATA, SIDEBAR_LIST, LOTS_DATA, DETAIL

app = FastAPI()

# Allow CORS for Next.js development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/hero")
def get_hero():
    return HERO_SLIDES

@app.get("/api/auctions")
def get_auctions():
    return AUCTIONS_DATA

@app.get("/api/sidebar")
def get_sidebar():
    return SIDEBAR_LIST

@app.get("/api/lots")
def get_lots():
    return LOTS_DATA

@app.get("/api/lots/{lot_id}")
def get_lot(lot_id: int):
    # If the requested lot_id matches the DETAIL mock id, return it, else return detail as default
    if lot_id == DETAIL["id"]:
        return DETAIL
    
    # Normally we'd look up the lot, but for now we just mock the returned detail.
    # We can override the ID to match what was requested.
    custom_detail = DETAIL.copy()
    custom_detail["id"] = lot_id
    # Find matching title if exists in LOTS_DATA
    lot = next((l for l in LOTS_DATA if l["id"] == lot_id), None)
    if lot:
        custom_detail["title"] = lot["title"]
        custom_detail["price"] = lot["price"]
        custom_detail["bids"] = lot["bids"]
        custom_detail["grade"] = lot["grade"]
        custom_detail["gradeLabel"] = lot["gradeLabel"]
        custom_detail["set"] = lot["set"]
        custom_detail["premium"] = lot["price"] + 105
        
    return custom_detail
