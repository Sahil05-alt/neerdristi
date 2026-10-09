"""
GET /streets                     -> every street with its state AND a computed flood risk (uses live Delhi rainfall)
GET /streets?rain=<mm per hour>  -> same, but with simulated rainfall
GET /streets/{street_id}          -> one street

Risk is a simple, explainable model (not a hydraulic simulation):

  risk = 0.15                           every monitored point is a known waterlogging spot
       + 0.50 * min(rain / 50, 1)       rainfall intensity (rain param, mm/hr)
       + up to 0.15                     low-lying compared with points within 5 km
       + up to 0.35                     a flooded point within 3 km (stronger if this one is lower)
  then evidence overrides it:
       severe detection      -> 1.0
       waterlogged detection -> at least 0.8
       clear detection       -> risk * 0.6
  Detections older than STALE_HOURS are ignored for risk (still shown as state).
"""

import os
import json
import math
import time
import urllib.request
import boto3
from decimal import Decimal
from datetime import datetime, timezone

TABLE_NAME = os.environ["TABLE_NAME"]
table = boto3.resource("dynamodb").Table(TABLE_NAME)

STALE_HOURS = 12
NEIGHBOUR_KM = 3.0
LOW_LYING_KM = 5.0


# Live rainfall for Delhi from Open-Meteo (free, no key). Model estimate, not a rain-gauge reading.
# Value = precipitation over the preceding hour in mm, i.e. effectively mm/hr. Cached 5 minutes.
_LIVE = {"t": 0.0, "v": None}


def live_rain_mm_hr():
    now = time.time()
    if _LIVE["v"] is not None and now - _LIVE["t"] < 300:
        return _LIVE["v"]
    try:
        url = ("https://api.open-meteo.com/v1/forecast"
               "?latitude=28.6139&longitude=77.2090&current=precipitation&timezone=UTC")
        with urllib.request.urlopen(url, timeout=3) as r:
            data = json.loads(r.read())
        _LIVE["v"] = float(data["current"]["precipitation"])
        _LIVE["t"] = now
    except Exception as e:
        print(f"[streets_api] live rainfall unavailable: {e}")
    return _LIVE["v"]  # None if we have never succeeded


def haversine_km(lat1, lng1, lat2, lng2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def age_hours(iso):
    try:
        t = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - t).total_seconds() / 3600
    except Exception:
        return 1e9


def compute_risk(streets, rain=0.0):
    rain_factor = min(max(rain, 0.0) / 50.0, 1.0)
    fresh = lambda s: age_hours(s.get("updated_at", "")) <= STALE_HOURS
    flooded = [s for s in streets
               if s.get("state") in ("waterlogged", "severe") and fresh(s) and s.get("lat") and s.get("lng")]

    for s in streets:
        reasons = ["known waterlogging spot"]
        risk = 0.15

        if rain_factor > 0:
            risk += 0.5 * rain_factor
            reasons.append(f"rainfall {rain:.0f} mm/hr")

        elev = s.get("elevation")
        if elev is not None and s.get("lat") and s.get("lng"):
            near = [t["elevation"] for t in streets
                    if t is not s and t.get("elevation") is not None and t.get("lat") and t.get("lng")
                    and haversine_km(s["lat"], s["lng"], t["lat"], t["lng"]) <= LOW_LYING_KM]
            if near:
                diff = sum(near) / len(near) - elev
                if diff > 0:
                    risk += min(diff / 10.0, 1.0) * 0.15
                    reasons.append("low-lying vs nearby points")

        boost, source = 0.0, None
        for t in flooded:
            if t is s or not (s.get("lat") and s.get("lng")):
                continue
            d = haversine_km(s["lat"], s["lng"], t["lat"], t["lng"])
            if d > NEIGHBOUR_KM:
                continue
            if elev is not None and t.get("elevation") is not None:
                ef = 1.0 if elev <= t["elevation"] + 2 else 0.5
            else:
                ef = 0.7
            b = (0.35 if t["state"] == "severe" else 0.25) * (1 - d / NEIGHBOUR_KM) * ef
            if b > boost:
                boost, source = b, t
        if boost > 0:
            risk += boost
            reasons.append(f"flooding detected {source.get('name') or source['street_id']} nearby")

        state = s.get("state")
        if fresh(s):
            if state == "severe":
                risk, reasons = 1.0, ["severe flooding detected here"]
            elif state == "waterlogged":
                risk = max(risk, 0.8)
                reasons.insert(0, "waterlogging detected here")
            elif state == "clear":
                risk *= 0.6
                reasons.append("camera shows clear")

        risk = max(0.0, min(1.0, risk))
        s["risk"] = round(risk, 2)
        s["risk_level"] = "low" if risk < 0.35 else "medium" if risk < 0.65 else "high"
        s["risk_reasons"] = reasons
    return streets


def lambda_handler(event, context):
    path_params = event.get("pathParameters") or {}
    qs = event.get("queryStringParameters") or {}
    if "rain" in qs:
        # simulation: the dashboard slider overrides live data
        try:
            rain = max(0.0, min(150.0, float(qs["rain"])))
        except ValueError:
            rain = 0.0
        rain_source = "simulated"
    else:
        live = live_rain_mm_hr()
        if live is None:
            rain, rain_source = 0.0, "unavailable"
        else:
            rain, rain_source = max(0.0, min(150.0, live)), "live"

    street_id = path_params.get("street_id")
    if street_id:
        item = table.get_item(Key={"street_id": street_id}).get("Item")
        if not item:
            return _response(404, {"error": "street not found"})
        return _response(200, _clean(item))

    resp = table.scan()
    items = resp.get("Items", [])
    while "LastEvaluatedKey" in resp:
        resp = table.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        items.extend(resp.get("Items", []))

    streets = compute_risk([_clean(i) for i in items], rain)
    return _response(200, {"count": len(streets), "rain_mm_hr": rain, "rain_source": rain_source, "streets": streets})


def _clean(item):
    return {k: (float(v) if isinstance(v, Decimal) else v) for k, v in item.items()}


def _response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body),
    }