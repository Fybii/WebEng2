/**
 * poi.js
 *
 * Lädt Points of Interest für einen Kartenausschnitt über die Overpass API.
 *
 * Points of Interest bedeutet:
 * Relevante Orte wie Restaurants, Hotels, Tankstellen, Apotheken
 * oder Parkplätze in der Nähe.
 */

// ── Overpass-Endpunkte ─────────────────────────────────

const OVERPASS_API_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

// ── Einstellungen ─────────────────────────────────

const OVERPASS_TIMEOUT_IN_SECONDS = 25;
const MAXIMUM_POINTS_OF_INTEREST  = 80;

// ── Kategorie-Definitionen ─────────────────────────────────

export const POINT_OF_INTEREST_CATEGORIES = {
  restaurant: {
    groupKey: "food",
    osmTag:   "amenity",
    osmValue: "restaurant",
    label:    "Restaurants",
    icon:     "🍽️",
  },
  cafe: {
    groupKey: "food",
    osmTag:   "amenity",
    osmValue: "cafe",
    label:    "Cafés",
    icon:     "☕",
  },
  bar: {
    groupKey: "food",
    osmTag:   "amenity",
    osmValue: "bar",
    label:    "Bars",
    icon:     "🍺",
  },
  fast_food: {
    groupKey: "food",
    osmTag:   "amenity",
    osmValue: "fast_food",
    label:    "Fast Food",
    icon:     "🍔",
  },
  bakery: {
    groupKey: "food",
    osmTag:   "shop",
    osmValue: "bakery",
    label:    "Bäckereien",
    icon:     "🥐",
  },
  ice_cream: {
    groupKey: "food",
    osmTag:   "amenity",
    osmValue: "ice_cream",
    label:    "Eisdielen",
    icon:     "🍦",
  },

  supermarket: {
    groupKey: "shopping",
    osmTag:   "shop",
    osmValue: "supermarket",
    label:    "Lebensmittel",
    icon:     "🛒",
  },
  convenience: {
    groupKey: "shopping",
    osmTag:   "shop",
    osmValue: "convenience",
    label:    "Kioske",
    icon:     "🏬",
  },
  clothes: {
    groupKey: "shopping",
    osmTag:   "shop",
    osmValue: "clothes",
    label:    "Mode",
    icon:     "👕",
  },
  electronics: {
    groupKey: "shopping",
    osmTag:   "shop",
    osmValue: "electronics",
    label:    "Elektronik",
    icon:     "📱",
  },
  books: {
    groupKey: "shopping",
    osmTag:   "shop",
    osmValue: "books",
    label:    "Buchhandlungen",
    icon:     "📖",
  },

  fuel: {
    groupKey: "transport",
    osmTag:   "amenity",
    osmValue: "fuel",
    label:    "Tankstellen",
    icon:     "⛽",
  },
  parking: {
    groupKey: "transport",
    osmTag:   "amenity",
    osmValue: "parking",
    label:    "Parkplätze",
    icon:     "🅿️",
  },
  charging_station: {
    groupKey: "transport",
    osmTag:   "amenity",
    osmValue: "charging_station",
    label:    "Ladesäulen",
    icon:     "🔌",
  },
  bus_stop: {
    groupKey: "transport",
    osmTag:   "highway",
    osmValue: "bus_stop",
    label:    "Bushaltestellen",
    icon:     "🚌",
  },
  station: {
    groupKey: "transport",
    osmTag:   "railway",
    osmValue: "station",
    label:    "Bahnhöfe",
    icon:     "🚉",
  },

  pharmacy: {
    groupKey: "health",
    osmTag:   "amenity",
    osmValue: "pharmacy",
    label:    "Apotheken",
    icon:     "💊",
  },
  doctors: {
    groupKey: "health",
    osmTag:   "amenity",
    osmValue: "doctors",
    label:    "Arztpraxen",
    icon:     "🩺",
  },
  hospital: {
    groupKey: "health",
    osmTag:   "amenity",
    osmValue: "hospital",
    label:    "Krankenhäuser",
    icon:     "🏥",
  },
  dentist: {
    groupKey: "health",
    osmTag:   "amenity",
    osmValue: "dentist",
    label:    "Zahnärzte",
    icon:     "🦷",
  },

  park: {
    groupKey: "nature",
    osmTag:   "leisure",
    osmValue: "park",
    label:    "Parks",
    icon:     "🌳",
  },
  playground: {
    groupKey: "nature",
    osmTag:   "leisure",
    osmValue: "playground",
    label:    "Spielplätze",
    icon:     "🛝",
  },
  swimming_pool: {
    groupKey: "nature",
    osmTag:   "leisure",
    osmValue: "swimming_pool",
    label:    "Schwimmbäder",
    icon:     "🏊",
  },
  sports_centre: {
    groupKey: "nature",
    osmTag:   "leisure",
    osmValue: "sports_centre",
    label:    "Sportzentren",
    icon:     "⚽",
  },
  viewpoint: {
    groupKey: "nature",
    osmTag:   "tourism",
    osmValue: "viewpoint",
    label:    "Aussichtspunkte",
    icon:     "🔭",
  },

  museum: {
    groupKey: "culture",
    osmTag:   "tourism",
    osmValue: "museum",
    label:    "Museen",
    icon:     "🏛️",
  },
  attraction: {
    groupKey: "culture",
    osmTag:   "tourism",
    osmValue: "attraction",
    label:    "Attraktionen",
    icon:     "⭐",
  },
  castle: {
    groupKey: "culture",
    osmTag:   "historic",
    osmValue: "castle",
    label:    "Burgen & Schlösser",
    icon:     "🏰",
  },
  cinema: {
    groupKey: "culture",
    osmTag:   "amenity",
    osmValue: "cinema",
    label:    "Kinos",
    icon:     "🎬",
  },
  theatre: {
    groupKey: "culture",
    osmTag:   "amenity",
    osmValue: "theatre",
    label:    "Theater",
    icon:     "🎭",
  },

  hotel: {
    groupKey: "stay",
    osmTag:   "tourism",
    osmValue: "hotel",
    label:    "Hotels",
    icon:     "🏨",
  },
  hostel: {
    groupKey: "stay",
    osmTag:   "tourism",
    osmValue: "hostel",
    label:    "Hostels",
    icon:     "🛏️",
  },
  camp_site: {
    groupKey: "stay",
    osmTag:   "tourism",
    osmValue: "camp_site",
    label:    "Campingplätze",
    icon:     "⛺",
  },

  atm: {
    groupKey: "services",
    osmTag:   "amenity",
    osmValue: "atm",
    label:    "Geldautomaten",
    icon:     "🏧",
  },
  bank: {
    groupKey: "services",
    osmTag:   "amenity",
    osmValue: "bank",
    label:    "Banken",
    icon:     "🏦",
  },
  post_office: {
    groupKey: "services",
    osmTag:   "amenity",
    osmValue: "post_office",
    label:    "Post",
    icon:     "📮",
  },
  toilets: {
    groupKey: "services",
    osmTag:   "amenity",
    osmValue: "toilets",
    label:    "Toiletten",
    icon:     "🚻",
  },
  police: {
    groupKey: "services",
    osmTag:   "amenity",
    osmValue: "police",
    label:    "Polizei",
    icon:     "👮",
  },
};

