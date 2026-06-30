/**
 * traffic.js
 *
 * Lädt Verkehrsmeldungen von der offiziellen Autobahn-API.
 *
 * Wichtig:
 * - Abdeckung nur für deutsche Autobahnen
 * - Sperrungs-Endpunkt wird bewusst nicht geladen
 * - Staus, Pannen, Unfälle und Gefahren kommen über den Warning-Endpunkt
 * - Baustellen werden geladen, aber gefiltert und gruppiert
 */

// ── API-Endpunkt ─────────────────────────────────

const AUTOBAHN_API_BASE_URL = "https://verkehr.autobahn.de/o/autobahn";

// ── Einstellungen ─────────────────────────────────

const MAX_TRAFFIC_INCIDENTS_TO_RETURN     = 8;
const MAX_DISTANCE_FROM_ROUTE_IN_METERS   = 2500;
const ROUTE_COORDINATE_SAMPLE_STEP        = 8;
const EARTH_RADIUS_IN_METERS              = 6371000;

// ── Meldungstypen ─────────────────────────────────

export const TRAFFIC_INCIDENT_TYPES = {
  roadworks: {
    endpoint: "roadworks",
    listKey:  "roadworks",
    label:    "Baustelle",
    icon:     "🚧",
  },
  warning: {
    endpoint: "warning",
    listKey:  "warning",
    label:    "Verkehrsmeldung",
    icon:     "⚠️",
  },
};

// ── Winkel und Distanzen ─────────────────────────────────

function convertDegreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function hasValidCoordinates(point) {
  return (
    Number.isFinite(Number(point?.latitude)) &&
    Number.isFinite(Number(point?.longitude))
  );
}

function calculateDistanceInMeters(firstPoint, secondPoint) {
  if (!hasValidCoordinates(firstPoint) || !hasValidCoordinates(secondPoint)) {
    return Number.POSITIVE_INFINITY;
  }

  const firstLatitudeInRadians  = convertDegreesToRadians(firstPoint.latitude);
  const secondLatitudeInRadians = convertDegreesToRadians(secondPoint.latitude);

  const latitudeDifferenceInRadians =
    convertDegreesToRadians(secondPoint.latitude - firstPoint.latitude);

  const longitudeDifferenceInRadians =
    convertDegreesToRadians(secondPoint.longitude - firstPoint.longitude);

  const haversineValue =
    Math.sin(latitudeDifferenceInRadians / 2) ** 2 +
    Math.cos(firstLatitudeInRadians) *
      Math.cos(secondLatitudeInRadians) *
      Math.sin(longitudeDifferenceInRadians / 2) ** 2;

  return EARTH_RADIUS_IN_METERS * 2 * Math.atan2(
    Math.sqrt(haversineValue),
    Math.sqrt(1 - haversineValue)
  );
}

// ── Autobahnen aus Routen-Steps erkennen ─────────────────────────────────

function extractAutobahnIdentifiersFromText(text) {
  const identifiers = new Set();
  const normalizedText = String(text ?? "");

  const autobahnRegex = /(?:^|[\s,;()/-])A\s?(\d{1,3})(?=$|[\s,;()/-])/gi;

  let match;

  while ((match = autobahnRegex.exec(normalizedText)) !== null) {
    identifiers.add(`A${match[1]}`);
  }

  return [...identifiers];
}

function extractAutobahnIdentifiers(routeSteps) {
  const identifiers = new Set();

  for (const routeStep of routeSteps ?? []) {
    const searchableTexts = [
      routeStep.ref,
      routeStep.name,
      routeStep.instruction,
      routeStep.summary,
    ];

    for (const text of searchableTexts) {
      const foundIdentifiers = extractAutobahnIdentifiersFromText(text);

      for (const identifier of foundIdentifiers) {
        identifiers.add(identifier);
      }
    }
  }

  return [...identifiers];
}

// ── Routenkoordinaten vorbereiten ─────────────────────────────────

function normalizeRouteCoordinate(routeCoordinate) {
  if (Array.isArray(routeCoordinate)) {
    return {
      latitude:  Number(routeCoordinate[0]),
      longitude: Number(routeCoordinate[1]),
    };
  }

  return {
    latitude:  Number(routeCoordinate?.latitude),
    longitude: Number(routeCoordinate?.longitude),
  };
}

function sampleRouteCoordinates(routeCoordinates) {
  if (!routeCoordinates?.length) {
    return [];
  }

  const sampledCoordinates = [];

  for (
    let coordinateIndex = 0;
    coordinateIndex < routeCoordinates.length;
    coordinateIndex += ROUTE_COORDINATE_SAMPLE_STEP
  ) {
    const routePoint = normalizeRouteCoordinate(routeCoordinates[coordinateIndex]);

    if (hasValidCoordinates(routePoint)) {
      sampledCoordinates.push(routePoint);
    }
  }

  const lastRoutePoint = normalizeRouteCoordinate(
    routeCoordinates[routeCoordinates.length - 1]
  );

  if (hasValidCoordinates(lastRoutePoint)) {
    sampledCoordinates.push(lastRoutePoint);
  }

  return sampledCoordinates;
}

