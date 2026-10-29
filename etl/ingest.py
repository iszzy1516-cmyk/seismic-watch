import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import psycopg
import requests

from transform import geojson_to_rows

USGS_FDSN_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query.geojson"

UPSERT_SQL = """
INSERT INTO quakes (id, mag, place, time, depth_km, tsunami, felt, geom)
VALUES (%(id)s, %(mag)s, %(place)s, %(time)s, %(depth_km)s, %(tsunami)s, %(felt)s,
        ST_SetSRID(ST_MakePoint(%(_lon)s, %(_lat)s), 4326)::geography)
ON CONFLICT (id) DO UPDATE SET
    mag = EXCLUDED.mag,
    place = EXCLUDED.place,
    time = EXCLUDED.time,
    depth_km = EXCLUDED.depth_km,
    tsunami = EXCLUDED.tsunami,
    felt = EXCLUDED.felt
"""

log = logging.getLogger("etl")


def build_fdsn_url(days, min_magnitude, now=None):
    now = now or datetime.now(timezone.utc)
    starttime = now - timedelta(days=days)
    return (
        f"{USGS_FDSN_URL}?format=geojson"
        f"&starttime={starttime.strftime('%Y-%m-%d')}"
        f"&endtime={now.strftime('%Y-%m-%d')}"
        f"&minmagnitude={min_magnitude}"
        "&orderby=time-asc"
    )


def fetch_usgs_geojson(url, max_retries=3, timeout=30):
    backoff = 2
    for attempt in range(1, max_retries + 1):
        try:
            response = requests.get(url, timeout=timeout)
            response.raise_for_status()
            return response.json()
        except requests.RequestException:
            if attempt == max_retries:
                raise
            log.warning("fetch attempt %d/%d failed; retrying in %ds", attempt, max_retries, backoff)
            time.sleep(backoff)
            backoff *= 2


def upsert_rows(conn, rows, chunk_size=1000):
    upserted = 0
    with conn:
        with conn.cursor() as cur:
            for start in range(0, len(rows), chunk_size):
                chunk = rows[start : start + chunk_size]
                cur.executemany(UPSERT_SQL, chunk)
                upserted += len(chunk)
    return upserted


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        database_url = os.environ["DATABASE_URL"]
    except KeyError:
        log.error("DATABASE_URL is required")
        sys.exit(1)
    days = int(os.environ.get("USGS_DAYS", "30"))
    min_magnitude = float(os.environ.get("USGS_MIN_MAG", "2.5"))

    url = build_fdsn_url(days, min_magnitude)
    log.info("fetching USGS data: %s", url)
    collection = fetch_usgs_geojson(url)
    log.info("fetched %d features", len(collection.get("features", [])))

    rows, skipped = geojson_to_rows(collection)
    log.info("parsed %d rows, skipped %d malformed", len(rows), skipped)
    if not rows:
        log.error("nothing to upsert")
        sys.exit(1)

    with psycopg.connect(database_url) as conn:
        upserted = upsert_rows(conn, rows)
    log.info("upserted %d rows", upserted)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log.exception("ETL run failed")
        sys.exit(1)