// ── Gruppen-Definitionen für die Übersicht ─────────────────────────────────

export const POINT_OF_INTEREST_CATEGORY_GROUPS = [
  {
    groupKey:      "food",
    label:         "Essen & Trinken",
    categoryKeys:  ["restaurant", "cafe", "bar", "fast_food", "bakery", "ice_cream"],
  },
  {
    groupKey:      "shopping",
    label:         "Einkaufen",
    categoryKeys:  ["supermarket", "convenience", "clothes", "electronics", "books"],
  },
  {
    groupKey:      "transport",
    label:         "Mobilität",
    categoryKeys:  ["fuel", "parking", "charging_station", "bus_stop", "station"],
  },
  {
    groupKey:      "health",
    label:         "Gesundheit",
    categoryKeys:  ["pharmacy", "doctors", "hospital", "dentist"],
  },
  {
    groupKey:      "nature",
    label:         "Natur & Freizeit",
    categoryKeys:  ["park", "playground", "swimming_pool", "sports_centre", "viewpoint"],
  },
  {
    groupKey:      "culture",
    label:         "Kultur",
    categoryKeys:  ["museum", "attraction", "castle", "cinema", "theatre"],
  },
  {
    groupKey:      "stay",
    label:         "Unterkunft",
    categoryKeys:  ["hotel", "hostel", "camp_site"],
  },
  {
    groupKey:      "services",
    label:         "Services",
    categoryKeys:  ["atm", "bank", "post_office", "toilets", "police"],
  },
];

// ── Schnellauswahl für Navigation ─────────────────────────────────

export const NAVIGATION_QUICK_CATEGORY_KEYS = [
  "restaurant",
  "fuel",
  "parking",
  "hotel",
  "supermarket",
  "pharmacy",
  "charging_station",
  "cafe",
];

// ── Koordinaten prüfen ─────────────────────────────────

function hasValidCoordinates(latitude, longitude) {
  return (
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude))
  );
}

// ── Overpass-Abfrage bauen ─────────────────────────────────

function buildBoundingBoxString(mapBounds) {
  const { south, west, north, east } = mapBounds;

  return `${south},${west},${north},${east}`;
}

function buildOverpassQuery(mapBounds, categoryDefinition) {
  const boundingBoxString = buildBoundingBoxString(mapBounds);

  return `
[out:json][timeout:${OVERPASS_TIMEOUT_IN_SECONDS}];
(
  node["${categoryDefinition.osmTag}"="${categoryDefinition.osmValue}"](${boundingBoxString});
  way["${categoryDefinition.osmTag}"="${categoryDefinition.osmValue}"](${boundingBoxString});
  relation["${categoryDefinition.osmTag}"="${categoryDefinition.osmValue}"](${boundingBoxString});
);
out center ${MAXIMUM_POINTS_OF_INTEREST};
`.trim();
}

