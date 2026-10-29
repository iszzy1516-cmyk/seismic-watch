from datetime import datetime, timezone


def feature_to_row(feature):
    if not isinstance(feature, dict):
        return None
    properties = feature.get("properties")
    geometry = feature.get("geometry")
    if not isinstance(properties, dict) or not isinstance(geometry, dict):
        return None
    quake_id = feature.get("id")
    if quake_id is None:
        return None
    coordinates = geometry.get("coordinates")
    if (
        not isinstance(coordinates, (list, tuple))
        or len(coordinates) < 2
        or not all(isinstance(c, (int, float)) for c in coordinates[:2])
    ):
        return None
    lon, lat = coordinates[0], coordinates[1]
    if not (-180.0 <= lon <= 180.0 and -90.0 <= lat <= 90.0):
        return None
    depth = coordinates[2] if len(coordinates) > 2 and isinstance(coordinates[2], (int, float)) else None
    time_ms = properties.get("time")
    if not isinstance(time_ms, (int, float)):
        return None
    mag = properties.get("mag")
    if mag is not None and not isinstance(mag, (int, float)):
        return None
    felt = properties.get("felt")
    tsunami = bool(properties.get("tsunami", 0))
    return {
        "id": str(quake_id),
        "mag": mag,
        "place": properties.get("place") or "unknown",
        "time": datetime.fromtimestamp(time_ms / 1000, tz=timezone.utc),
        "depth_km": depth,
        "tsunami": tsunami,
        "felt": int(felt) if isinstance(felt, (int, float)) else None,
        "_lon": lon,
        "_lat": lat,
    }


def geojson_to_rows(collection):
    if not isinstance(collection, dict):
        return [], 0
    features = collection.get("features")
    if not isinstance(features, list):
        return [], 0
    rows = []
    skipped = 0
    for feature in features:
        row = feature_to_row(feature)
        if row is None:
            skipped += 1
        else:
            rows.append(row)
    return rows, skipped
