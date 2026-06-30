/**
 * geo.js
 *
 * Verwaltet die Standortüberwachung über die Browser-Geolocation.
 * Die Datei liefert eine Funktion, mit der der aktuelle Standort einmalig
 * gelesen und danach dauerhaft beobachtet wird.
 */

// ── Fehlercodes ─────────────────────────────────

const GEOLOCATION_ERROR_NOT_SUPPORTED     = "not_supported";
const GEOLOCATION_ERROR_PERMISSION_DENIED = "permission_denied";
const GEOLOCATION_ERROR_UNAVAILABLE       = "unavailable";

// ── Standortoptionen ─────────────────────────────────

const INITIAL_POSITION_OPTIONS = {
  enableHighAccuracy: false,
  timeout:            10000,
  maximumAge:         60000,
};

const WATCH_POSITION_OPTIONS = {
  enableHighAccuracy: true,
  timeout:            20000,
  maximumAge:         5000,
};

// ── Standortdaten erstellen ─────────────────────────────────

function createLocationFromPosition(position) {
  const hasValidHeading = Number.isFinite(position.coords.heading);

  return {
    latitude:  position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy:  position.coords.accuracy,
    heading:   hasValidHeading ? position.coords.heading : null,
    timestamp: position.timestamp,
  };
}

// ── Fehlerart bestimmen ─────────────────────────────────

function getGeolocationErrorType(error) {
  if (error.code === 1) {
    return GEOLOCATION_ERROR_PERMISSION_DENIED;
  }

  return GEOLOCATION_ERROR_UNAVAILABLE;
}

// ── Standortüberwachung starten ─────────────────────────────────

export function startLocationWatch(handleLocationUpdate, handleLocationError) {
  if (!navigator.geolocation) {
    handleLocationError(GEOLOCATION_ERROR_NOT_SUPPORTED);

    return function stopUnsupportedLocationWatch() {};
  }

  function handleSuccessfulPosition(position) {
    const nextLocation = createLocationFromPosition(position);

    handleLocationUpdate(nextLocation);
  }

  function handleFailedPosition(error) {
    const errorType = getGeolocationErrorType(error);

    handleLocationError(errorType);
  }

  navigator.geolocation.getCurrentPosition(
    handleSuccessfulPosition,
    handleFailedPosition,
    INITIAL_POSITION_OPTIONS
  );

  const locationWatchId = navigator.geolocation.watchPosition(
    handleSuccessfulPosition,
    handleFailedPosition,
    WATCH_POSITION_OPTIONS
  );

  return function stopLocationWatch() {
    navigator.geolocation.clearWatch(locationWatchId);
  };
}