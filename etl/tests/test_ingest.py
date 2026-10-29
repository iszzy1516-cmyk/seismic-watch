from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
import requests

from ingest import build_fdsn_url, fetch_usgs_geojson, upsert_rows


class TestBuildFdsnUrl:
    def test_basic_params(self):
        now = datetime(2026, 10, 29, 12, 0, 0, tzinfo=timezone.utc)
        url = build_fdsn_url(30, 2.5, now=now)
        assert url.startswith("https://earthquake.usgs.gov/fdsnws/event/1/query.geojson?")
        assert "format=geojson" in url
        assert "endtime=2026-10-29" in url
        assert "starttime=2026-09-29" in url
        assert "minmagnitude=2.5" in url
        assert "orderby=time-asc" in url

    def test_days_math(self):
        now = datetime(2026, 1, 31, tzinfo=timezone.utc)
        url = build_fdsn_url(7, 1.0, now=now)
        assert "starttime=2026-01-24" in url
        assert "endtime=2026-01-31" in url

    def test_zero_days(self):
        now = datetime(2026, 3, 15, tzinfo=timezone.utc)
        url = build_fdsn_url(0, 3.0, now=now)
        assert "starttime=2026-03-15" in url
        assert "endtime=2026-03-15" in url

    def test_min_magnitude_float(self):
        url = build_fdsn_url(30, 0.5, now=datetime.now(timezone.utc))
        assert "minmagnitude=0.5" in url


class TestUpsertRows:
    def _make_conn(self):
        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value.__enter__ = MagicMock(return_value=cursor)
        conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        return conn, cursor

    def test_chunks_correctly(self):
        conn, cursor = self._make_conn()
        rows = [{"id": str(i)} for i in range(2500)]
        upserted = upsert_rows(conn, rows, chunk_size=1000)
        assert upserted == 2500
        assert cursor.executemany.call_count == 3
        chunks = [c.args[1] for c in cursor.executemany.call_args_list]
        assert [len(c) for c in chunks] == [1000, 1000, 500]
        assert chunks[0][0]["id"] == "0"
        assert chunks[2][0]["id"] == "2000"

    def test_sql_contains_on_conflict(self):
        conn, cursor = self._make_conn()
        upsert_rows(conn, [{"id": "x"}])
        sql = cursor.executemany.call_args.args[0]
        assert "INSERT INTO quakes" in sql
        assert "ON CONFLICT (id) DO UPDATE" in sql
        assert "ST_SetSRID(ST_MakePoint(%(_lon)s, %(_lat)s), 4326)::geography" in sql
        assert "mag = EXCLUDED.mag" in sql

    def test_single_transaction(self):
        conn, cursor = self._make_conn()
        upsert_rows(conn, [{"id": str(i)} for i in range(5)], chunk_size=2)
        conn.__enter__.assert_called_once()
        conn.__exit__.assert_called_once()


class TestFetchUsgsGeojson:
    def test_success_first_try(self):
        response = MagicMock()
        response.json.return_value = {"features": []}
        with patch("ingest.requests.get", return_value=response) as get:
            result = fetch_usgs_geojson("http://example.test")
        assert result == {"features": []}
        assert get.call_count == 1

    def test_retries_then_raises_on_persistent_failure(self):
        with patch(
            "ingest.requests.get",
            side_effect=[requests.ConnectionError("boom")] * 3,
        ) as get, patch("ingest.time.sleep") as sleep:
            with pytest.raises(requests.ConnectionError):
                fetch_usgs_geojson("http://example.test")
        assert get.call_count == 3
        assert [c.args[0] for c in sleep.call_args_list] == [2, 4]

    def test_http_error_retries(self):
        failing = MagicMock()
        failing.raise_for_status.side_effect = requests.HTTPError("500")
        ok = MagicMock()
        ok.json.return_value = {"features": []}
        with patch("ingest.requests.get", side_effect=[failing, ok]) as get, patch(
            "ingest.time.sleep"
        ):
            result = fetch_usgs_geojson("http://example.test")
        assert result == {"features": []}
        assert get.call_count == 2
