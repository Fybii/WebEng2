// Builds a short readable label from the reverse geocoding response.
const createReadableLabel = (data) => {
    const address = data.address ?? {};

    const road = address.road || address.pedestrian ||
        address.footway || address.path ||
        address.cycleway;

    const houseNumber = address.house_number;

    const city = address.city || address.town ||
        address.village || address.municipality ||
        address.county;

    if (road && houseNumber && city)
        return `${road}, ${houseNumber}, ${city}`;

    if (road && city)
        return `${road}, ${city}`;

    if (city)
        return city;

    return data.display_name || 'Ausgewählter Ort';
};

// Searches places by text input and normalizes Nominatim results.
export const searchPlaces = async (query, options = {}) => {
    const normalizedQuery = query.trim();

    if (normalizedQuery.length < 1) {
        return [];
    }

    const params = new URLSearchParams({
        q: normalizedQuery,
        format: 'jsonv2',
        limit: '10',
        addressdetails: '1',
        dedupe: '1',
        'accept-language': 'de'
    });

    const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        {
            signal: options.signal,
            headers: {
                Accept: 'application/json'
            }
        }
    );

    if (!response.ok) {
        throw new Error('Place search failed');
    }

    const data = await response.json();

    return data.map((item) => {
        const label = item.display_name ?? '';
        const labelParts = label.split(',').map((part) => part.trim());

        return {
            id: item.place_id,
            label: label,
            title: labelParts[0] || label,
            subtitle: labelParts.slice(1, 4).join(', '),
            lat: Number(item.lat),
            lng: Number(item.lon)
        };
    }).filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));
};

// Converts map coordinates into a readable place or address.
export const reversePlace = async (point, options = {}) => {
    if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number') {
        throw new Error('Invalid coordinates');
    }

    const params = new URLSearchParams({
        lat: String(point.lat),
        lon: String(point.lng),
        format: 'jsonv2',
        addressdetails: '1',
        zoom: '18',
        'accept-language': 'de'
    });

    const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
        {
            signal: options.signal,
            headers: {
                Accept: 'application/json'
            }
        }
    );

    if (!response.ok) {
        throw new Error('Reverse geocoding failed');
    }

    const data = await response.json();
    const label = createReadableLabel(data);
    const labelParts = label.split(',').map((part) => part.trim());

    return {
        label,
        title: labelParts[0] || label,
        subtitle: labelParts.slice(1).join(', '),
        lat: point.lat,
        lng: point.lng
    };
};

/**
 * Fetches Wikipedia information for a specific coordinate.
 * Uses MediaWiki Geosearch to find the nearest article and the Summary API for details.
 */
