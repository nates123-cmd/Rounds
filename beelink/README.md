# rounds-poller on the Beelink

```
mkdir -p ~/apps/rounds-poller && cd ~/apps/rounds-poller
# copy rounds_poller.py and docker-compose.yml here
# rounds.env: SUPABASE_URL, SUPABASE_SERVICE_KEY, VALHALLA_URL=http://127.0.0.1:8002, HOME_LAT, HOME_LNG, optional GOOGLE_KEY
docker compose up -d
docker logs -f rounds-poller
```

Depends on `~/apps/valhalla` serving on 8002. A place with coordinates gets
moped/bike/drive minutes within 10 minutes of being added. Re-routes every 30
days. `docker compose run --rm rounds-poller python3 -u /app/rounds_poller.py --once` for a single pass.
