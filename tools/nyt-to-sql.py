#!/usr/bin/env python3
"""data/nyt-YYYY.json (rows captured through Chrome, see the /rounds skill) -> tools/nyt.sql.
Apply: cd ~/Desktop/today-app && supabase db query --linked -f ~/Desktop/rounds-app/tools/nyt.sql"""
import json, re, sys, unicodedata
year = sys.argv[1] if len(sys.argv) > 1 else '2026'
rows = json.load(open(f'data/nyt-{year}.json'))
def norm(t): return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode().lower())
sq = lambda s: "'" + str(s).replace("'", "''") + "'"
url = f'https://www.nytimes.com/interactive/{year}/dining/best-nyc-restaurants.html'
vals = []
for rank, name, cuisine, price, borough, addr, hood, site in rows:
    vals.append("(" + ", ".join([sq('nyt'), sq(f'NYT: The 100 Best Restaurants in New York City'), sq(url), sq(year), str(rank), sq(name), sq(norm(name)),
        sq(hood), sq(addr), sq(cuisine), sq(price), sq('https://' + site) if site else 'null', sq(borough)]) + ")")
sql = ("insert into public.rounds_list_entries (list_key, list_name, list_url, edition, rank, name, name_norm, hood, address, cuisine, price, url, blurb) values\n"
       + ",\n".join(vals) + "\non conflict (list_key, name_norm) do update set rank = excluded.rank, hood = excluded.hood, address = excluded.address, cuisine = excluded.cuisine, price = excluded.price, url = excluded.url, edition = excluded.edition, active = true, fetched_at = now();\n"
       f"update public.rounds_list_entries set active = false where list_key = 'nyt' and edition <> {sq(year)};\n"
       "select public.rounds_match_lists() as newly_badged;\n")
open('tools/nyt.sql', 'w').write(sql)
print(len(vals), 'rows -> tools/nyt.sql')
