#!/usr/bin/env python3
"""
Curated lists for Rounds. Imported by rounds_poller.py, also runnable alone.

  Infatuation guides: fetched weekly from the page's ld+json ItemList, which
  carries name, address, geo, cuisine, price, url and a one-line blurb. No
  browser needed.

  NYT 100 Best: paywalled and bot-blocked, so it is NOT fetched here. It is
  extracted once a year through Chrome under Nate's subscription (see the
  /rounds skill) and inserted with the same upsert() below via tools/nyt.mjs.

After any fetch, rounds_match_lists() stamps list keys onto matching places.
"""
import json, re, html, urllib.request, unicodedata
from datetime import datetime, timezone

GUIDES = {
    "infatuation": ("The Infatuation: 25 Best Restaurants in NYC", "https://www.theinfatuation.com/new-york/guides/best-restaurants-nyc"),
    "infatuation_hit": ("The Infatuation: NYC Hit List", "https://www.theinfatuation.com/new-york/guides/best-new-new-york-restaurants-hit-list"),
    "infatuation_bar_hit": ("The Infatuation: NYC Bar Hit List", "https://www.theinfatuation.com/new-york/guides/the-nyc-bar-hit-list"),
    "infatuation_cocktails": ("The Infatuation: Best Cocktail Bars in NYC", "https://www.theinfatuation.com/new-york/guides/best-cocktail-bars-nyc"),
    "infatuation_fun": ("The Infatuation: Most Fun Bars in NYC Right Now", "https://www.theinfatuation.com/new-york/guides/best-fun-cool-bars-nyc-right-now"),
    "infatuation_hh": ("The Infatuation: Best Happy Hours in NYC", "https://www.theinfatuation.com/new-york/guides/happy-hour-nyc"),
}
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"

def norm(t):
    t = unicodedata.normalize("NFKD", html.unescape(t or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", re.sub(r"^the\s+", "", t.lower()))

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "replace")

def parse_infatuation(page):
    out = []
    for j in re.findall(r'<script type="application/ld\+json">(.*?)</script>', page, re.S):
        try: d = json.loads(j)
        except Exception: continue
        if not (isinstance(d, dict) and d.get("@type") == "ItemList"): continue
        for i, li in enumerate(d.get("itemListElement", []), 1):
            it = li.get("item", {})
            if it.get("@type") != "Restaurant": continue
            addr = it.get("address", {}) or {}
            geo = it.get("geo", {}) or {}
            cuisine = it.get("servesCuisine")
            out.append({
                "rank": li.get("position") or i,
                "name": html.unescape(it.get("name", "")).strip(),
                "hood": "",  # Infatuation puts the neighborhood in the review body, not the schema; Google fills it on add
                "address": ", ".join(x for x in [addr.get("streetAddress"), addr.get("addressLocality")] if x),
                "cuisine": ", ".join(cuisine) if isinstance(cuisine, list) else (cuisine or ""),
                "price": it.get("priceRange", "") or "",
                "url": it.get("url"),
                "lat": geo.get("latitude"), "lng": geo.get("longitude"),
                "blurb": html.unescape(li.get("description", "") or "")[:300],
            })
    # The ld+json ItemList caps at 20; the page's Apollo cache has every review
    # on the guide with the venue's coordinates. Merge what ld+json missed.
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', page, re.S)
    if m:
        try:
            ap = json.loads(m.group(1))["props"]["pageProps"]["initialApolloState"]
            seen = {norm(e["name"]) for e in out}
            k = len(out)
            for key, v in ap.items():
                if not key.startswith("PostReview:") or not v.get("title"): continue
                nm = html.unescape(v["title"]).strip()
                if norm(nm) in seen: continue
                venue = v.get("venue") or {}
                ll = venue.get("latlong") or {}
                k += 1
                out.append({"rank": k, "name": nm, "hood": "", "address": venue.get("address", "") or "", "cuisine": "",
                            "price": "", "url": "https://www.theinfatuation.com" + (v.get("canonicalPath") or ""),
                            "lat": ll.get("lat"), "lng": ll.get("lon"), "blurb": ""})
                seen.add(norm(nm))
        except Exception:
            pass
    return out

def upsert(sb, list_key, list_name, list_url, edition, entries):
    """sb(method, path, body, prefer) is the poller's Supabase REST helper."""
    now = datetime.now(timezone.utc).isoformat()
    rows = [{**e, "list_key": list_key, "list_name": list_name, "list_url": list_url, "edition": edition,
             "name_norm": norm(e["name"]), "active": True, "fetched_at": now} for e in entries if e.get("name")]
    if not rows: return 0
    sb("POST", "rounds_list_entries?on_conflict=list_key,name_norm", rows, prefer="resolution=merge-duplicates,return=minimal")
    # anything on this list not seen this fetch has dropped off
    keep = ",".join('"' + r["name_norm"] + '"' for r in rows)
    sb("PATCH", f"rounds_list_entries?list_key=eq.{list_key}&name_norm=not.in.({keep})", {"active": False}, prefer="return=minimal")
    return len(rows)

def lists_pass(sb, log):
    total = 0
    for key, (name, url) in GUIDES.items():
        try:
            entries = parse_infatuation(fetch(url))
            n = upsert(sb, key, name, url, datetime.now(timezone.utc).strftime("%Y-%m-%d"), entries)
            log("lists", key, n, "entries")
            total += n
        except Exception as e:
            log("lists failed", key, e)
    try:
        matched = sb("POST", "rpc/rounds_match_lists", {})
        log("lists matched", matched, "places newly badged")
    except Exception as e:
        log("match failed", e)
    return total

if __name__ == "__main__":
    for key, (name, url) in GUIDES.items():
        es = parse_infatuation(fetch(url))
        print(key, len(es), [e["name"] for e in es][:8])
