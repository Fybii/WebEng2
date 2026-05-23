const HOME_KEY = 'navix_home_address';
const ROUTES_KEY = 'navix_saved_routes';
const MAX_SAVED_ROUTES = 20;

function readJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

export function getHomeAddress() {
    return readJson(HOME_KEY, null);
}

export function setHomeAddress({ label, point }) {
    if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number') {
        throw new Error('Ungültige Adresse');
    }

    const data = {
        label: (label || '').trim() || 'Heimatadresse',
        point: { lat: point.lat, lng: point.lng },
        updatedAt: new Date().toISOString(),
    };

    writeJson(HOME_KEY, data);
    return data;
}

export function clearHomeAddress() {
    localStorage.removeItem(HOME_KEY);
}

export function getSavedRoutes() {
    return readJson(ROUTES_KEY, []);
}

export function saveRoute(route) {
    const routes = getSavedRoutes();
    const entry = {
        ...route,
        id: route.id || String(Date.now()),
        savedAt: route.savedAt || new Date().toISOString(),
    };

    const withoutDuplicate = routes.filter((item) => item.id !== entry.id);
    const next = [entry, ...withoutDuplicate].slice(0, MAX_SAVED_ROUTES);
    writeJson(ROUTES_KEY, next);
    return entry;
}

export function deleteSavedRoute(id) {
    const next = getSavedRoutes().filter((route) => route.id !== id);
    writeJson(ROUTES_KEY, next);
    return next;
}
