/**
 * routing.js
 *
 * Berechnet Routen für Navix.
 *
 * Standard-Routing:
 * - OSRM
 *
 * Spezial-Routing:
 * - Kürzeste Route
 * - Ohne Autobahn
 *
 * Für diese Spezialfälle wird OpenRouteService genutzt.
 */

// ── OSRM-Endpunkte ─────────────────────────────────

const OSRM_ROUTE_BASE_URLS = {
  driving: "https://routing.openstreetmap.de/routed-car/route/v1/driving",
  cycling: "https://routing.openstreetmap.de/routed-bike/route/v1/driving",
  walking: "https://routing.openstreetmap.de/routed-foot/route/v1/driving",
};

const OSRM_NEAREST_BASE_URLS = {
  driving: "https://routing.openstreetmap.de/routed-car/nearest/v1/driving",
  cycling: "https://routing.openstreetmap.de/routed-bike/nearest/v1/driving",
  walking: "https://routing.openstreetmap.de/routed-foot/nearest/v1/driving",
};

// ── OpenRouteService-Endpunkte ─────────────────────────────────

const OPEN_ROUTE_SERVICE_BASE_URL = "https://api.openrouteservice.org/v2/directions";
const OPEN_ROUTE_SERVICE_API_KEY  = import.meta.env.VITE_ORS_API_KEY ?? "";

const OPEN_ROUTE_SERVICE_PROFILE_BY_ROUTE_PROFILE = {
  driving: "driving-car",
  cycling: "cycling-regular",
  walking: "foot-walking",
};

// ── Einstellungen ─────────────────────────────────

const MAXIMUM_ALLOWED_SNAP_DISTANCE_IN_METERS = 5000;

// ── Icons ─────────────────────────────────

const OSRM_MANEUVER_ICONS = {
  "turn-left":         "↰",
  "turn-right":        "↱",
  "turn-slight left":  "↖",
  "turn-slight right": "↗",
  "turn-sharp left":   "↰",
  "turn-sharp right":  "↱",
  "turn-straight":     "↑",
  depart:              "▶",
  arrive:              "⬤",
  merge:               "↱",
  roundabout:          "↻",
  rotary:              "↻",
  fork:                "↱",
  continue:            "↑",
};

const OPEN_ROUTE_SERVICE_STEP_ICONS = {
  0:  "↰",
  1:  "↱",
  2:  "↢",
  3:  "↣",
  4:  "↖",
  5:  "↗",
  6:  "↑",
  7:  "↻",
  8:  "↻",
  10: "▶",
  11: "⬤",
  12: "↰",
  13: "↱",
};

// ── Koordinaten und Distanzen ─────────────────────────────────

function convertDegreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function hasValidCoordinates(location) {
  return (
    Number.isFinite(Number(location?.latitude)) &&
    Number.isFinite(Number(location?.longitude))
  );
}

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

function convertLngLatCoordinatesToLeafletCoordinates(coordinates) {
  return coordinates.map((coordinatePair) => {
    return [
      coordinatePair[1],
      coordinatePair[0],
    ];
  });
}

// ── Routing-Auswahl ─────────────────────────────────

function shouldUseOpenRouteService(routeProfile, routePreference) {
  return (
    routeProfile === "driving" &&
    (routePreference === "shortest" || routePreference === "no_motorway")
  );
}

// ── Straßen-Snapping ─────────────────────────────────

