#!/usr/bin/env python3
"""
Rounds poller. Runs on the Beelink under ~/apps/rounds-poller.

Every 10 minutes:
  1. Route: rows with coordinates and no routed_at (or routed over 30 days ago)
     get moped / bike / drive minutes from home via the local Valhalla
     (motor_scooter, bicycle, auto costings). Google has no two-wheeler mode in
     the US, which is the whole reason Valhalla exists on this box.
  2. Refresh: rows whose Google cache is over 7 days old get hours, price and
     business status again, if GOOGLE_KEY (an IP-restricted server key) is set.
     Without it the browser does the same refresh, just spread across opens.

Env (rounds.env, chmod 600):
  SUPABASE_URL, SUPABASE_SERVICE_KEY   service role, bypasses RLS on purpose
  VALHALLA_URL=http://127.0.0.1:8002
  HOME_LAT=40.729  HOME_LNG=-73.954
  GOOGLE_KEY=                           optional
  INTERVAL=600
"""
import json, os, sys, time, urllib.request, urllib.error, urllib.parse
from datetime import datetime, timezone, timedelta

def env(k, d=None):
    v = os.environ.get(k, d)
    if v is None: sys.exit(f"missing env {k}")
    return v

SB = env("SUPABASE_URL").rstrip("/")
SK = env("SUPABASE_SERVICE_KEY")
VALHALLA = env("VALHALLA_URL", "http://127.0.0.1:8002")
HOME = (float(env("HOME_LAT", "40.729")), float(env("HOME_LNG", "-73.954")))
GKEY = os.environ.get("GOOGLE_KEY", "")
INTERVAL = int(env("INTERVAL", "600"))

def log(*a): print(datetime.now(timezone.utc).strftime("%H:%M:%S"), *a, flush=True)

def sb(method, path, body=None, prefer=None):
    req = urllib.request.Request(f"{SB}/rest/v1/{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": SK, "Authorization": f"Bearer {SK}", "Content-Type": "application/json",
                 **({"Prefer": prefer} if prefer else {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            t = r.read().decode()
            return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{e.code} {path[:80]}: {e.read().decode()[:200]}") from None

def valhalla_minutes(lat, lng, costing):
    body = {"locations": [{"lat": HOME[0], "lon": HOME[1]}, {"lat": lat, "lon": lng}],
            "costing": costing, "units": "miles"}
    req = urllib.request.Request(f"{VALHALLA}/route", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        j = json.load(r)
    return round(j["trip"]["summary"]["time"] / 60)

def route_pass():
    cutoff = urllib.parse.quote((datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ"), safe="")
    rows = sb("GET", f"rounds_places?select=id,name,lat,lng,routed_at&lat=not.is.null&or=(routed_at.is.null,routed_at.lt.{cutoff})&limit=40")
    for r in rows or []:
        try:
            patch = {"moped_min": valhalla_minutes(r["lat"], r["lng"], "motor_scooter"),
                     "bike_min": valhalla_minutes(r["lat"], r["lng"], "bicycle"),
                     "drive_min": valhalla_minutes(r["lat"], r["lng"], "auto"),
                     "routed_at": datetime.now(timezone.utc).isoformat()}
            sb("PATCH", f"rounds_places?id=eq.{r['id']}", patch, prefer="return=minimal")
            log("routed", r["name"], patch["moped_min"], "min moped")
        except Exception as e:
            log("route failed", r["name"], e)

def google_details(pid):
    req = urllib.request.Request(f"https://places.googleapis.com/v1/places/{pid}", headers={
        "X-Goog-Api-Key": GKEY,
        "X-Goog-FieldMask": "id,businessStatus,googleMapsUri,priceLevel,regularOpeningHours,websiteUri,location"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def refresh_pass():
    if not GKEY: return
    cutoff = urllib.parse.quote((datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ"), safe="")
    rows = sb("GET", f"rounds_places?select=id,name,google_place_id,google&google_place_id=not.is.null&or=(google->>fetched_at.is.null,google->>fetched_at.lt.{cutoff})&limit=30")
    for r in rows or []:
        try:
            d = google_details(r["google_place_id"])
            g = {"fetched_at": datetime.now(timezone.utc).isoformat(),
                 "periods": (d.get("regularOpeningHours") or {}).get("periods"),
                 "weekday": (d.get("regularOpeningHours") or {}).get("weekdayDescriptions"),
                 "price": d.get("priceLevel"), "maps_uri": d.get("googleMapsUri"), "website": d.get("websiteUri")}
            patch = {"google": g, "business_status": d.get("businessStatus")}
            if d.get("location"): patch.update(lat=d["location"]["latitude"], lng=d["location"]["longitude"])
            sb("PATCH", f"rounds_places?id=eq.{r['id']}", patch, prefer="return=minimal")
            log("refreshed", r["name"], d.get("businessStatus"))
            if d.get("businessStatus") == "CLOSED_PERMANENTLY": log("CLOSED FOR GOOD:", r["name"])
        except Exception as e:
            log("refresh failed", r["name"], e)
        time.sleep(0.3)

if __name__ == "__main__":
    once = "--once" in sys.argv
    while True:
        try:
            route_pass(); refresh_pass()
        except Exception as e:
            log("pass failed", e)
        if once: break
        time.sleep(INTERVAL)
