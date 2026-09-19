#!/usr/bin/env python3
"""
Happy hours for Rounds. No API exists for this anywhere, so three aggregators
are read and the best available answer is written to rounds_places.happy_hour.

  1. happy-hour.nyc     verified, human-written, ~19 neighborhood pages with
                        ld+json venue lists; the venue page says
                        "Happy hour runs Daily 5pm–7pm." plus the deal.
  2. 5pm.nyc            one bars.json, 2,600 bars WITH Google place_id, so the
                        match is exact. `source` = website/claimed/socials/
                        user_reported/photo are real; `estimated` is a guess
                        and is written with an "est." prefix.
  3. happierhournyc.com per-neighborhood server HTML, schedule in <dl>.

Priority per place: happy-hour.nyc > 5pm.nyc (real) > happierhour > 5pm.nyc (estimated).
A row whose happy_hour_source is 'manual' is never touched: what Nate typed
from the chalkboard beats every aggregator.

Dry run: python3 rounds_hh.py --dry places.json  (a JSON array of rows with
id, name, hood, google_place_id, lat, lng, happy_hour, happy_hour_source)
"""
import json, re, html, sys, time, unicodedata, urllib.request
from datetime import datetime, timezone

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"

def norm(t):
    t = unicodedata.normalize("NFKD", html.unescape(t or "")).encode("ascii", "ignore").decode().lower()
    t = re.sub(r"^the\s+", "", t)
    t = re.sub(r"\s+(bar|nyc|brooklyn|restaurant)$", "", t)
    return re.sub(r"[^a-z0-9]", "", t)

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "replace")

def tidy(s):
    """'Mon–Fri 4–6PM' -> 'Mon to Fri 4 to 6p'."""
    s = html.unescape(s or "").replace("–", " to ").replace("—", " to ").replace(" - ", " to ")
    s = re.sub(r"(\d)\s*(?:PM|pm)", r"\1p", s); s = re.sub(r"(\d)\s*(?:AM|am)", r"\1a", s)
    s = re.sub(r"\s+", " ", s).strip(" .,")
    return s

# ---------- happy-hour.nyc ----------
HHNYC_HOODS = {  # our hood name -> their slug
    "Williamsburg": "brooklyn/williamsburg-happy-hour", "Bushwick": "brooklyn/bushwick-happy-hour",
    "Gowanus": "brooklyn/gowanus-happy-hour", "Park Slope": "brooklyn/park-slope-happy-hour",
    "Downtown Brooklyn": "brooklyn/downtown-brooklyn-happy-hour", "Ridgewood": "queens/ridgewood-happy-hour",
    "Astoria": "queens/astoria-happy-hour", "Long Island City": "queens/long-island-city-happy-hour",
    "East Village": "manhattan/east-village-happy-hour", "West Village": "manhattan/west-village-happy-hour",
    "Greenwich Village": "manhattan/west-village-happy-hour", "Lower East Side": "manhattan/lower-east-side-happy-hour",
    "LES": "manhattan/lower-east-side-happy-hour", "SoHo": "manhattan/soho-happy-hour", "Tribeca": "manhattan/tribeca-happy-hour",
    "Financial District": "manhattan/fidi-happy-hour", "FiDi": "manhattan/fidi-happy-hour", "Flatiron": "manhattan/flatiron-happy-hour",
    "Midtown": "manhattan/midtown-happy-hour", "Upper East Side": "manhattan/upper-east-side-happy-hour",
    "Upper West Side": "manhattan/upper-west-side-happy-hour",
}

def hhnyc_index(hoods):
    """norm(name) -> venue url, for the neighborhoods we care about."""
    idx = {}
    for slug in sorted({HHNYC_HOODS[h] for h in hoods if h in HHNYC_HOODS}):
        try:
            page = fetch("https://happy-hour.nyc/" + slug)
        except Exception:
            continue
        for j in re.findall(r'<script type="application/ld\+json">(.*?)</script>', page, re.S):
            try: d = json.loads(j)
            except Exception: continue
            for x in (d.get("@graph", [d]) if isinstance(d, dict) else d):
                if x.get("@type") != "ItemList": continue
                for li in x.get("itemListElement", []):
                    it = li.get("item", {})
                    if it.get("name") and it.get("url"): idx[norm(it["name"])] = it["url"]
        time.sleep(0.4)
    return idx

def hhnyc_venue(url):
    page = fetch(url)
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", page, flags=re.S)
    t = html.unescape(re.sub(r"<[^>]+>", "\n", t))
    lines = [l.strip() for l in t.split("\n") if l.strip()]
    when = next((m.group(1) for l in lines for m in [re.search(r"Happy hour runs (.+?)\.", l)] if m), None)
    if not when: return None
    deal = ""
    for i, l in enumerate(lines):
        if l.startswith("Happy hour runs"):
            nxt = lines[i + 1] if i + 1 < len(lines) else ""
            if re.search(r"\$|off|free", nxt, re.I) and len(nxt) < 90: deal = nxt
            break
    return (tidy(when) + (", " + deal if deal else ""), "happy-hour.nyc")

# ---------- 5pm.nyc ----------
def fivepm_index():
    d = json.loads(fetch("https://5pm.nyc/bars.json"))
    bars = d if isinstance(d, list) else next(v for v in d.values() if isinstance(v, list))
    by_pid, by_name = {}, {}
    for b in bars:
        if b.get("place_id"): by_pid[b["place_id"]] = b
        by_name.setdefault(norm(b.get("name")), []).append(b)
    return by_pid, by_name