async function snapLocationToNearestRoad(location, routeProfile = "driving") {
  const baseUrl =
    OSRM_NEAREST_BASE_URLS[routeProfile] ??
    OSRM_NEAREST_BASE_URLS.driving;

  const coordinateText = `${location.longitude},${location.latitude}`;
  const requestUrl     = `${baseUrl}/${coordinateText}?number=1`;

  const response = await fetch(requestUrl);

  if (!response.ok) {
    return location;
  }

  const data = await response.json();

  if (data.code !== "Ok" || !data.waypoints?.length) {
    return location;
  }

  const nearestWaypoint = data.waypoints[0];

  const snappedLocation = {
    ...location,
    longitude:                nearestWaypoint.location[0],
    latitude:                 nearestWaypoint.location[1],
    snappedDistanceInMeters:  nearestWaypoint.distance ?? null,
  };

  const snapDistanceInMeters =
    nearestWaypoint.distance ??
    calculateDistanceInMeters(location, snappedLocation);

  if (snapDistanceInMeters > MAXIMUM_ALLOWED_SNAP_DISTANCE_IN_METERS) {
    return location;
  }

  return snappedLocation;
}

async function snapStopsToNearestRoads(stops, routeProfile = "driving") {
  return Promise.all(
    stops.map((stop) => {
      return snapLocationToNearestRoad(stop, routeProfile);
    })
  );
}

function isOpenRouteServiceSnapError(error) {
  return String(error?.message ?? "")
    .toLowerCase()
    .includes("could not find routable point");
}

// ── Allgemeine Routen-Helfer ─────────────────────────────────

function buildRoadText(roadName) {
  return roadName ? `auf ${roadName}` : "";
}

function buildSummaryFromSteps(steps = []) {
  const streetNames = [];

  for (const step of steps) {
    const streetName = step.name?.trim();

    if (!streetName || streetNames.includes(streetName)) {
      continue;
    }

    streetNames.push(streetName);

    if (streetNames.length >= 2) {
      break;
    }
  }

  return streetNames.join(", ");
}

// ── OSRM: Anweisungen bauen ─────────────────────────────────

function getOsrmManeuverIcon(maneuver = {}) {
  const maneuverKey = `${maneuver.type}-${maneuver.modifier ?? ""}`
    .trim()
    .replace(/-$/, "");

  return (
    OSRM_MANEUVER_ICONS[maneuverKey] ||
    OSRM_MANEUVER_ICONS[maneuver.type] ||
    "↑"
  );
}

function buildOsrmRouteInstruction(routeStep) {
  const maneuver = routeStep.maneuver ?? {};
  const roadText = buildRoadText(routeStep.name);

  switch (maneuver.type) {
    case "depart":
      return `Start ${roadText}`.trim();

    case "arrive":
      return "Ziel erreicht";

    case "turn":
      if (maneuver.modifier?.includes("left")) {
        return `Links abbiegen ${roadText}`.trim();
      }

      if (maneuver.modifier?.includes("right")) {
        return `Rechts abbiegen ${roadText}`.trim();
      }

      return `Geradeaus ${roadText}`.trim();

    case "continue":
      return `Weiter ${roadText}`.trim();

    case "merge":
      return `Einfädeln ${roadText}`.trim();

    case "roundabout":
    case "rotary":
      return `Im Kreisverkehr ${roadText}`.trim();

    case "fork":
      return `An der Gabelung ${roadText}`.trim();

    default:
      return `Weiter ${roadText}`.trim();
  }
}

// ── OSRM: Parsing ─────────────────────────────────

function parseOsrmRouteStep(routeStep, stepIndex) {
  const maneuverLocation = routeStep.maneuver?.location
    ? {
        latitude:  routeStep.maneuver.location[1],
        longitude: routeStep.maneuver.location[0],
      }
    : null;

  return {
    index:            stepIndex,
    instruction:      buildOsrmRouteInstruction(routeStep),
    icon:             getOsrmManeuverIcon(routeStep.maneuver),
    distance:         routeStep.distance,
    duration:         routeStep.duration,
    name:             routeStep.name || "",
    ref:              routeStep.ref || "",
    maneuverLocation,
  };
}

