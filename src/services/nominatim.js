/**
 * nominatim.js
 *
 * Verwaltet die Adresssuche und das Reverse-Geocoding.
 *
 * Reverse-Geocoding:
 * Koordinaten werden in eine lesbare Adresse umgewandelt.
 *
 * Geocoding:
 * Eine Texteingabe wird in Koordinaten umgewandelt.
 */

// ── API-Endpunkte ─────────────────────────────────

const NOMINATIM_REVERSE_GEOCODE_URL = "https://nominatim.openstreetmap.org/reverse";
const NOMINATIM_SEARCH_URL          = "https://nominatim.openstreetmap.org/search";
const PHOTON_SEARCH_URL             = "https://photon.komoot.io/api/";

// ── Einstellungen ─────────────────────────────────

const MAX_SEARCH_RESULTS = 20;

// ── OSM-Typen ─────────────────────────────────

const OSM_TYPE_MAP = {
  node:     "N",
  way:      "W",
  relation: "R",
  N:        "N",
  W:        "W",
  R:        "R",
};

// ── Text normalisieren ─────────────────────────────────

function normalizeSearchText(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// ── Koordinaten prüfen ─────────────────────────────────

function hasValidCoordinates(location) {
  return (
    Number.isFinite(Number(location?.latitude)) &&
    Number.isFinite(Number(location?.longitude))
  );
}

// ── Winkel umrechnen ─────────────────────────────────

function convertDegreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

// ── Distanz berechnen ─────────────────────────────────

function calculateDistanceInMeters(firstLocation, secondLocation) {
  if (!hasValidCoordinates(firstLocation) || !hasValidCoordinates(secondLocation)) {
    return Number.POSITIVE_INFINITY;
  }

  const earthRadiusInMeters = 6371000;

  const firstLatitudeInRadians  = convertDegreesToRadians(firstLocation.latitude);
  const secondLatitudeInRadians = convertDegreesToRadians(secondLocation.latitude);

  const latitudeDifferenceInRadians =
    convertDegreesToRadians(secondLocation.latitude - firstLocation.latitude);

  const longitudeDifferenceInRadians =
    convertDegreesToRadians(secondLocation.longitude - firstLocation.longitude);

  const haversineValue =
    Math.sin(latitudeDifferenceInRadians / 2) ** 2 +
    Math.cos(firstLatitudeInRadians) *
      Math.cos(secondLatitudeInRadians) *
      Math.sin(longitudeDifferenceInRadians / 2) ** 2;

  return earthRadiusInMeters * 2 * Math.atan2(
    Math.sqrt(haversineValue),
    Math.sqrt(1 - haversineValue)
  );
}

// ── OSM-Typ normalisieren ─────────────────────────────────

function normalizeOsmType(osmType) {
  return OSM_TYPE_MAP[osmType] ?? osmType ?? null;
}

// ── Adressbestandteile lesen ─────────────────────────────────

function buildStreetWithHouseNumber(address) {
  if (address.road && address.house_number) {
    return `${address.road} ${address.house_number}`;
  }

  return address.road || "";
}

function buildCityName(address) {
  return (
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.hamlet ||
    ""
  );
}

function buildAddressName(osmData, address) {
  if (osmData.name) {
    return osmData.name;
  }

  if (address.amenity) {
    return address.amenity;
  }

  if (address.shop) {
    return address.shop;
  }

  if (address.tourism) {
    return address.tourism;
  }

  if (address.historic) {
    return address.historic;
  }

  const streetWithHouseNumber = buildStreetWithHouseNumber(address);
  const cityName              = buildCityName(address);

  if (streetWithHouseNumber && cityName) {
    return `${cityName}, ${streetWithHouseNumber}`;
  }

  return (
    streetWithHouseNumber ||
    cityName ||
    osmData.display_name?.split(",")[0] ||
    "Unbekannter Ort"
  );
}

function buildShortAddress(address) {
  return [
    buildStreetWithHouseNumber(address),
    buildCityName(address),
  ]
    .filter(Boolean)
    .join(", ");
}

function getMainDisplayName(displayName) {
  return String(displayName ?? "")
    .split(",")[0]
    .trim();
}

// ── HTTP-Hilfsfunktionen ─────────────────────────────────

function createNominatimHeaders() {
  return {
    "Accept-Language": "de",
  };
}

async function readJsonFromSettledResponse(settledResponse, fallbackValue) {
  if (settledResponse.status !== "fulfilled") {
    return fallbackValue;
  }

  if (!settledResponse.value.ok) {
    return fallbackValue;
  }

  try {
    return await settledResponse.value.json();
  } catch {
    return fallbackValue;
  }
}

// ── Suggestion-Typ bestimmen ─────────────────────────────────

function getSuggestionTypePriority(suggestion) {
  const addresstype = normalizeSearchText(suggestion.addresstype);
  const osmCategory = normalizeSearchText(suggestion.osmCategory);
  const osmValue    = normalizeSearchText(suggestion.osmValue);

  if (addresstype === "country" || osmValue === "country") {
    return 0;
  }

  if (
    addresstype === "state" ||
    addresstype === "region" ||
    osmValue === "administrative"
  ) {
    return 1;
  }

  if (addresstype === "county" || addresstype === "district") {
    return 2;
  }

  if (addresstype === "city" || osmValue === "city") {
    return 3;
  }

  if (
    addresstype === "town" ||
    addresstype === "municipality" ||
    osmValue === "town" ||
    osmValue === "municipality"
  ) {
    return 4;
  }

  if (
    addresstype === "village" ||
    addresstype === "hamlet" ||
    addresstype === "locality" ||
    osmValue === "village" ||
    osmValue === "hamlet" ||
    osmValue === "locality"
  ) {
    return 5;
  }

  if (
    addresstype === "road" ||
    addresstype === "house" ||
    addresstype === "building"
  ) {
    return 6;
  }

  if (
    osmCategory === "shop" ||
    osmCategory === "amenity" ||
    osmCategory === "tourism" ||
    osmCategory === "leisure" ||
    osmCategory === "historic"
  ) {
    return 7;
  }

  return 8;
}

function isPointOfInterestSuggestion(suggestion) {
  return getSuggestionTypePriority(suggestion) === 7;
}

// ── Suggestion-Relevanz berechnen ─────────────────────────────────

function calculateSuggestionPriority(suggestion, searchText) {
  const query           = normalizeSearchText(searchText);
  const name            = normalizeSearchText(suggestion.name);
  const city            = normalizeSearchText(suggestion.city);
  const country         = normalizeSearchText(suggestion.country);
  const displayName     = normalizeSearchText(suggestion.displayName);
  const mainDisplayName = normalizeSearchText(
    getMainDisplayName(suggestion.displayName)
  );

  if (!query) {
    return 99;
  }

  const typePriority = getSuggestionTypePriority(suggestion);

  const isExactMatch =
    name === query ||
    city === query ||
    country === query ||
    mainDisplayName === query;

  if (isExactMatch) {
    return typePriority;
  }

  const startsWithQuery =
    name.startsWith(query) ||
    city.startsWith(query) ||
    country.startsWith(query) ||
    mainDisplayName.startsWith(query);

  if (startsWithQuery) {
    return 20 + typePriority;
  }

  if (displayName.includes(query)) {
    return 40 + typePriority;
  }

  const queryWords      = query.split(" ");
  const allWordsIncluded = queryWords.every((word) => {
    return displayName.includes(word);
  });

  if (allWordsIncluded) {
    return 60 + typePriority;
  }

  return 99;
}

function calculateSuggestionScore(suggestion, searchText) {
  const query       = normalizeSearchText(searchText);
  const name        = normalizeSearchText(suggestion.name);
  const displayName = normalizeSearchText(suggestion.displayName);
  const city        = normalizeSearchText(suggestion.city);

  if (!query) {
    return 0;
  }

  if (name === query) {
    return 10000;
  }

  if (displayName === query) {
    return 9500;
  }

  if (`${name} ${city}`.trim() === query) {
    return 9000;
  }

  if (name.startsWith(query)) {
    return 8000;
  }

  if (displayName.startsWith(query)) {
    return 7500;
  }

  if (displayName.includes(query)) {
    return 6500;
  }

  const queryWords       = query.split(" ");
  const allWordsIncluded = queryWords.every((word) => {
    return displayName.includes(word);
  });

  if (allWordsIncluded) {
    return 5500;
  }

  return 0;
}

// ── Suggestion-Duplikate entfernen ─────────────────────────────────

function removeDuplicateSuggestions(suggestions) {
  const seenSuggestionKeys = new Set();

  return suggestions.filter((suggestion) => {
    const suggestionKey = [
      suggestion.name,
      suggestion.city,
      suggestion.country,
      suggestion.latitude?.toFixed(5),
      suggestion.longitude?.toFixed(5),
    ].join("|");

    if (seenSuggestionKeys.has(suggestionKey)) {
      return false;
    }

    seenSuggestionKeys.add(suggestionKey);
    return true;
  });
}

// ── Suggestion sortieren ─────────────────────────────────

function compareSuggestions(firstSuggestion, secondSuggestion) {
  if (firstSuggestion.priority !== secondSuggestion.priority) {
    return firstSuggestion.priority - secondSuggestion.priority;
  }

  const firstDistance  = firstSuggestion.distanceInMeters;
  const secondDistance = secondSuggestion.distanceInMeters;

  const bothHaveDistance =
    Number.isFinite(firstDistance) &&
    Number.isFinite(secondDistance);

  const bothArePointsOfInterest =
    isPointOfInterestSuggestion(firstSuggestion) &&
    isPointOfInterestSuggestion(secondSuggestion);

  if (
    bothArePointsOfInterest &&
    bothHaveDistance &&
    firstDistance !== secondDistance
  ) {
    return firstDistance - secondDistance;
  }

  const firstImportance  = firstSuggestion.importance ?? 0;
  const secondImportance = secondSuggestion.importance ?? 0;

  if (firstImportance !== secondImportance) {
    return secondImportance - firstImportance;
  }

  if (bothHaveDistance && firstDistance !== secondDistance) {
    return firstDistance - secondDistance;
  }

  return secondSuggestion.score - firstSuggestion.score;
}

// ── Photon-Ergebnis umwandeln ─────────────────────────────────

function mapPhotonFeatureToSuggestion(feature) {
  const properties = feature.properties ?? {};
  const coordinates = feature.geometry?.coordinates ?? [];

  const city =
    properties.city ||
    properties.town ||
    properties.village ||
    "";

  return {
    latitude:    Number(coordinates[1]),
    longitude:   Number(coordinates[0]),
    name:        properties.name || properties.street || "",
    city,
    country:     properties.country || "",
    displayName: [properties.name, properties.street, city, properties.country]
      .filter(Boolean)
      .join(", "),

    osmId:       properties.osm_id || null,
    osmType:     normalizeOsmType(properties.osm_type),
    osmCategory: properties.osm_key || "",
    osmValue:    properties.osm_value || "",
    addresstype: properties.type || "",
    placeRank:   null,
    importance:  0,
  };
}

// ── Nominatim-Ergebnis umwandeln ─────────────────────────────────

function mapNominatimPlaceToSuggestion(place) {
  const address = place.address ?? {};

  const city                  = buildCityName(address);
  const streetWithHouseNumber = buildStreetWithHouseNumber(address);

  const name =
    place.name ||
    address.amenity ||
    address.shop ||
    address.tourism ||
    streetWithHouseNumber ||
    place.display_name?.split(",")[0] ||
    "";

  return {
    latitude:    Number(place.lat),
    longitude:   Number(place.lon),
    name,
    city,
    country:     address.country || "",
    displayName: place.display_name || [name, city, address.country]
      .filter(Boolean)
      .join(", "),

    osmId:       place.osm_id || null,
    osmType:     normalizeOsmType(place.osm_type),
    osmCategory: place.category || place.class || "",
    osmValue:    place.type || "",
    addresstype: place.addresstype || "",
    placeRank:   place.place_rank ?? null,
    importance:  place.importance ?? 0,
  };
}

// ── Suchparameter bauen ─────────────────────────────────

function buildCountrySearchParams(searchText) {
  return new URLSearchParams({
    country:        searchText,
    format:         "jsonv2",
    addressdetails: "1",
    limit:          "3",
  });
}

function buildNominatimSearchParams(searchText) {
  return new URLSearchParams({
    q:              searchText,
    format:         "jsonv2",
    addressdetails: "1",
    limit:          String(MAX_SEARCH_RESULTS),
  });
}

function buildPhotonSearchParams(searchText, locationBias) {
  const photonSearchParams = new URLSearchParams({
    q:     searchText,
    limit: String(MAX_SEARCH_RESULTS),
    lang:  "de",
  });

  if (hasValidCoordinates(locationBias)) {
    photonSearchParams.set("lat", String(locationBias.latitude));
    photonSearchParams.set("lon", String(locationBias.longitude));
  }

  return photonSearchParams;
}

// ── Koordinaten in Adresse umwandeln ─────────────────────────────────

export async function reverseGeocode(latitude, longitude) {
  const reverseGeocodeParams = new URLSearchParams({
    format:         "jsonv2",
    lat:            String(latitude),
    lon:            String(longitude),
    zoom:           "18",
    addressdetails: "1",
  });

  const response = await fetch(
    `${NOMINATIM_REVERSE_GEOCODE_URL}?${reverseGeocodeParams}`,
    {
      headers: createNominatimHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error("Nominatim ist gerade nicht erreichbar.");
  }

  const osmData = await response.json();
  const address = osmData.address ?? {};

  return {
    name:         buildAddressName(osmData, address),
    shortAddress: buildShortAddress(address),
    fullAddress:  osmData.display_name ?? "",
    city:         buildCityName(address),
    country:      address.country || "",

    osmType:      normalizeOsmType(osmData.osm_type),
    osmId:        osmData.osm_id || null,
    osmCategory:  osmData.category || osmData.class || "",
    osmValue:     osmData.type || "",
    addresstype:  osmData.addresstype || "",
    placeRank:    osmData.place_rank ?? null,
    importance:   osmData.importance ?? 0,

    rawPlaceName: osmData.name || "",
  };
}

// ── Adresse suchen ─────────────────────────────────

export async function searchAddress(searchText, locationBias = null) {
  const trimmedSearchText = String(searchText ?? "").trim();

  if (!trimmedSearchText) {
    return [];
  }

  const countrySearchParams   = buildCountrySearchParams(trimmedSearchText);
  const nominatimSearchParams = buildNominatimSearchParams(trimmedSearchText);
  const photonSearchParams    = buildPhotonSearchParams(
    trimmedSearchText,
    locationBias
  );

  const [
    countryResponse,
    nominatimResponse,
    photonResponse,
  ] = await Promise.allSettled([
    fetch(`${NOMINATIM_SEARCH_URL}?${countrySearchParams}`, {
      headers: createNominatimHeaders(),
    }),

    fetch(`${NOMINATIM_SEARCH_URL}?${nominatimSearchParams}`, {
      headers: createNominatimHeaders(),
    }),

    fetch(`${PHOTON_SEARCH_URL}?${photonSearchParams}`),
  ]);

  const countryData = await readJsonFromSettledResponse(
    countryResponse,
    []
  );

  const nominatimData = await readJsonFromSettledResponse(
    nominatimResponse,
    []
  );

  const photonData = await readJsonFromSettledResponse(
    photonResponse,
    { features: [] }
  );

  const countrySuggestions = (countryData ?? []).map(
    mapNominatimPlaceToSuggestion
  );

  const nominatimSuggestions = (nominatimData ?? []).map(
    mapNominatimPlaceToSuggestion
  );

  const photonSuggestions = (photonData.features ?? []).map(
    mapPhotonFeatureToSuggestion
  );

  return removeDuplicateSuggestions([
    ...countrySuggestions,
    ...nominatimSuggestions,
    ...photonSuggestions,
  ])
    .filter(hasValidCoordinates)
    .map((suggestion) => {
      const distanceInMeters = calculateDistanceInMeters(
        locationBias,
        suggestion
      );

      return {
        ...suggestion,
        score:            calculateSuggestionScore(suggestion, trimmedSearchText),
        priority:         calculateSuggestionPriority(suggestion, trimmedSearchText),
        distanceInMeters,
      };
    })
    .sort(compareSuggestions)
    .slice(0, MAX_SEARCH_RESULTS);
}