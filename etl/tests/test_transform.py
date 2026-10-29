from datetime import datetime, timezone

from transform import feature_to_row, geojson_to_rows


def test_normal_feature_maps_correctly(sample_feature):
    row = feature_to_row(sample_feature)
    assert row is not None
    assert row["id"] == "us7000abc1"
    assert row["mag"] == 5.2
    assert row["place"] == "10 km S of Ridgecrest, CA"
    assert row["time"] == datetime(2021, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    assert row["depth_km"] == 8.7
    assert row["tsunami"] is True
    assert row["felt"] == 42
    assert row["_lon"] == -117.5965
    assert row["_lat"] == 35.6228


def test_time_is_tz_aware_utc(sample_feature):
    row = feature_to_row(sample_feature)
    assert row["time"].tzinfo is not None
    assert row["time"].utcoffset().total_seconds() == 0


def test_tsunami_zero_is_false(sample_feature):
    sample_feature["properties"]["tsunami"] = 0
    row = feature_to_row(sample_feature)
    assert row["tsunami"] is False


def test_missing_mag_becomes_none(sample_feature):
    del sample_feature["properties"]["mag"]
    row = feature_to_row(sample_feature)
    assert row is not None
    assert row["mag"] is None


def test_mag_none_value_becomes_none(sample_feature):
    sample_feature["properties"]["mag"] = None
    row = feature_to_row(sample_feature)
    assert row is not None
    assert row["mag"] is None


def test_missing_felt_becomes_none(sample_feature):
    del sample_feature["properties"]["felt"]
    row = feature_to_row(sample_feature)
    assert row is not None
    assert row["felt"] is None


def test_out_of_range_lon_returns_none(sample_feature):
    sample_feature["geometry"]["coordinates"] = [200.0, 35.0, 5.0]
    assert feature_to_row(sample_feature) is None


def test_out_of_range_lat_returns_none(sample_feature):
    sample_feature["geometry"]["coordinates"] = [-117.0, 95.0, 5.0]
    assert feature_to_row(sample_feature) is None


def test_missing_geometry_returns_none(sample_feature):
    del sample_feature["geometry"]
    assert feature_to_row(sample_feature) is None


def test_missing_properties_returns_none(sample_feature):
    del sample_feature["properties"]
    assert feature_to_row(sample_feature) is None


def test_missing_id_returns_none(sample_feature):
    del sample_feature["id"]
    assert feature_to_row(sample_feature) is None


def test_non_list_feature_returns_none():
    assert feature_to_row("not a feature") is None
    assert feature_to_row(None) is None


def test_geojson_to_rows_counts_skipped(sample_feature):
    collection = {
        "type": "FeatureCollection",
        "features": [
            sample_feature,
            {"bad": "feature"},
            {**sample_feature, "id": "us7000abc2"},
        ],
    }
    rows, skipped = geojson_to_rows(collection)
    assert len(rows) == 2
    assert skipped == 1
    assert rows[0]["id"] == "us7000abc1"
    assert rows[1]["id"] == "us7000abc2"


def test_geojson_to_rows_empty_collection():
    rows, skipped = geojson_to_rows({"type": "FeatureCollection", "features": []})
    assert rows == []
    assert skipped == 0