function parseOsrmRoute(osrmRoute) {
  const steps = (osrmRoute.legs?.[0]?.steps ?? []).map(parseOsrmRouteStep);

  return {
    coordinates: convertLngLatCoordinatesToLeafletCoordinates(
      osrmRoute.geometry.coordinates
    ),
    distance: osrmRoute.distance,
    duration: osrmRoute.duration,
    summary:  osrmRoute.legs?.[0]?.summary || buildSummaryFromSteps(steps),
    steps,
  };
}

function buildOsrmLegCoordinates(osrmLeg) {
  const legCoordinates = [];

  for (const routeStep of osrmLeg.steps ?? []) {
    if (!routeStep.geometry?.coordinates) {
      continue;
    }

    legCoordinates.push(
      ...convertLngLatCoordinatesToLeafletCoordinates(
        routeStep.geometry.coordinates
      )
    );
  }

  return legCoordinates;
}

function parseOsrmRouteLeg(osrmLeg, legIndex) {
  const steps = (osrmLeg.steps ?? []).map(parseOsrmRouteStep);

  return {
    index:       legIndex,
    coordinates: buildOsrmLegCoordinates(osrmLeg),
    distance:    osrmLeg.distance,
    duration:    osrmLeg.duration,
    summary:     osrmLeg.summary || buildSummaryFromSteps(steps),
    steps,
  };
}

// ── OSRM: URLs bauen ─────────────────────────────────

function buildOsrmRouteUrl(startLocation, targetLocation, routeProfile) {
  const baseUrl = OSRM_ROUTE_BASE_URLS[routeProfile] ?? OSRM_ROUTE_BASE_URLS.driving;

  const coordinateText = [
    `${startLocation.longitude},${startLocation.latitude}`,
    `${targetLocation.longitude},${targetLocation.latitude}`,
  ].join(";");

  const routeParams = new URLSearchParams({
    geometries:   "geojson",
    overview:     "full",
    steps:        "true",
    alternatives: "3",
  });

  return `${baseUrl}/${coordinateText}?${routeParams}`;
}

function buildOsrmMultiStopRouteUrl(stops, routeProfile) {
  const baseUrl = OSRM_ROUTE_BASE_URLS[routeProfile] ?? OSRM_ROUTE_BASE_URLS.driving;

  const coordinateText = stops
    .map((stop) => {
      return `${stop.longitude},${stop.latitude}`;
    })
    .join(";");

  const routeParams = new URLSearchParams({
    geometries: "geojson",
    overview:   "full",
    steps:      "true",
  });

  return `${baseUrl}/${coordinateText}?${routeParams}`;
}

// ── OSRM: Antwort prüfen ─────────────────────────────────

function areOsrmWaypointsReachable(osrmWaypoints) {
  if (!osrmWaypoints?.length) {
    return false;
  }

  return osrmWaypoints.every((waypoint) => {
    const snapDistanceInMeters = waypoint.distance ?? 0;

    return snapDistanceInMeters <= MAXIMUM_ALLOWED_SNAP_DISTANCE_IN_METERS;
  });
}

function validateOsrmRouteResponse(data, missingRouteMessage) {
  if (data.code !== "Ok" || !data.routes?.length) {
    throw new Error(missingRouteMessage);
  }

  if (!areOsrmWaypointsReachable(data.waypoints)) {
    throw new Error("Mindestens ein Punkt ist auf dieser Route nicht erreichbar.");
  }
}

// ── OpenRouteService: Anfrage bauen ─────────────────────────────────

function getOpenRouteServiceProfile(routeProfile) {
  return (
    OPEN_ROUTE_SERVICE_PROFILE_BY_ROUTE_PROFILE[routeProfile] ??
    OPEN_ROUTE_SERVICE_PROFILE_BY_ROUTE_PROFILE.driving
  );
}

function buildOpenRouteServiceRequestBody(stops, routePreference) {
  const requestBody = {
    coordinates: stops.map((stop) => {
      return [
        stop.longitude,
        stop.latitude,
      ];
    }),
    instructions: true,
    preference:   routePreference === "shortest" ? "shortest" : "fastest",
  };

  if (routePreference === "no_motorway") {
    requestBody.options = {
      avoid_features: ["highways"],
    };
  }

  return requestBody;
}

