"""
Delhi waterlogging hotspots: geocode the named locations, then seed them
into DynamoDB so they appear as pins on the map.

Usage (from the project root):
    python scripts/hotspots.py geocode   # looks up coordinates, writes prediction/graph/hotspots_delhi.json
    # -> open that JSON and sanity-check each location (see the "check" link)
    python scripts/hotspots.py seed      # writes the reviewed list into DynamoDB

Seeded streets have state "unknown" (no live detection yet) and hotspot=true.
They turn clear / waterlogged / severe once a photo is uploaded for that street_id.

Source of the names: Delhi Traffic Police / PWD / MCD waterlogging-point lists
as reported in news coverage. This is a sample, not the full official list.
"""

import json
import re
import sys
import time
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "prediction" / "graph" / "hotspots_delhi.json"
TABLE_NAME = "neerdrishti-streets"
REGION = "ap-south-1"

HOTSPOTS = [
    "Minto Bridge",
    "Pul Prahladpur Underpass",
    "Zakhira Flyover",
    "Azadpur Underpass",
    "Jahangirpuri Metro Station",
    "Loni Road Golchakkar",
    "Karala Kanjhawala Road",
    "Pragati Maidan Tunnel",
    "ITO Intersection",
    "Barapullah Elevated Road",
    "Sarai Kale Khan",
    "Yamuna Bazar",
    "Khanpur",
    "Kirari",
    "Mundka",
    "Old Rajinder Nagar",
    "Lodhi Road",
    "Sagarpur",
    "Patparganj Mother Dairy",
    "WHO Building Ring Road",
]

# Delhi NCR bounding box: left, top, right, bottom (lon/lat)
VIEWBOX = "76.80,28.95,77.45,28.35"


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def geocode():
    results = []
    for name in HOTSPOTS:
        params = {
            "q": f"{name}, Delhi, India",
            "format": "json",
            "limit": 1,
            "viewbox": VIEWBOX,
            "bounded": 1,
        }
        r = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params=params,
            headers={"User-Agent": "neerdrishti-hackathon/0.1 (student project)"},
            timeout=20,
        )
        hits = r.json() if r.ok else []
        if hits:
            lat, lng = float(hits[0]["lat"]), float(hits[0]["lon"])
            print(f"OK    {name:32s} {lat:.5f}, {lng:.5f}  {hits[0]['display_name'][:60]}")
            results.append({
                "street_id": slug(name),
                "name": name,
                "lat": lat,
                "lng": lng,
                "check": f"https://www.google.com/maps?q={lat},{lng}",
            })
        else:
            print(f"MISS  {name}  (no result - add lat/lng by hand in the JSON)")
            results.append({"street_id": slug(name), "name": name, "lat": None, "lng": None, "check": ""})
        time.sleep(1.1)  # Nominatim policy: max 1 request per second

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(f"\nWrote {OUT}\nOpen it, check each 'check' link, fix any wrong or missing lat/lng, then run: python scripts/hotspots.py seed")


def seed():
    import boto3

    table = boto3.resource("dynamodb", region_name=REGION).Table(TABLE_NAME)
    items = json.loads(OUT.read_text())
    count = 0
    for h in items:
        if h.get("lat") is None or h.get("lng") is None:
            print(f"skip  {h['name']} (no coordinates)")
            continue
        table.put_item(Item={
            "street_id": h["street_id"],
            "name": h["name"],
            "lat": Decimal(str(h["lat"])),
            "lng": Decimal(str(h["lng"])),
            "state": "unknown",
            "confidence": Decimal("0"),
            "reason": "Known waterlogging hotspot - no live detection yet",
            "hotspot": True,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        count += 1
        print(f"seed  {h['street_id']}")
    print(f"\nSeeded {count} hotspots. Refresh the dashboard.")


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in ("geocode", "seed"):
        print("usage: python scripts/hotspots.py geocode | seed")
        sys.exit(1)
    geocode() if sys.argv[1] == "geocode" else seed()