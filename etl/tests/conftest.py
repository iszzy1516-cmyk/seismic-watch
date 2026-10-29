import pytest

SAMPLE_FEATURE = {
    "type": "Feature",
    "id": "us7000abc1",
    "properties": {
        "mag": 5.2,
        "place": "10 km S of Ridgecrest, CA",
        "time": 1609459200000,
        "tsunami": 1,
        "felt": 42,
    },
    "geometry": {
        "type": "Point",
        "coordinates": [-117.5965, 35.6228, 8.7],
    },
}


@pytest.fixture
def sample_feature():
    return {
        "type": SAMPLE_FEATURE["type"],
        "id": SAMPLE_FEATURE["id"],
        "properties": dict(SAMPLE_FEATURE["properties"]),
        "geometry": {
            "type": SAMPLE_FEATURE["geometry"]["type"],
            "coordinates": list(SAMPLE_FEATURE["geometry"]["coordinates"]),
        },
    }