async function fetchOpenRouteServiceRoute(stops, routeProfile, routePreference) {
  if (!OPEN_ROUTE_SERVICE_API_KEY) {
    throw new Error(
      "OpenRouteService API-Key fehlt. Lege VITE_ORS_API_KEY in deiner .env-Datei an."
    );
  }

  const orsProfile = getOpenRouteServiceProfile(routeProfile);
  const requestUrl = `${OPEN_ROUTE_SERVICE_BASE_URL}/${orsProfile}/geojson`;

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json; charset=utf-8",
      Accept:          "application/geo+json, application/json",
      Authorization:   OPEN_ROUTE_SERVICE_API_KEY,
    },
    body: JSON.stringify(
      buildOpenRouteServiceRequestBody(stops, routePreference)
    ),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        data?.message ||
        `OpenRouteService Fehler (${response.status}).`
    );
  }

  const routeFeature = data?.features?.[0];

  if (!routeFeature) {
    throw new Error("OpenRouteService hat keine Route gefunden.");
  }

  return routeFeature;
}

// ── OpenRouteService: Parsing ─────────────────────────────────

function parseOpenRouteServiceStep(orsStep, stepIndex, allCoordinates) {
  const coordinateIndex = orsStep.way_points?.[0] ?? 0;
  const coordinatePair  = allCoordinates[coordinateIndex];

  const maneuverLocation = coordinatePair
    ? {
        latitude:  coordinatePair[1],
        longitude: coordinatePair[0],
      }
    : null;

  return {
    index:            stepIndex,
    instruction:      orsStep.instruction || "Weiter",
    icon:             OPEN_ROUTE_SERVICE_STEP_ICONS[orsStep.type] || "↑",
    distance:         orsStep.distance ?? 0,
    duration:         orsStep.duration ?? 0,
    name:             orsStep.name || "",
    ref:              "",
    maneuverLocation,
  };
}

function parseOpenRouteServiceRoute(routeFeature) {
  const allCoordinates = routeFeature.geometry?.coordinates ?? [];
  const properties     = routeFeature.properties ?? {};
  const summary        = properties.summary ?? {};
  const firstSegment   = properties.segments?.[0];

  const steps = (firstSegment?.steps ?? []).map((step, stepIndex) => {
    return parseOpenRouteServiceStep(step, stepIndex, allCoordinates);
  });

  return {
    coordinates: convertLngLatCoordinatesToLeafletCoordinates(allCoordinates),
    distance:    summary.distance ?? 0,
    duration:    summary.duration ?? 0,
    summary:     buildSummaryFromSteps(steps),
    steps,
  };
}

function buildOpenRouteServiceSegmentCoordinates(orsSegment, allCoordinates) {
  const waypointIndexes = [];

  for (const step of orsSegment.steps ?? []) {
    if (!step.way_points) {
      continue;
    }

    waypointIndexes.push(...step.way_points);
  }

  if (!waypointIndexes.length) {
    return convertLngLatCoordinatesToLeafletCoordinates(allCoordinates);
  }

  const startIndex = Math.min(...waypointIndexes);
  const endIndex   = Math.max(...waypointIndexes);

  return convertLngLatCoordinatesToLeafletCoordinates(
    allCoordinates.slice(startIndex, endIndex + 1)
  );
}

function parseOpenRouteServiceLeg(orsSegment, legIndex, allCoordinates) {
  const steps = (orsSegment.steps ?? []).map((step, stepIndex) => {
    return parseOpenRouteServiceStep(step, stepIndex, allCoordinates);
  });

  return {
    index:       legIndex,
    coordinates: buildOpenRouteServiceSegmentCoordinates(
      orsSegment,
      allCoordinates
    ),
    distance: orsSegment.distance ?? 0,
    duration: orsSegment.duration ?? 0,
    summary:  buildSummaryFromSteps(steps),
    steps,
  };
}

