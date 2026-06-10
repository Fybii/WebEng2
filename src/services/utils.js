/**
 * utils.js
 *
 * Enthält kleine Hilfsfunktionen für Entfernungen, Dauerangaben
 * und Texte rund um Standorte und Routen.
 */

// ── Konstanten ─────────────────────────────────

const EARTH_RADIUS_IN_KILOMETERS                   = 6371;
const AVERAGE_WALKING_SPEED_IN_KILOMETERS_PER_HOUR = 5;
const DRIVING_ROUTE_DISTANCE_FACTOR                = 1.25;

// ── Winkel umrechnen ─────────────────────────────────

function convertDegreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

// ── Dauer formatieren ─────────────────────────────────

function formatMinutesAsReadableDuration(totalMinutes) {
  if (!totalMinutes || totalMinutes <= 0) {
    return "0 Min";
  }

  const days                      = Math.floor(totalMinutes / (24 * 60));
  const remainingMinutesAfterDays = totalMinutes % (24 * 60);

  const hours   = Math.floor(remainingMinutesAfterDays / 60);
  const minutes = remainingMinutesAfterDays % 60;

  if (days > 0) {
    if (hours > 0) {
      return `${days} ${days === 1 ? "Tag" : "Tage"} ${hours} Std`;
    }

    return `${days} ${days === 1 ? "Tag" : "Tage"}`;
  }

  if (hours > 0) {
    if (minutes > 0) {
      return `${hours} Std ${minutes} Min`;
    }

    return `${hours} Std`;
  }

  return `${minutes} Min`;
}

// ── Entfernung zwischen zwei Koordinaten berechnen ─────────────────────────────────

export function calculateHaversineDistanceInKilometers(
  firstLatitude,
  firstLongitude,
  secondLatitude,
  secondLongitude
) {
  const latitudeDifferenceInRadians =
    convertDegreesToRadians(secondLatitude - firstLatitude);

  const longitudeDifferenceInRadians =
    convertDegreesToRadians(secondLongitude - firstLongitude);

  const firstLatitudeInRadians  = convertDegreesToRadians(firstLatitude);
  const secondLatitudeInRadians = convertDegreesToRadians(secondLatitude);

  const haversineValue =
    Math.sin(latitudeDifferenceInRadians / 2) ** 2 +
    Math.cos(firstLatitudeInRadians) *
      Math.cos(secondLatitudeInRadians) *
      Math.sin(longitudeDifferenceInRadians / 2) ** 2;

  return EARTH_RADIUS_IN_KILOMETERS * 2 * Math.atan2(
    Math.sqrt(haversineValue),
    Math.sqrt(1 - haversineValue)
  );
}

// ── Luftlinienentfernung formatieren ─────────────────────────────────

export function formatDistance(distanceInKilometers) {
  if (!Number.isFinite(distanceInKilometers)) {
    return "-";
  }

  if (distanceInKilometers < 1) {
    const distanceInMeters = Math.round(distanceInKilometers * 1000);

    return `${distanceInMeters} m`;
  }

  return `${distanceInKilometers.toFixed(1)} km`;
}

// ── Geschätzte Laufzeit formatieren ─────────────────────────────────

export function formatEstimatedWalkingDuration(distanceInKilometers) {
  if (!distanceInKilometers || distanceInKilometers <= 0) {
    return "0 Min";
  }

  const totalMinutes = Math.max(
    1,
    Math.round(
      (distanceInKilometers / AVERAGE_WALKING_SPEED_IN_KILOMETERS_PER_HOUR) * 60
    )
  );

  return formatMinutesAsReadableDuration(totalMinutes);
}

// ── Geschätzte Auto-Fahrzeit formatieren ─────────────────────────────────

export function formatEstimatedDrivingDuration(distanceInKilometers) {
  if (!distanceInKilometers || distanceInKilometers <= 0) {
    return "0 Min";
  }

  const estimatedRouteDistanceInKilometers =
    distanceInKilometers * DRIVING_ROUTE_DISTANCE_FACTOR;

  let averageSpeedInKilometersPerHour = 50;

  if (estimatedRouteDistanceInKilometers > 50) {
    averageSpeedInKilometersPerHour = 80;
  }

  if (estimatedRouteDistanceInKilometers > 300) {
    averageSpeedInKilometersPerHour = 95;
  }

  const totalMinutes = Math.max(
    1,
    Math.round(
      (estimatedRouteDistanceInKilometers / averageSpeedInKilometersPerHour) *
        60
    )
  );

  return formatMinutesAsReadableDuration(totalMinutes);
}

// ── Nähe zum Ziel beschreiben ─────────────────────────────────

export function formatProximity(distanceInKilometers) {
  if (!Number.isFinite(distanceInKilometers)) {
    return "-";
  }

  if (distanceInKilometers < 0.3) {
    return "direkt nebenan";
  }

  return formatDistance(distanceInKilometers);
}

// ── Routenentfernung formatieren ─────────────────────────────────

export function formatRouteDistance(distanceInMeters) {
  if (!Number.isFinite(distanceInMeters)) {
    return "-";
  }

  if (distanceInMeters < 1000) {
    return `${Math.round(distanceInMeters)} m`;
  }

  const distanceInKilometers = distanceInMeters / 1000;

  if (distanceInKilometers < 10) {
    return `${distanceInKilometers.toFixed(1)} km`;
  }

  return `${Math.round(distanceInKilometers)} km`;
}

// ── Routendauer formatieren ─────────────────────────────────

export function formatRouteDuration(durationInSeconds) {
  if (!durationInSeconds || durationInSeconds <= 0) {
    return "0 Min";
  }

  const totalMinutes = Math.max(1, Math.round(durationInSeconds / 60));

  return formatMinutesAsReadableDuration(totalMinutes);
}