export const fetchWikipediaInfo = async (lat, lng, options = {}) => {
    if (typeof lat !== 'number' || typeof lng !== 'number') {
        throw new Error('Invalid coordinates for Wikipedia search');
    }

    try {
        // Step 1: Find the nearest Wikipedia page title using Geosearch
        const geoParams = new URLSearchParams({
            action: 'query',
            list: 'geosearch',
            gscoord: `${lat}|${lng}`,
            gsradius: '1000',
            gslimit: '1',
            format: 'json',
            origin: '*'
        });

        const geoResponse = await fetch(
            `https://de.wikipedia.org/w/api.php?${geoParams.toString()}`,
            { signal: options.signal }
        );

        if (!geoResponse.ok) throw new Error('Wikipedia geosearch failed');

        const geoData = await geoResponse.json();
        const pages = geoData.query?.geosearch || [];

        if (pages.length === 0) {
            return null; // No article found in radius
        }

        const title = pages[0].title;

        // Step 2: Fetch article summary details
        const summaryResponse = await fetch(
            `https://de.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
            { signal: options.signal }
        );

        if (!summaryResponse.ok) throw new Error('Wikipedia summary fetch failed');

        const summaryData = await summaryResponse.json();

        // Step 3: Normalize data model
        return {
            title: summaryData.title,
            summary: summaryData.extract,
            description: summaryData.description,
            imageUrl: summaryData.thumbnail?.source || null,
            pageUrl: summaryData.content_urls?.mobile?.page || summaryData.content_urls?.desktop?.page,
            distance: pages[0].dist
        };
    } catch (error) {
        if (error.name === 'AbortError') throw error;
        console.error('Wikipedia integration error:', error);
        throw new Error('Wikipedia-Informationen konnten nicht geladen werden.');
    }
};

const OSRM_BASE_URLS = {
    driving: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
    cycling: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving',
    walking: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
};

const MANEUVER_ICONS = {
    'turn-left': '↰', 'turn-slight left': '↰', 'turn-sharp left': '↰',
    'turn-right': '↱', 'turn-slight right': '↱', 'turn-sharp right': '↱',
    'uturn': '↩', 'straight': '↑', 'depart': '▶', 'arrive': '⬤',
    'roundabout': '↻', 'rotary': '↻', 'merge': '⤵', 'fork': '⑂',
    'ramp-left': '↰', 'ramp-right': '↱',
};

const formatManeuverType = (type, modifier) => {
    const key = modifier ? `${type}-${modifier}` : type;
    return MANEUVER_ICONS[key] || MANEUVER_ICONS[type] || '→';
};

const formatStepInstruction = (step) => {
    const m = step.maneuver;
    const name = step.name || '';
    const type = m.type || '';
    const modifier = m.modifier || '';

    if (type === 'depart') return name ? `Starte auf ${name}` : 'Route starten';
    if (type === 'arrive') return 'Ziel erreicht';

    const direction = {
        'left': 'links', 'slight left': 'leicht links', 'sharp left': 'scharf links',
        'right': 'rechts', 'slight right': 'leicht rechts', 'sharp right': 'scharf rechts',
        'uturn': 'wenden', 'straight': 'geradeaus',
    }[modifier] || modifier;

    if (type === 'roundabout' || type === 'rotary') {
        const exit = m.exit ? `${m.exit}. Ausfahrt` : '';
        return `Im Kreisverkehr ${exit}${name ? ` auf ${name}` : ''}`.trim();
    }

    if (type === 'turn' || type === 'ramp' || type === 'fork' || type === 'merge') {
        return `${direction ? direction.charAt(0).toUpperCase() + direction.slice(1) : 'Weiter'}${name ? ` auf ${name}` : ''}`;
    }

    if (name) return `Weiter auf ${name}`;
    return direction ? direction.charAt(0).toUpperCase() + direction.slice(1) : 'Weiter';
};

/**
 * Calculates a route between start and target points using OSRM (OpenStreetMap).
 *
 * Fallback options:
 * - GraphHopper Directions API (https://graphhopper.com/api/1/route)
 * - OpenRouteService API (https://api.openrouteservice.org/v2/directions/driving-car)
 * - Self-hosted OSRM instance
 *
 * @param {Object} start - Start point with lat and lng
 * @param {Object} target - Target point with lat and lng
 * @param {Object} options - signal, timeoutMs, profile ('driving'|'cycling'|'walking')
 * @returns {Promise<Object>} Route data with geometry, distance, duration, steps
 */
export const calculateRoute = async (start, target, options = {}) => {
    if (!start || typeof start.lat !== 'number' || typeof start.lng !== 'number' ||
        !target || typeof target.lat !== 'number' || typeof target.lng !== 'number') {
        throw new Error('Ungültige Start- oder Zielkoordinaten.');
    }

    const { signal, timeoutMs = 8000, profile = 'driving', waypoints = [] } = options;
    const baseUrl = OSRM_BASE_URLS[profile] || OSRM_BASE_URLS.driving;
    const controller = new AbortController();

    if (signal) {
        signal.addEventListener('abort', () => controller.abort());
    }

    const timeoutId = setTimeout(() => {
        controller.abort();
    }, timeoutMs);

    try {
        const allPoints = [start, ...waypoints, target];
        const coordinates = allPoints.map(p => `${p.lng},${p.lat}`).join(';');
        const params = new URLSearchParams({
            geometries: 'geojson',
            overview: 'full',
            steps: 'true'
        });

        const response = await fetch(
            `${baseUrl}/${coordinates}?${params.toString()}`,
            {
                signal: controller.signal,
                headers: { Accept: 'application/json' }
            }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error('Routing-Service antwortet nicht. Bitte später erneut versuchen.');
        }

        const data = await response.json();

        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
            throw new Error('Keine Route zwischen diesen Punkten gefunden.');
        }

        const route = data.routes[0];
        const summary = route.legs?.[0]?.summary || '';
        const rawSteps = route.legs?.flatMap(leg => leg.steps || []) || [];

        const steps = rawSteps.map((step, i) => ({
            instruction: formatStepInstruction(step),
            icon: formatManeuverType(step.maneuver.type, step.maneuver.modifier),
            distance: step.distance,
            duration: step.duration,
            name: step.name || '',
            maneuverLocation: step.maneuver.location
                ? { lng: step.maneuver.location[0], lat: step.maneuver.location[1] }
                : null,
            index: i,
        }));

        return {
            geometry: route.geometry,
            distance: route.distance,
            duration: route.duration,
            summary,
            steps,
            profile,
        };
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            if (signal?.aborted) throw error;
            throw new Error('Zeitüberschreitung bei der Routenberechnung.');
        }
        console.error('Routing service error:', error);
        throw error;
    }
};

const POI_CATEGORIES = {
    restaurant: { tag: 'amenity', value: 'restaurant', label: 'Restaurants', icon: '🍽️', googleType: 'restaurant' },
    cafe: { tag: 'amenity', value: 'cafe', label: 'Cafés', icon: '☕', googleType: 'cafe' },
    bar: { tag: 'amenity', value: 'bar', label: 'Bars', icon: '🍺', googleType: 'bar' },
    fast_food: { tag: 'amenity', value: 'fast_food', label: 'Fast Food', icon: '🍔', googleType: 'meal_takeaway' },
    supermarket: { tag: 'shop', value: 'supermarket', label: 'Supermärkte', icon: '🛒', googleType: 'supermarket' },
    bakery: { tag: 'shop', value: 'bakery', label: 'Bäckereien', icon: '🥐', googleType: 'bakery' },
    hotel: { tag: 'tourism', value: 'hotel', label: 'Hotels', icon: '🏨', googleType: 'lodging' },
    museum: { tag: 'tourism', value: 'museum', label: 'Museen', icon: '🏛️', googleType: 'museum' },
    attraction: { tag: 'tourism', value: 'attraction', label: 'Attraktionen', icon: '⭐', googleType: 'tourist_attraction' },
    fuel: { tag: 'amenity', value: 'fuel', label: 'Tankstellen', icon: '⛽', googleType: 'gas_station' },
    pharmacy: { tag: 'amenity', value: 'pharmacy', label: 'Apotheken', icon: '💊', googleType: 'pharmacy' },
    hospital: { tag: 'amenity', value: 'hospital', label: 'Krankenhäuser', icon: '🏥', googleType: 'hospital' },
    atm: { tag: 'amenity', value: 'atm', label: 'Geldautomaten', icon: '🏧', googleType: 'atm' },
    parking: { tag: 'amenity', value: 'parking', label: 'Parkplätze', icon: '🅿️', googleType: 'parking' },
};

const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
];

const escapeHtml = (str) => String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** German-style rating, e.g. "4,3 ★★★★☆" */
export const formatRatingStars = (rating) => {
    if (rating == null || Number.isNaN(rating)) return '';
    const value = Math.max(0, Math.min(5, Number(rating)));
    const text = value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const full = Math.round(value);
    const stars = '★'.repeat(full) + '☆'.repeat(5 - full);
    return `${text} ${stars}`;
};

const poiLatLng = (el) => {
    if (el.lat != null && el.lon != null) return { lat: el.lat, lng: el.lon };
    if (el.center) return { lat: el.center.lat, lng: el.center.lon };
    return null;
};

const distanceMeters = (a, b) => {
    const dLat = (b.lat - a.lat) * 111320;
    const dLng = (b.lng - a.lng) * 111320 * Math.cos(a.lat * Math.PI / 180);
    return Math.sqrt(dLat * dLat + dLng * dLng);
};

const parseOsmElement = (el, cat, category) => {
    const pos = poiLatLng(el);
    if (!pos) return null;

    const tags = el.tags || {};
    const stars = tags.stars ? parseFloat(tags.stars) : null;

    return {
        id: `${el.type}/${el.id}`,
        lat: pos.lat,
        lng: pos.lng,
        name: tags.name || cat.label,
        category,
        icon: cat.icon,
        address: [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']].filter(Boolean).join(' ') || '',
        phone: tags.phone || tags['contact:phone'] || '',
        website: tags.website || tags['contact:website'] || '',
        openingHours: tags.opening_hours || '',
        cuisine: tags.cuisine || '',
        rating: Number.isFinite(stars) ? stars : null,
        ratingCount: null,
        ratingSource: Number.isFinite(stars) ? 'osm' : null,
    };
};

const fetchGoogleNearbyPlaces = async (bounds, googleType, apiKey, signal) => {
    const centerLat = (bounds.south + bounds.north) / 2;
    const centerLng = (bounds.west + bounds.east) / 2;
    const latSpan = bounds.north - bounds.south;
    const lngSpan = bounds.east - bounds.west;
    const radius = Math.min(5000, Math.max(500, Math.round(Math.max(latSpan, lngSpan) * 111320 / 2)));

    const params = new URLSearchParams({
        location: `${centerLat},${centerLng}`,
        radius: String(radius),
        type: googleType,
        key: apiKey,
    });

    const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`,
        { signal, headers: { Accept: 'application/json' } }
    );

    if (!response.ok) throw new Error('Google Places antwortet nicht.');

    const data = await response.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        throw new Error(data.error_message || `Google Places: ${data.status}`);
    }

    return (data.results || []).map((place) => ({
        placeId: place.place_id,
        name: place.name,
        lat: place.geometry?.location?.lat,
        lng: place.geometry?.location?.lng,
        rating: place.rating ?? null,
        ratingCount: place.user_ratings_total ?? null,
        address: place.vicinity || '',
        openNow: place.opening_hours?.open_now,
    })).filter((p) => p.lat != null && p.lng != null);
};