def fivepm_text(b):
    days, times, deal = (b.get("happy_hour_days") or "").strip(), (b.get("happy_hour_times") or "").strip(), (b.get("deal") or "").strip()
    if days in ("", "None") and times in ("", "NA") and not deal: return None
    if "not currently offered" in deal.lower(): return None
    if re.search(r"(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Daily)", times): days = ""
    parts = [tidy(x) for x in (days, times) if x and x not in ("NA", "None")]
    when = " ".join(parts)
    text = ", ".join(x for x in [when, deal[:70]] if x)
    est = b.get("source") == "estimated"
    return (("est. " if est else "") + text, "5pm.nyc" + (" (estimated)" if est else ""))

# ---------- happierhournyc.com ----------
def happier_slugs():
    page = fetch("https://happierhournyc.com/")
    return sorted(set(re.findall(r'href="/happyHour/([a-z0-9-]+)"', page)))

def happier_index(hoods):
    slugs = {s for s in happier_slugs() if any(s.replace("-", "") == norm(h) for h in hoods)}
    idx = {}
    for s in sorted(slugs):
        try: page = fetch(f"https://happierhournyc.com/happyHour/{s}")
        except Exception: continue
        for c in re.findall(r"<article class=\"h-full\">(.*?)</article>", page, re.S):
            m = re.search(r"<h3[^>]*>(.*?)</h3>", c, re.S)
            if not m: continue
            sched = re.findall(r"<dt[^>]*>(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)</dt>\s*<dd[^>]*>([^<]+)</dd>", c)
            if not sched: continue
            days = [d[:3] for d, _ in sched]; times = {t for _, t in sched}
            when = (days[0] + " to " + days[-1] if len(days) > 1 else days[0]) + " " + (tidy(sched[0][1]) if len(times) == 1 else "varies")
            deals = re.findall(r"<dt[^>]*>((?:Beer|Wine|Cocktail|Well Drink|Drink & Food|Shot|Food)[^<]*)</dt>\s*<dd[^>]*>([^<]+)</dd>", c)
            deal = "; ".join(f"{k.lower()} {v}" for k, v in deals[:3])
            idx[norm(html.unescape(m.group(1)))] = (when + (", " + deal if deal else ""), "happierhournyc.com")
        time.sleep(0.4)
    return idx

# ---------- the pass ----------
def resolve(places, log=print):
    hoods = {p.get("hood") for p in places if p.get("hood")}
    log("hh: indexing sources")
    hh_idx = hhnyc_index(hoods)
    pid_idx, name_idx = fivepm_index()
    hp_idx = happier_index(hoods)
    log(f"hh: happy-hour.nyc {len(hh_idx)}, 5pm {len(pid_idx)} by id, happier {len(hp_idx)}")
    out = []
    for p in places:
        if (p.get("happy_hour_source") or "") == "manual": continue
        n = norm(p["name"]); found = None
        urls = [hh_idx[n]] if n in hh_idx else []
        if not urls and p.get("hood") in HHNYC_HOODS:
            slug = re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", p["name"]).encode("ascii", "ignore").decode().lower()).strip("-")
            urls = [f"https://happy-hour.nyc/bars-restaurants/{slug}", f"https://happy-hour.nyc/bars-restaurants/{slug}-bar"]
        for u in urls:
            try: found = hhnyc_venue(u); time.sleep(0.3)
            except Exception: found = None
            if found: break
        b = pid_idx.get(p.get("google_place_id") or "")
        if not b:
            cands = name_idx.get(n, [])
            if len(cands) == 1: b = cands[0]
            elif cands and p.get("lat"):
                b = min(cands, key=lambda x: abs((x.get("lat") or 0) - p["lat"]) + abs((x.get("lng") or 0) - p["lng"]))
        five = fivepm_text(b) if b else None
        if not found and five and "estimated" not in five[1]: found = five
        if not found and n in hp_idx: found = hp_idx[n]
        if not found and five: found = five
        out.append((p, found))
    return out

def hh_pass(sb, log, only_new=False):
    """only_new: just the rows never checked (added since the weekly pass).
    A happy hour the app lifted from Google (source 'google') is kept unless an
    aggregator has a real entry; an 'estimated' guess never replaces it."""
    q = "rounds_places?select=id,name,hood,google_place_id,lat,lng,happy_hour,happy_hour_source&google_place_id=not.is.null"
    if only_new: q += "&happy_hour_checked_at=is.null"
    places = sb("GET", q)
    if only_new and not places: return
    now = datetime.now(timezone.utc).isoformat()
    n = 0
    for p, found in resolve(places or [], log):
        patch = {"happy_hour_checked_at": now}
        if found and (p.get("happy_hour_source") or "") == "google" and "estimated" in found[1]: found = None
        if found:
            patch.update(happy_hour=found[0][:140], happy_hour_source=found[1]); n += 1
        try: sb("PATCH", f"rounds_places?id=eq.{p['id']}", patch, prefer="return=minimal")
        except Exception as e: log("hh write failed", p["name"], e)
    log("hh:", n, "places with a happy hour out of", len(places or []))

if __name__ == "__main__":
    if "--dry" in sys.argv:
        places = json.load(open(sys.argv[sys.argv.index("--dry") + 1]))
        for p, found in resolve(places):
            if found: print(f"{p['name']:36} {found[1]:24} {found[0]}")
