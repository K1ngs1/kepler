import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from data import HERO_SLIDES, AUCTIONS_DATA, SIDEBAR_LIST, LOTS_DATA, DETAIL

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    if lot_id == DETAIL["id"]:
        return DETAIL
    custom_detail = DETAIL.copy()
    custom_detail["id"] = lot_id
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

@app.get("/")
def serve_index():
    return FileResponse("index.html")