// ── OpenStreetMap-Element umwandeln ─────────────────────────────────

function getElementCoordinates(osmElement) {
  const latitude  = osmElement.lat ?? osmElement.center?.lat;
  const longitude = osmElement.lon ?? osmElement.center?.lon;

  if (!hasValidCoordinates(latitude, longitude)) {
    return null;
  }

  return {
    latitude:  Number(latitude),
    longitude: Number(longitude),
  };
}

function getPointOfInterestName(osmElement, categoryDefinition) {
  return (
    osmElement.tags?.name ||
    osmElement.tags?.brand ||
    osmElement.tags?.operator ||
    categoryDefinition.label
  );
}

function parseOpenStreetMapElement(osmElement, categoryDefinition, categoryKey) {
  const coordinates = getElementCoordinates(osmElement);

  if (!coordinates) {
    return null;
  }

  return {
    identifier:    `${osmElement.type}-${osmElement.id}`,
    latitude:      coordinates.latitude,
    longitude:     coordinates.longitude,
    name:          getPointOfInterestName(osmElement, categoryDefinition),
    categoryKey,
    categoryLabel: categoryDefinition.label,
    icon:          categoryDefinition.icon,
  };
}

// ── Duplikate entfernen ─────────────────────────────────

function removeDuplicatePointsOfInterest(pointsOfInterest) {
  const seenCoordinateKeys = new Set();

  return pointsOfInterest.filter((pointOfInterest) => {
    const coordinateKey = [
      pointOfInterest.latitude.toFixed(5),
      pointOfInterest.longitude.toFixed(5),
    ].join(",");

    if (seenCoordinateKeys.has(coordinateKey)) {
      return false;
    }

    seenCoordinateKeys.add(coordinateKey);

    return true;
  });
}

// ── Overpass-Request senden ─────────────────────────────────

function createEndpointControllers() {
  return OVERPASS_API_ENDPOINTS.map(() => {
    return new AbortController();
  });
}

function connectExternalAbortSignal(externalSignal, endpointControllers) {
  if (!externalSignal) {
    return;
  }

  if (externalSignal.aborted) {
    endpointControllers.forEach((controller) => {
      controller.abort();
    });

    return;
  }

  externalSignal.addEventListener(
    "abort",
    () => {
      endpointControllers.forEach((controller) => {
        controller.abort();
      });
    },
    { once: true }
  );
}

function abortAllEndpointRequestsExcept(endpointControllers, activeIndex) {
  endpointControllers.forEach((controller, index) => {
    if (index !== activeIndex) {
      controller.abort();
    }
  });
}

async function fetchOverpassDataFromEndpoint(
  endpointUrl,
  endpointIndex,
  endpointControllers,
  encodedRequestBody
) {
  const response = await fetch(endpointUrl, {
    method:  "POST",
    body:    encodedRequestBody,
    headers: {
      Accept: "application/json",
    },
    signal: endpointControllers[endpointIndex].signal,
  });

  if (!response.ok) {
    throw new Error(`Overpass-Fehler ${response.status}`);
  }

  const responseData = await response.json();

  abortAllEndpointRequestsExcept(endpointControllers, endpointIndex);

  return responseData;
}

async function fetchOverpassData(overpassQuery, externalSignal) {
  const encodedRequestBody  = `data=${encodeURIComponent(overpassQuery)}`;
  const endpointControllers = createEndpointControllers();

  connectExternalAbortSignal(externalSignal, endpointControllers);

  try {
    return await Promise.any(
      OVERPASS_API_ENDPOINTS.map((endpointUrl, endpointIndex) => {
        return fetchOverpassDataFromEndpoint(
          endpointUrl,
          endpointIndex,
          endpointControllers,
          encodedRequestBody
        );
      })
    );
  } catch (error) {
    if (externalSignal?.aborted) {
      throw error;
    }

    throw new Error("POIs konnten nicht geladen werden.");
  }
}

// ── Points of Interest abrufen ─────────────────────────────────

export async function fetchPointsOfInterest(mapBounds, categoryKey, options = {}) {
  const { signal } = options;

  const categoryDefinition = POINT_OF_INTEREST_CATEGORIES[categoryKey];

  if (!categoryDefinition) {
    throw new Error(`Unbekannte POI-Kategorie: ${categoryKey}`);
  }

  if (!mapBounds) {
    return [];
  }

  const overpassQuery = buildOverpassQuery(mapBounds, categoryDefinition);
  const responseData  = await fetchOverpassData(overpassQuery, signal);

  const parsedPointsOfInterest = (responseData.elements ?? [])
    .map((osmElement) => {
      return parseOpenStreetMapElement(
        osmElement,
        categoryDefinition,
        categoryKey
      );
    })
    .filter(Boolean);

  return removeDuplicatePointsOfInterest(parsedPointsOfInterest);
}