/**
 * storage.js
 *
 * Verwaltet gespeicherte Routen und die Zuhause-Adresse im localStorage.
 *
 * localStorage bedeutet:
 * Daten werden im Browser gespeichert und bleiben auch nach dem Neuladen erhalten.
 */

// ── Konstanten ─────────────────────────────────

const MAXIMUM_SAVED_ROUTES = 20;

// ── localStorage-Schlüssel ─────────────────────────────────

const STORAGE_KEYS = {
  savedRoutes:  "navix_saved_routes",
  homeLocation: "navix_home",
};

// ── Daten aus localStorage lesen ─────────────────────────────────

function readFromStorage(storageKey, fallbackValue = null) {
  try {
    const storedValue = localStorage.getItem(storageKey);

    if (storedValue === null) {
      return fallbackValue;
    }

    return JSON.parse(storedValue);
  } catch (error) {
    console.warn("localStorage konnte nicht gelesen werden:", error);

    return fallbackValue;
  }
}

// ── Daten in localStorage schreiben ─────────────────────────────────

function writeToStorage(storageKey, value) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));

    return true;
  } catch (error) {
    console.warn("localStorage konnte nicht beschrieben werden:", error);

    return false;
  }
}

// ── Daten aus localStorage löschen ─────────────────────────────────

function removeFromStorage(storageKey) {
  try {
    localStorage.removeItem(storageKey);

    return true;
  } catch (error) {
    console.warn("localStorage-Eintrag konnte nicht gelöscht werden:", error);

    return false;
  }
}

// ── Routenliste vorbereiten ─────────────────────────────────

function createUpdatedSavedRouteList(currentSavedRoutes, nextRouteEntry) {
  const routeId = nextRouteEntry?.id;

  const savedRoutesWithoutSameRoute = currentSavedRoutes.filter((savedRoute) => {
    return savedRoute.id !== routeId;
  });

  return [nextRouteEntry, ...savedRoutesWithoutSameRoute].slice(
    0,
    MAXIMUM_SAVED_ROUTES
  );
}

// ── Gespeicherte Routen lesen ─────────────────────────────────

export function getSavedRoutes() {
  const savedRoutes = readFromStorage(STORAGE_KEYS.savedRoutes, []);

  if (!Array.isArray(savedRoutes)) {
    return [];
  }

  return savedRoutes;
}

// ── Route speichern ─────────────────────────────────

export function saveRoute(routeEntry) {
  if (!routeEntry) {
    return false;
  }

  const currentSavedRoutes = getSavedRoutes();

  const nextSavedRoutes = createUpdatedSavedRouteList(
    currentSavedRoutes,
    routeEntry
  );

  return writeToStorage(STORAGE_KEYS.savedRoutes, nextSavedRoutes);
}

// ── Route löschen ─────────────────────────────────

export function deleteRoute(routeId) {
  const remainingRoutes = getSavedRoutes().filter((savedRoute) => {
    return savedRoute.id !== routeId;
  });

  return writeToStorage(STORAGE_KEYS.savedRoutes, remainingRoutes);
}

// ── Zuhause-Adresse lesen ─────────────────────────────────

export function getHome() {
  const homeLocation = readFromStorage(STORAGE_KEYS.homeLocation, null);

  if (!homeLocation || typeof homeLocation !== "object") {
    return null;
  }

  return homeLocation;
}

// ── Zuhause-Adresse speichern ─────────────────────────────────

export function saveHome(homeLocation) {
  if (!homeLocation) {
    return false;
  }

  return writeToStorage(STORAGE_KEYS.homeLocation, homeLocation);
}

// ── Zuhause-Adresse löschen ─────────────────────────────────

export function clearHome() {
  return removeFromStorage(STORAGE_KEYS.homeLocation);
}