const enrichPoisWithGoogleRatings = (pois, googlePlaces) => {
    const used = new Set();

    return pois.map((poi) => {
        let best = null;
        let bestDist = 120;

        for (let i = 0; i < googlePlaces.length; i++) {
            if (used.has(i)) continue;
            const g = googlePlaces[i];
            const d = distanceMeters(poi, g);
            if (d < bestDist) {
                bestDist = d;
                best = { g, i };
            }
        }

        if (best?.g.rating != null) {
            used.add(best.i);
            return {
                ...poi,
                rating: best.g.rating,
                ratingCount: best.g.ratingCount,
                ratingSource: 'google',
                googleMapsUrl: `https://www.google.com/maps/place/?q=place_id:${best.g.placeId}`,
            };
        }

        if (!poi.googleMapsUrl) {
            const q = encodeURIComponent(`${poi.name} ${poi.address}`.trim());
            return { ...poi, googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${q}` };
        }

        return poi;
    });
};

export { POI_CATEGORIES, escapeHtml };

export const fetchPOIs = async (bounds, category, options = {}) => {
    const { signal } = options;
    const cat = POI_CATEGORIES[category];
    if (!cat) throw new Error(`Unbekannte POI-Kategorie: ${category}`);

    const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
    const query = `[out:json][timeout:25];
(
  node["${cat.tag}"="${cat.value}"](${bbox});
  way["${cat.tag}"="${cat.value}"](${bbox});
);
out center 50;`;

    let data = null;
    let lastError = null;

    for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                body: `data=${encodeURIComponent(query)}`,
                headers: {
                    Accept: 'application/json',
                    'User-Agent': 'navix-app/1.0 (university project)',
                },
                signal,
            });

            if (!response.ok) {
                lastError = new Error(`Overpass HTTP ${response.status}`);
                continue;
            }

            data = await response.json();
            break;
        } catch (err) {
            lastError = err;
        }
    }

    if (!data) throw lastError || new Error('POI-Abfrage fehlgeschlagen.');

    const seen = new Set();
    let pois = (data.elements || [])
        .map((el) => parseOsmElement(el, cat, category))
        .filter(Boolean)
        .filter((poi) => {
            const key = `${poi.lat.toFixed(5)},${poi.lng.toFixed(5)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

    const googleKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;
    if (googleKey && cat.googleType) {
        try {
            const googlePlaces = await fetchGoogleNearbyPlaces(bounds, cat.googleType, googleKey, signal);
            if (googlePlaces.length > 0) {
                pois = enrichPoisWithGoogleRatings(pois, googlePlaces);
            }
        } catch (err) {
            console.warn('Google Places enrichment failed:', err);
        }
    }

    pois = pois.map((poi) => {
        if (!poi.googleMapsUrl) {
            const q = encodeURIComponent(`${poi.name} ${poi.address}`.trim());
            return { ...poi, googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${q}` };
        }
        return poi;
    });

    return pois;
};