function parseOpenRouteServiceMultiStopRoute(routeFeature) {
  const allCoordinates = routeFeature.geometry?.coordinates ?? [];
  const properties     = routeFeature.properties ?? {};
  const summary        = properties.summary ?? {};
  const segments       = properties.segments ?? [];

  return {
    legs: segments.map((segment, segmentIndex) => {
      return parseOpenRouteServiceLeg(segment, segmentIndex, allCoordinates);
    }),
    totalDistance:   summary.distance ?? 0,
    totalDuration:   summary.duration ?? 0,
    fullCoordinates: convertLngLatCoordinatesToLeafletCoordinates(allCoordinates),
  };
}

// ── OpenRouteService: Snap-Fallback ─────────────────────────────────

async function fetchOpenRouteServiceRouteWithSnapFallback(
  stops,
  routeProfile,
  routePreference
) {
  try {
    return await fetchOpenRouteServiceRoute(
      stops,
      routeProfile,
      routePreference
    );
  } catch (error) {
    if (!isOpenRouteServiceSnapError(error)) {
      throw error;
    }

    const snappedStops = await snapStopsToNearestRoads(stops, routeProfile);

    return fetchOpenRouteServiceRoute(
      snappedStops,
      routeProfile,
      routePreference
    );
  }
}

// ── Öffentliche Funktion: einfache Route ─────────────────────────────────

export async function calculateRoute(
  startLocation,
  targetLocation,
  routeProfile = "driving",
  routePreference = "fastest"
) {
  if (!startLocation || !targetLocation) {
    throw new Error("Start- oder Zielpunkt fehlt.");
  }

  if (shouldUseOpenRouteService(routeProfile, routePreference)) {
    const routeFeature = await fetchOpenRouteServiceRouteWithSnapFallback(
      [startLocation, targetLocation],
      routeProfile,
      routePreference
    );

    return [
      parseOpenRouteServiceRoute(routeFeature),
    ];
  }

  const routeUrl = buildOsrmRouteUrl(
    startLocation,
    targetLocation,
    routeProfile
  );

  const response = await fetch(routeUrl);

  if (!response.ok) {
    throw new Error("Routing-Server ist gerade nicht erreichbar.");
  }

  const data = await response.json();

  validateOsrmRouteResponse(data, "Keine Route gefunden.");

  return data.routes.map(parseOsrmRoute);
}

// ── Öffentliche Funktion: Route mit Zwischenstopps ─────────────────────────────────

export async function calculateRouteWithStops(
  stops,
  routeProfile = "driving",
  routePreference = "fastest"
) {
  if (!stops || stops.length < 2) {
    throw new Error("Mindestens Start und Ziel erforderlich.");
  }

  if (shouldUseOpenRouteService(routeProfile, routePreference)) {
    const routeFeature = await fetchOpenRouteServiceRouteWithSnapFallback(
      stops,
      routeProfile,
      routePreference
    );

    return parseOpenRouteServiceMultiStopRoute(routeFeature);
  }

  const routeUrl = buildOsrmMultiStopRouteUrl(stops, routeProfile);
  const response = await fetch(routeUrl);

  if (!response.ok) {
    throw new Error("Routing-Server ist gerade nicht erreichbar.");
  }

  const data = await response.json();

  validateOsrmRouteResponse(
    data,
    "Keine Route mit diesen Stopps gefunden."
  );

  const osrmRoute = data.routes[0];

  return {
    legs: (osrmRoute.legs ?? []).map(parseOsrmRouteLeg),
    totalDistance:   osrmRoute.distance,
    totalDuration:   osrmRoute.duration,
    fullCoordinates: convertLngLatCoordinatesToLeafletCoordinates(
      osrmRoute.geometry.coordinates
    ),
  };
}