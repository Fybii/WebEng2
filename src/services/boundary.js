/**
 * boundary.js
 *
 * Lädt die geografische Grenzlinie eines Ortes von der Nominatim-API.
 * Diese Grenzlinie wird genutzt, um Städte, Länder oder Regionen
 * auf der Karte sichtbar zu umranden.
 */

// ── API-Endpunkt ─────────────────────────────────

const NOMINATIM_LOOKUP_URL = "https://nominatim.openstreetmap.org/lookup";

// ── Einstellungen ─────────────────────────────────

const POLYGON_SIMPLIFICATION_THRESHOLD = "0.001";

// ── OSM-Typ normalisieren ─────────────────────────────────

function normalizeOsmTypeForLookup(osmType) {
  const normalizedOsmType = String(osmType ?? "").trim().toLowerCase();

  const osmTypeMap = {
    n:        "N",
    node:     "N",
    w:        "W",
    way:      "W",
    r:        "R",
    relation: "R",
  };

  return osmTypeMap[normalizedOsmType] ?? "";
}

// ── Lookup-URL bauen ─────────────────────────────────

function createBoundaryLookupUrl(osmType, osmId) {
  const lookupParams = new URLSearchParams({
    osm_ids:           `${osmType}${osmId}`,
    format:            "json",
    polygon_geojson:   "1",
    polygon_threshold: POLYGON_SIMPLIFICATION_THRESHOLD,
  });

  return `${NOMINATIM_LOOKUP_URL}?${lookupParams}`;
}

// ── GeoJSON aus Antwort lesen ─────────────────────────────────

function extractGeoJsonBoundary(lookupData) {
  if (!Array.isArray(lookupData)) {
    return null;
  }

  return lookupData[0]?.geojson ?? null;
}

// ── Ortsgrenze laden ─────────────────────────────────

export async function fetchPlaceBoundary(osmType, osmId, options = {}) {
  const { signal } = options;

  const lookupOsmType = normalizeOsmTypeForLookup(osmType);

  if (!lookupOsmType || !osmId) {
    return null;
  }

  const requestUrl = createBoundaryLookupUrl(lookupOsmType, osmId);

  try {
    const response = await fetch(requestUrl, {
      signal,
      headers: {
        "Accept-Language": "de",
      },
    });

    if (!response.ok) {
      return null;
    }

    const lookupData = await response.json();

    return extractGeoJsonBoundary(lookupData);
  } catch (error) {
    if (error.name !== "AbortError") {
      console.warn("Ortsgrenze konnte nicht geladen werden:", error);
    }

    return null;
  }
}