function calculateDistanceToRouteInMeters(point, sampledRouteCoordinates) {
  if (!hasValidCoordinates(point) || !sampledRouteCoordinates?.length) {
    return Number.POSITIVE_INFINITY;
  }

  let shortestDistanceInMeters = Number.POSITIVE_INFINITY;

  for (const routePoint of sampledRouteCoordinates) {
    const distanceInMeters = calculateDistanceInMeters(point, routePoint);

    if (distanceInMeters < shortestDistanceInMeters) {
      shortestDistanceInMeters = distanceInMeters;
    }
  }

  return shortestDistanceInMeters;
}

// ── Text normalisieren ─────────────────────────────────

function normalizeIncidentText(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeDescriptionList(description) {
  if (Array.isArray(description)) {
    return description.filter(Boolean).slice(0, 4);
  }

  if (typeof description === "string" && description.trim()) {
    return [description.trim()];
  }

  return [];
}

function buildIncidentSearchText(incident) {
  return [
    incident.typeLabel,
    incident.title,
    incident.subtitle,
    ...(incident.description ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

// ── Meldung darstellen ─────────────────────────────────

function getIncidentPresentation(rawIncident, typeKey) {
  const typeDefinition = TRAFFIC_INCIDENT_TYPES[typeKey];

  const description = normalizeDescriptionList(rawIncident.description);

  const text = [
    rawIncident.title,
    rawIncident.subtitle,
    ...description,
  ]
    .join(" ")
    .toLowerCase();

  if (
    text.includes("panne") ||
    text.includes("pannenfahrzeug") ||
    text.includes("liegengeblieben") ||
    text.includes("defektes fahrzeug")
  ) {
    return {
      typeLabel: "Panne",
      icon:      "🔧",
    };
  }

  if (
    text.includes("unfall") ||
    text.includes("rettung") ||
    text.includes("bergung")
  ) {
    return {
      typeLabel: "Unfall",
      icon:      "🚨",
    };
  }

  if (
    text.includes("stau") ||
    text.includes("stockender verkehr") ||
    text.includes("zaehfliessender verkehr") ||
    text.includes("zähfließender verkehr")
  ) {
    return {
      typeLabel: "Stau",
      icon:      "🚗",
    };
  }

  if (
    text.includes("gefahr") ||
    text.includes("hindernis") ||
    text.includes("gegenstand") ||
    text.includes("personen") ||
    text.includes("tiere")
  ) {
    return {
      typeLabel: "Gefahr",
      icon:      "⚠️",
    };
  }

  return {
    typeLabel: typeDefinition.label,
    icon:      typeDefinition.icon,
  };
}

// ── Meldungen priorisieren ─────────────────────────────────

function getIncidentPriority(incident) {
  const text = buildIncidentSearchText(incident);

  if (
    text.includes("panne") ||
    text.includes("pannenfahrzeug") ||
    text.includes("liegengeblieben") ||
    text.includes("unfall") ||
    text.includes("rettung") ||
    text.includes("bergung")
  ) {
    return 0;
  }

  if (
    text.includes("stau") ||
    text.includes("stockender verkehr") ||
    text.includes("zaehfliessender verkehr") ||
    text.includes("zähfließender verkehr")
  ) {
    return 1;
  }

  if (
    text.includes("gefahr") ||
    text.includes("hindernis") ||
    text.includes("gegenstand")
  ) {
    return 2;
  }

  if (
    text.includes("baustelle") ||
    text.includes("bauarbeiten") ||
    text.includes("fahrstreifen")
  ) {
    return 3;
  }

  return 4;
}

// ── Duplikate entfernen ─────────────────────────────────

function removeDuplicateIncidents(incidents) {
  const seenIncidentKeys = new Set();

  return incidents.filter((incident) => {
    const duplicateKey = [
      incident.identifier,
      incident.road,
      incident.typeKey,
      incident.title,
      incident.subtitle,
      incident.latitude?.toFixed(5),
      incident.longitude?.toFixed(5),
    ]
      .filter(Boolean)
      .join("|");

    if (seenIncidentKeys.has(duplicateKey)) {
      return false;
    }

    seenIncidentKeys.add(duplicateKey);

    return true;
  });
}

// ── Ähnliche Baustellen gruppieren ─────────────────────────────────

function shouldGroupIncident(incident) {
  return incident.typeLabel === "Baustelle";
}

function getIncidentGroupKey(incident) {
  const title    = normalizeIncidentText(incident.title);
  const subtitle = normalizeIncidentText(incident.subtitle);

  return [
    incident.road || "",
    incident.typeLabel || "",
    subtitle || title,
  ].join("|");
}

function appendGroupedCountToSubtitle(subtitle, groupedCount) {
  const groupedCountText = `${groupedCount} Meldungen`;

  if (!subtitle) {
    return groupedCountText;
  }

  return `${subtitle} · ${groupedCountText}`;
}

function groupSimilarIncidents(incidents) {
  const groupedIncidents = new Map();
  const ungroupedIncidents = [];

  for (const incident of incidents) {
    if (!shouldGroupIncident(incident)) {
      ungroupedIncidents.push(incident);
      continue;
    }

    const groupKey = getIncidentGroupKey(incident);
    const existingGroup = groupedIncidents.get(groupKey);

    if (!existingGroup) {
      groupedIncidents.set(groupKey, {
        ...incident,
        groupedCount: 1,
      });

      continue;
    }

    groupedIncidents.set(groupKey, {
      ...existingGroup,
      groupedCount: existingGroup.groupedCount + 1,
      distanceFromRouteInMeters: Math.min(
        existingGroup.distanceFromRouteInMeters,
        incident.distanceFromRouteInMeters
      ),
      priority: Math.min(existingGroup.priority, incident.priority),
    });
  }

  const groupedResult = [...groupedIncidents.values()].map((incident) => {
    if (!incident.groupedCount || incident.groupedCount <= 1) {
      return incident;
    }

    return {
      ...incident,
      subtitle: appendGroupedCountToSubtitle(
        incident.subtitle,
        incident.groupedCount
      ),
    };
  });

  return [
    ...ungroupedIncidents,
    ...groupedResult,
  ];
}

// ── Meldungen für konkrete Route filtern ─────────────────────────────────

function filterAndSortIncidentsForRoute(incidents, routeCoordinates) {
  const sampledRouteCoordinates = sampleRouteCoordinates(routeCoordinates);

  const incidentsNearRoute = removeDuplicateIncidents(incidents)
    .map((incident) => {
      const incidentPoint = {
        latitude:  incident.latitude,
        longitude: incident.longitude,
      };

      const distanceFromRouteInMeters = calculateDistanceToRouteInMeters(
        incidentPoint,
        sampledRouteCoordinates
      );

      return {
        ...incident,
        distanceFromRouteInMeters,
        priority: getIncidentPriority(incident),
      };
    })
    .filter((incident) => {
      return incident.distanceFromRouteInMeters <= MAX_DISTANCE_FROM_ROUTE_IN_METERS;
    });

  return groupSimilarIncidents(incidentsNearRoute)
    .sort((firstIncident, secondIncident) => {
      if (firstIncident.priority !== secondIncident.priority) {
        return firstIncident.priority - secondIncident.priority;
      }

      return (
        firstIncident.distanceFromRouteInMeters -
        secondIncident.distanceFromRouteInMeters
      );
    })
    .slice(0, MAX_TRAFFIC_INCIDENTS_TO_RETURN);
}

// ── API-Meldung in App-Format umwandeln ─────────────────────────────────

function parseTrafficIncident(rawIncident, typeKey, autobahnIdentifier) {
  const latitude  = Number(rawIncident.coordinate?.lat);
  const longitude = Number(rawIncident.coordinate?.long);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const description = normalizeDescriptionList(rawIncident.description);

  const presentation = getIncidentPresentation(
    {
      ...rawIncident,
      description,
    },
    typeKey
  );

  return {
    identifier: rawIncident.identifier || `${typeKey}-${latitude}-${longitude}`,
    road:       autobahnIdentifier,

    typeKey,
    typeLabel: presentation.typeLabel,
    icon:      presentation.icon,

    title:       rawIncident.title?.trim() || presentation.typeLabel,
    subtitle:    rawIncident.subtitle?.trim() || "",
    description,

    latitude,
    longitude,
  };
}

// ── Meldungen je Autobahn laden ─────────────────────────────────

async function fetchIncidentsForAutobahn(autobahnIdentifier, typeKey, signal) {
  const typeDefinition = TRAFFIC_INCIDENT_TYPES[typeKey];

  const requestUrl =
    `${AUTOBAHN_API_BASE_URL}/${autobahnIdentifier}/services/${typeDefinition.endpoint}`;

  const response = await fetch(requestUrl, { signal });

  if (!response.ok) {
    return [];
  }

  const responseData = await response.json();
  const rawIncidents = responseData[typeDefinition.listKey] ?? [];

  return rawIncidents
    .map((rawIncident) => {
      return parseTrafficIncident(rawIncident, typeKey, autobahnIdentifier);
    })
    .filter(Boolean);
}

// ── Öffentliche Funktion ─────────────────────────────────

export async function fetchTrafficIncidentsForRoute(
  routeSteps,
  routeCoordinates,
  options = {}
) {
  const { signal } = options;

  const autobahnIdentifiers = extractAutobahnIdentifiers(routeSteps);

  if (!autobahnIdentifiers.length || !routeCoordinates?.length) {
    return [];
  }

  const fetchTasks = autobahnIdentifiers.flatMap((autobahnIdentifier) => {
    return Object.keys(TRAFFIC_INCIDENT_TYPES).map((typeKey) => {
      return fetchIncidentsForAutobahn(autobahnIdentifier, typeKey, signal)
        .catch(() => []);
    });
  });

  const incidentLists = await Promise.all(fetchTasks);
  const allIncidents  = incidentLists.flat();

  return filterAndSortIncidentsForRoute(allIncidents, routeCoordinates);
}