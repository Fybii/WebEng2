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

// Searches places via Photon (prefix-friendly autocomplete), Nominatim as fallback.
export const searchPlaces = async (query, options = {}) => {
    const normalizedQuery = query.trim();

    if (normalizedQuery.length < 1) {
        return [];
    }

    const { signal, lat, lng } = options;

    try {
        const params = new URLSearchParams({
            q: normalizedQuery,
            limit: '10',
            lang: 'de',
        });
        if (lat != null && lng != null) {
            params.set('lat', String(lat));
            params.set('lon', String(lng));
        }

        const response = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
            signal,
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            throw new Error('Photon search failed');
        }

        const data = await response.json();

        return (data.features || []).map((feature) => {
            const p = feature.properties || {};
            const [featureLng, featureLat] = feature.geometry?.coordinates || [];

            const title = p.name || p.city || p.street || p.country || 'Unbekannter Ort';
            const subtitleParts = [
                p.street && p.housenumber ? `${p.street} ${p.housenumber}` : p.street,
                p.postcode,
                p.city || p.state,
                p.country,
            ].filter(Boolean);

            const subtitle = subtitleParts.join(', ');
            const label = subtitle ? `${title}, ${subtitle}` : title;

            return {
                id: `photon-${p.osm_id ?? featureLat}-${featureLng}`,
                label,
                title,
                subtitle,
                lat: Number(featureLat),
                lng: Number(featureLng),
            };
        }).filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));
    } catch (photonError) {
        if (photonError.name === 'AbortError') throw photonError;
        console.warn('Photon search failed, falling back to Nominatim:', photonError);
    }

    const params = new URLSearchParams({
        q: normalizedQuery,
        format: 'jsonv2',
        limit: '10',
        addressdetails: '1',
        dedupe: '1',
        'accept-language': 'de',
    });

    const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        {
            signal,
            headers: {
                Accept: 'application/json',
                'User-Agent': 'navix-app/1.0 (university project)',
            },
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
            label,
            title: labelParts[0] || label,
            subtitle: labelParts.slice(1, 4).join(', '),
            lat: Number(item.lat),
            lng: Number(item.lon),
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
                Accept: 'application/json',
                'User-Agent': 'navix-app/1.0 (university project)',
            },
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

const ORS_DIRECTIONS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';
const MOTORWAY_REF = /^A\s?\d/i;

const ORS_TYPE_ICONS = {
    0: '▶', 1: '↑', 2: '↰', 3: '↱', 4: '↰', 5: '↱', 6: '↱', 7: '↰',
    8: '↩', 9: '↰', 10: '↱', 11: '⬤', 12: '↰', 13: '↱', 14: '↰',
};

const getOrsApiKey = () => String(import.meta.env.VITE_ORS_API_KEY ?? '').replace(/^\uFEFF/, '').trim();

export const hasOrsApiKey = () => Boolean(getOrsApiKey());

const distanceMetersApprox = (lat1, lng1, lat2, lng2) => {
    const dx = (lng2 - lng1) * 111320 * Math.cos((lat1 * Math.PI) / 180);
    const dy = (lat2 - lat1) * 111320;
    return Math.hypot(dx, dy);
};

const MOTORWAY_STEP_PATTERN = /\b(A\s?\d{1,3})\b|Autobahn/i;

const getOrsPreference = (preferenceId) => {
    if (preferenceId === 'shortest') return 'shortest';
    return 'fastest';
};

const needsOrsRouting = (preferenceId) => (
    preferenceId === 'shortest' || preferenceId === 'avoid_motorway'
);

const orsFeatureHasMotorway = (feature) => {
    for (const segment of feature?.properties?.segments || []) {
        for (const step of segment.steps || []) {
            const text = `${step.name || ''} ${step.instruction || ''}`;
            if (MOTORWAY_STEP_PATTERN.test(text)) {
                return true;
            }
        }
    }
    return false;
};

const countMotorwayStepsOrs = (feature) => {
    let count = 0;
    for (const segment of feature?.properties?.segments || []) {
        for (const step of segment.steps || []) {
            const text = `${step.name || ''} ${step.instruction || ''}`;
            if (MOTORWAY_STEP_PATTERN.test(text)) {
                count += 1;
            }
        }
    }
    return count;
};

const findMotorwayBypassVia = (feature, backMeters = 7000) => {
    const coords = feature?.geometry?.coordinates || [];
    if (coords.length < 2) return null;

    let motorwayIdx = null;
    for (const segment of feature.properties?.segments || []) {
        for (const step of segment.steps || []) {
            const text = `${step.name || ''} ${step.instruction || ''}`;
            if (MOTORWAY_STEP_PATTERN.test(text)) {
                motorwayIdx = step.way_points?.[0] ?? 0;
                break;
            }
        }
        if (motorwayIdx != null) break;
    }

    if (motorwayIdx == null || motorwayIdx <= 0) return null;

    let acc = 0;
    for (let i = motorwayIdx; i > 0; i--) {
        acc += distanceMetersApprox(
            coords[i - 1][1], coords[i - 1][0],
            coords[i][1], coords[i][0],
        );
        if (acc >= backMeters) {
            return { lng: coords[i][0], lat: coords[i][1] };
        }
    }

    return { lng: coords[0][0], lat: coords[0][1] };
};

const pickBestOrsFeature = (features, preferenceId = 'avoid_motorway') => {
    if (!features?.length) return null;

    if (preferenceId === 'shortest') {
        return features.reduce((best, feature) => {
            const bestDist = best.properties?.summary?.distance ?? Infinity;
            const dist = feature.properties?.summary?.distance ?? Infinity;
            return dist < bestDist ? feature : best;
        });
    }

    const withoutMotorway = features.filter((feature) => !orsFeatureHasMotorway(feature));
    if (withoutMotorway.length) {
        return withoutMotorway.reduce((best, feature) => {
            const bestDist = best.properties?.summary?.distance ?? Infinity;
            const dist = feature.properties?.summary?.distance ?? Infinity;
            return dist < bestDist ? feature : best;
        });
    }

    return features.reduce((best, feature) => {
        const bestCount = countMotorwayStepsOrs(best);
        const count = countMotorwayStepsOrs(feature);
        if (count < bestCount) return feature;
        if (count > bestCount) return best;
        const bestDist = best.properties?.summary?.distance ?? Infinity;
        const dist = feature.properties?.summary?.distance ?? Infinity;
        return dist < bestDist ? feature : best;
    });
};

const needsMotorwayAvoidance = (preferenceId) => preferenceId === 'avoid_motorway';

const getOrsAvoidFeatures = (preferenceId) => {
    if (preferenceId === 'avoid_motorway') return ['highways', 'tollways'];
    return [];
};

const getMotorwayDistance = (rawRoute) => {
    let total = 0;
    for (const leg of rawRoute?.legs || []) {
        for (const step of leg.steps || []) {
            if (MOTORWAY_REF.test((step.ref || '').trim())) {
                total += step.distance || 0;
            }
        }
    }
    return total;
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

const parseOsrmRoute = (route, profile) => {
    const summary = route.legs?.[0]?.summary || '';

    const legGeometries = (route.legs || []).map((leg) => {
        const coords = (leg.steps || []).flatMap((step) => {
            if (!step.geometry?.coordinates?.length) return [];
            return step.geometry.coordinates.map((c) => [c[1], c[0]]);
        });

        if (coords.length < 2) return null;

        const deduped = [coords[0]];
        for (let i = 1; i < coords.length; i++) {
            const prev = deduped[deduped.length - 1];
            const cur = coords[i];
            if (prev[0] !== cur[0] || prev[1] !== cur[1]) {
                deduped.push(cur);
            }
        }
        return deduped.length >= 2 ? deduped : null;
    }).filter(Boolean);

    const rawSteps = route.legs?.flatMap((leg) => leg.steps || []) || [];

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
        legGeometries,
        distance: route.distance,
        duration: route.duration,
        summary,
        steps,
        profile,
        motorwayDistance: getMotorwayDistance(route),
    };
};

const parseOrsRoute = (feature, profile) => {
    const props = feature.properties || {};
    const geometry = feature.geometry;
    const coordinates = geometry?.coordinates || [];

    const legGeometries = (props.segments || []).map((segment) => {
        const start = segment.way_points?.[0] ?? 0;
        const end = segment.way_points?.[1] ?? coordinates.length - 1;
        const legCoords = coordinates.slice(start, end + 1).map((c) => [c[1], c[0]]);
        return legCoords.length >= 2 ? legCoords : null;
    }).filter(Boolean);

    const steps = [];
    for (const segment of props.segments || []) {
        for (const step of segment.steps || []) {
            const wpStart = step.way_points?.[0] ?? 0;
            const loc = coordinates[wpStart];
            steps.push({
                instruction: step.instruction || step.name || 'Weiter',
                icon: ORS_TYPE_ICONS[step.type] || '→',
                distance: step.distance,
                duration: step.duration,
                name: step.name || '',
                maneuverLocation: loc ? { lng: loc[0], lat: loc[1] } : null,
                index: steps.length,
            });
        }
    }

    const fallbackLeg = coordinates.length >= 2
        ? [coordinates.map((c) => [c[1], c[0]])]
        : [];

    return {
        geometry,
        legGeometries: legGeometries.length ? legGeometries : fallbackLeg,
        distance: props.summary?.distance ?? 0,
        duration: props.summary?.duration ?? 0,
        summary: steps[0]?.name || '',
        steps,
        profile,
        motorwayDistance: countMotorwayStepsOrs(feature) * 1000,
        hasMotorwaySteps: orsFeatureHasMotorway(feature),
        routingProvider: 'ors',
    };
};

const requestOrsDirections = async (apiKey, coordinates, bodyOptions, controller) => {
    const response = await fetch(ORS_DIRECTIONS_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
            Accept: 'application/geo+json',
            'Content-Type': 'application/json',
            Authorization: apiKey,
        },
        body: JSON.stringify({
            coordinates,
            instructions: true,
            geometry: true,
            language: 'de',
            ...bodyOptions,
        }),
    });

    if (!response.ok) {
        let detail = '';
        try {
            const errBody = await response.json();
            detail = errBody?.error?.message || errBody?.message || '';
        } catch {
            // ignore parse errors
        }
        const err = new Error(
            detail || 'OpenRouteService antwortet nicht. Bitte API-Key und Internetverbindung prüfen.',
        );
        err.status = response.status;
        throw err;
    }

    const data = await response.json();
    if (!data.features?.length) {
        throw new Error('Keine Route zwischen diesen Punkten gefunden.');
    }

    return data.features;
};

const calculateOrsRoute = async (start, target, options = {}) => {
    const apiKey = getOrsApiKey();
    if (!apiKey) {
        throw new Error(
            '„Kürzeste“ und „Autobahn vermeiden“ nutzen OpenRouteService. API-Key als VITE_ORS_API_KEY in .env (Projektroot) eintragen und Dev-Server neu starten.',
        );
    }

    const {
        signal,
        timeoutMs = 30000,
        profile = 'driving',
        waypoints = [],
        routePreference = 'fastest',
    } = options;

    const pref = ROUTE_PREFERENCES[routePreference] || ROUTE_PREFERENCES.fastest;
    const controller = new AbortController();

    if (signal) {
        signal.addEventListener('abort', () => controller.abort());
    }

    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const baseBodyOptions = {
            preference: getOrsPreference(routePreference),
            options: {
                avoid_features: getOrsAvoidFeatures(routePreference),
            },
        };

        let viaPoints = waypoints.map((p) => ({ lng: p.lng, lat: p.lat }));
        let chosenFeature = null;

        for (let attempt = 0; attempt < 4; attempt++) {
            const allPoints = [start, ...viaPoints, target];
            const coordinates = allPoints.map((p) => [p.lng, p.lat]);

            let features;
            try {
                features = await requestOrsDirections(
                    apiKey,
                    coordinates,
                    {
                        ...baseBodyOptions,
                        ...(attempt === 0 && pref.alternatives && !needsMotorwayAvoidance(routePreference)
                            ? {
                                alternative_routes: {
                                    target_count: 2,
                                    share_factor: 0.6,
                                    weight_factor: 1.4,
                                },
                            }
                            : {}),
                    },
                    controller,
                );
            } catch (error) {
                if (attempt === 0 && pref.alternatives && !needsMotorwayAvoidance(routePreference)) {
                    features = await requestOrsDirections(apiKey, coordinates, baseBodyOptions, controller);
                } else {
                    throw error;
                }
            }

            chosenFeature = pickBestOrsFeature(features, routePreference);

            if (!needsMotorwayAvoidance(routePreference) || !orsFeatureHasMotorway(chosenFeature)) {
                break;
            }

            const bypass = findMotorwayBypassVia(chosenFeature, 7000 + attempt * 3000);
            if (!bypass) break;

            const lastVia = viaPoints[viaPoints.length - 1];
            if (lastVia
                && Math.abs(lastVia.lat - bypass.lat) < 0.0001
                && Math.abs(lastVia.lng - bypass.lng) < 0.0001) {
                break;
            }

            viaPoints.push(bypass);
        }

        if (!chosenFeature) {
            throw new Error('Keine Route zwischen diesen Punkten gefunden.');
        }

        let routes = [parseOrsRoute(chosenFeature, profile)];
        routes[0].routeLabel = pref.label;
        routes[0].avoidMotorwayWarning = needsMotorwayAvoidance(routePreference)
            && orsFeatureHasMotorway(chosenFeature);

        const selected = routes[0];

        return {
            ...selected,
            routes,
            selectedIndex: 0,
            preference: routePreference,
        };
    } catch (error) {
        if (error.name === 'AbortError') {
            if (signal?.aborted) throw error;
            throw new Error('Zeitüberschreitung bei der Routenberechnung.');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
};

export const ROUTE_PREFERENCES = {
    fastest: {
        id: 'fastest',
        label: 'Schnellste',
        alternatives: true,
        selectBy: 'duration',
    },
    shortest: {
        id: 'shortest',
        label: 'Kürzeste',
        alternatives: false,
        selectBy: 'distance',
    },
    avoid_motorway: {
        id: 'avoid_motorway',
        label: 'Autobahn vermeiden',
        alternatives: false,
        selectBy: 'duration',
    },
};

export const normalizeRoutePreference = (preferenceId) => {
    if (preferenceId === 'fuel_saving') return 'shortest';
    return ROUTE_PREFERENCES[preferenceId] ? preferenceId : 'fastest';
};

const labelRouteOptions = (routes, preferenceId) => {
    const pref = ROUTE_PREFERENCES[preferenceId] || ROUTE_PREFERENCES.fastest;

    if (routes.length <= 1) {
        routes[0].routeLabel = pref.label;
        return routes;
    }

    const sortedByDuration = routes
        .map((r, index) => ({ index, duration: r.duration }))
        .sort((a, b) => a.duration - b.duration);

    return routes.map((route, index) => {
        const durationRank = sortedByDuration.findIndex((entry) => entry.index === index);
        const fastestDuration = sortedByDuration[0].duration;
        const deltaMin = Math.round((route.duration - fastestDuration) / 60);

        if (durationRank === 0) {
            route.routeLabel = pref.id === 'fastest' ? 'Schnellste' : pref.label;
        } else {
            route.routeLabel = `Alternative · +${Math.max(deltaMin, 1)} Min.`;
        }

        return route;
    });
};

const pickRouteIndex = (routes, preferenceId) => {
    const pref = ROUTE_PREFERENCES[preferenceId] || ROUTE_PREFERENCES.fastest;

    if (needsMotorwayAvoidance(preferenceId)) {
        return routes.reduce((best, route, index) => {
            const bestRoute = routes[best];
            if ((route.motorwayDistance ?? 0) < (bestRoute.motorwayDistance ?? 0)) return index;
            if ((route.motorwayDistance ?? 0) === (bestRoute.motorwayDistance ?? 0)
                && route.duration < bestRoute.duration) {
                return index;
            }
            return best;
        }, 0);
    }

    if (pref.selectBy === 'distance') {
        return routes.reduce(
            (best, route, index) => (route.distance < routes[best].distance ? index : best),
            0,
        );
    }

    return routes.reduce(
        (best, route, index) => (route.duration < routes[best].duration ? index : best),
        0,
    );
};

const requestOsrmRoute = async (baseUrl, coordinates, params, controller) => {
    const response = await fetch(
        `${baseUrl}/${coordinates}?${params.toString()}`,
        {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
        },
    );

    if (!response.ok) {
        const err = new Error('Routing-Service antwortet nicht. Bitte später erneut versuchen.');
        err.status = response.status;
        throw err;
    }

    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes?.length) {
        throw new Error('Keine Route zwischen diesen Punkten gefunden.');
    }

    return data.routes;
};

const WEATHER_CODE_INFO = {
    0: { label: 'Klar', icon: '☀️' },
    1: { label: 'Überwiegend klar', icon: '🌤️' },
    2: { label: 'Teilweise bewölkt', icon: '⛅' },
    3: { label: 'Bewölkt', icon: '☁️' },
    45: { label: 'Nebel', icon: '🌫️' },
    48: { label: 'Nebel mit Reif', icon: '🌫️' },
    51: { label: 'Leichter Nieselregen', icon: '🌦️' },
    53: { label: 'Nieselregen', icon: '🌦️' },
    55: { label: 'Starker Nieselregen', icon: '🌧️' },
    56: { label: 'Gefrierender Nieselregen', icon: '🌧️' },
    57: { label: 'Starker gefrierender Nieselregen', icon: '🌧️' },
    61: { label: 'Leichter Regen', icon: '🌦️' },
    63: { label: 'Regen', icon: '🌧️' },
    65: { label: 'Starker Regen', icon: '🌧️' },
    66: { label: 'Gefrierender Regen', icon: '🌧️' },
    67: { label: 'Starker gefrierender Regen', icon: '🌧️' },
    71: { label: 'Leichter Schneefall', icon: '🌨️' },
    73: { label: 'Schneefall', icon: '❄️' },
    75: { label: 'Starker Schneefall', icon: '❄️' },
    77: { label: 'Schneekörner', icon: '🌨️' },
    80: { label: 'Leichte Regenschauer', icon: '🌦️' },
    81: { label: 'Regenschauer', icon: '🌧️' },
    82: { label: 'Starke Regenschauer', icon: '🌧️' },
    85: { label: 'Leichte Schneeschauer', icon: '🌨️' },
    86: { label: 'Starke Schneeschauer', icon: '❄️' },
    95: { label: 'Gewitter', icon: '⛈️' },
    96: { label: 'Gewitter mit Hagel', icon: '⛈️' },
    99: { label: 'Starkes Gewitter mit Hagel', icon: '⛈️' },
};

const describeWeatherCode = (code) => WEATHER_CODE_INFO[code] || { label: 'Unbekannt', icon: '🌡️' };

const formatWeatherTemperature = (value) => {
    if (value == null || Number.isNaN(value)) return '–';
    return `${Math.round(value)}°C`;
};

const formatWeatherTime = (iso) => {
    if (!iso) return '';
    const timePart = iso.split('T')[1];
    return timePart ? timePart.slice(0, 5) : '';
};

const pickHourlyIndex = (times, targetMs) => {
    if (!times?.length) return 0;

    let bestIdx = 0;
    let bestDiff = Infinity;

    for (let i = 0; i < times.length; i++) {
        const diff = Math.abs(new Date(times[i]).getTime() - targetMs);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestIdx = i;
        }
    }

    return bestIdx;
};

const buildWeatherSnapshot = (data, index, { label, timeLabel }) => {
    const code = data.hourly.weather_code?.[index];
    const info = describeWeatherCode(code);

    return {
        label,
        timeLabel,
        temperature: data.hourly.temperature_2m?.[index],
        temperatureText: formatWeatherTemperature(data.hourly.temperature_2m?.[index]),
        weatherCode: code,
        description: info.label,
        icon: info.icon,
        precipitationProbability: data.hourly.precipitation_probability?.[index] ?? null,
        windSpeed: data.hourly.wind_speed_10m?.[index] ?? null,
    };
};

/**
 * Fetches weather at the destination via Open-Meteo (free, no API key).
 * Includes forecast for estimated arrival time when route duration is known.
 */
export const fetchDestinationWeather = async (point, options = {}) => {
    if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number') {
        throw new Error('Ungültige Koordinaten für Wetterdaten.');
    }

    const { signal, arrivalTimeMs = Date.now(), routeDurationSeconds = null } = options;

    const params = new URLSearchParams({
        latitude: String(point.lat),
        longitude: String(point.lng),
        current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation',
        hourly: 'temperature_2m,weather_code,precipitation_probability,wind_speed_10m',
        timezone: 'auto',
        forecast_days: '3',
    });

    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
        signal,
        headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
        throw new Error('Wetterdaten konnten nicht geladen werden.');
    }

    const data = await response.json();
    const timezone = data.timezone || 'auto';
    const nowIdx = pickHourlyIndex(data.hourly?.time, Date.now());
    const arrivalMs = routeDurationSeconds != null
        ? Date.now() + routeDurationSeconds * 1000
        : arrivalTimeMs;
    const arrivalIdx = pickHourlyIndex(data.hourly?.time, arrivalMs);

    const currentInfo = describeWeatherCode(data.current?.weather_code);

    return {
        timezone,
        provider: 'Open-Meteo',
        now: {
            label: 'Jetzt am Ziel',
            timeLabel: formatWeatherTime(data.hourly?.time?.[nowIdx]),
            temperature: data.current?.temperature_2m,
            temperatureText: formatWeatherTemperature(data.current?.temperature_2m),
            weatherCode: data.current?.weather_code,
            description: currentInfo.label,
            icon: currentInfo.icon,
            humidity: data.current?.relative_humidity_2m ?? null,
            windSpeed: data.current?.wind_speed_10m ?? null,
            precipitation: data.current?.precipitation ?? null,
        },
        atArrival: buildWeatherSnapshot(data, arrivalIdx, {
            label: routeDurationSeconds != null ? 'Bei Ankunft' : 'Prognose am Ziel',
            timeLabel: formatWeatherTime(data.hourly?.time?.[arrivalIdx]),
        }),
    };
};

/**
 * Calculates route(s) between start and target using OSRM (OpenStreetMap).
 * Supports alternatives and avoid options (motorway, toll).
 */
export const calculateRoute = async (start, target, options = {}) => {
    if (!start || typeof start.lat !== 'number' || typeof start.lng !== 'number' ||
        !target || typeof target.lat !== 'number' || typeof target.lng !== 'number') {
        throw new Error('Ungültige Start- oder Zielkoordinaten.');
    }

    const {
        signal,
        timeoutMs = 12000,
        profile = 'driving',
        waypoints = [],
        routePreference = 'fastest',
    } = options;

    const pref = ROUTE_PREFERENCES[routePreference] || ROUTE_PREFERENCES.fastest;

    if (profile === 'driving' && needsOrsRouting(routePreference)) {
        return calculateOrsRoute(start, target, options);
    }

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
        const coordinates = allPoints.map((p) => `${p.lng},${p.lat}`).join(';');
        const params = new URLSearchParams({
            geometries: 'geojson',
            overview: 'full',
            steps: 'true',
        });

        if (profile === 'driving' && pref.alternatives) {
            params.set('alternatives', 'true');
        }

        let rawRoutes;
        try {
            rawRoutes = await requestOsrmRoute(baseUrl, coordinates, params, controller);
        } catch (error) {
            if (params.has('alternatives')) {
                params.delete('alternatives');
                rawRoutes = await requestOsrmRoute(baseUrl, coordinates, params, controller);
            } else {
                throw error;
            }
        }

        let routes = rawRoutes.map((route) => parseOsrmRoute(route, profile));
        routes = labelRouteOptions(routes, routePreference);
        const selectedIndex = pickRouteIndex(routes, routePreference);
        const selected = routes[selectedIndex];

        return {
            ...selected,
            routes,
            selectedIndex,
            preference: routePreference,
        };
    } catch (error) {
        if (error.name === 'AbortError') {
            if (signal?.aborted) throw error;
            throw new Error('Zeitüberschreitung bei der Routenberechnung.');
        }
        console.error('Routing service error:', error);
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
};

const POI_CATEGORIES = {
    // Essen & Trinken
    restaurant: { group: 'food', tag: 'amenity', value: 'restaurant', label: 'Restaurants', icon: '🍽️', googleType: 'restaurant' },
    cafe: { group: 'food', tag: 'amenity', value: 'cafe', label: 'Cafés', icon: '☕', googleType: 'cafe' },
    bar: { group: 'food', tag: 'amenity', value: 'bar', label: 'Bars', icon: '🍺', googleType: 'bar' },
    fast_food: { group: 'food', tag: 'amenity', value: 'fast_food', label: 'Fast Food', icon: '🍔', googleType: 'meal_takeaway' },
    bakery: { group: 'food', tag: 'shop', value: 'bakery', label: 'Bäckereien', icon: '🥐', googleType: 'bakery' },
    ice_cream: { group: 'food', tag: 'amenity', value: 'ice_cream', label: 'Eisdielen', icon: '🍦' },
    marketplace: { group: 'food', tag: 'amenity', value: 'marketplace', label: 'Märkte', icon: '🏪' },

    // Einkaufen
    supermarket: { group: 'shopping', tag: 'shop', value: 'supermarket', label: 'Lebensmittel', icon: '🛒', googleType: 'supermarket' },
    convenience: { group: 'shopping', tag: 'shop', value: 'convenience', label: 'Kioske', icon: '🏬' },
    clothes: { group: 'shopping', tag: 'shop', value: 'clothes', label: 'Mode', icon: '👕' },
    electronics: { group: 'shopping', tag: 'shop', value: 'electronics', label: 'Elektronik', icon: '📱' },
    books: { group: 'shopping', tag: 'shop', value: 'books', label: 'Buchhandlungen', icon: '📖' },

    // Mobilität
    fuel: { group: 'transport', tag: 'amenity', value: 'fuel', label: 'Tankstellen', icon: '⛽', googleType: 'gas_station' },
    parking: { group: 'transport', tag: 'amenity', value: 'parking', label: 'Parkplätze', icon: '🅿️', googleType: 'parking' },
    charging_station: { group: 'transport', tag: 'amenity', value: 'charging_station', label: 'Ladesäulen', icon: '🔌', googleType: 'electric_vehicle_charging_station' },
    bus_stop: { group: 'transport', tag: 'highway', value: 'bus_stop', label: 'Bushaltestellen', icon: '🚌' },
    station: { group: 'transport', tag: 'railway', value: 'station', label: 'Bahnhöfe', icon: '🚉', googleType: 'train_station' },
    bicycle_parking: { group: 'transport', tag: 'amenity', value: 'bicycle_parking', label: 'Fahrradstellplätze', icon: '🚲' },

    // Gesundheit
    pharmacy: { group: 'health', tag: 'amenity', value: 'pharmacy', label: 'Apotheken', icon: '💊', googleType: 'pharmacy' },
    doctors: { group: 'health', tag: 'amenity', value: 'doctors', label: 'Arztpraxen', icon: '🩺', googleType: 'doctor' },
    hospital: { group: 'health', tag: 'amenity', value: 'hospital', label: 'Krankenhäuser', icon: '🏥', googleType: 'hospital' },
    dentist: { group: 'health', tag: 'amenity', value: 'dentist', label: 'Zahnärzte', icon: '🦷', googleType: 'dentist' },

    // Natur & Freizeit
    park: { group: 'nature', tag: 'leisure', value: 'park', label: 'Parks', icon: '🌳', googleType: 'park' },
    playground: { group: 'nature', tag: 'leisure', value: 'playground', label: 'Spielplätze', icon: '🛝' },
    swimming_pool: { group: 'nature', tag: 'leisure', value: 'swimming_pool', label: 'Schwimmbäder', icon: '🏊' },
    sports_centre: { group: 'nature', tag: 'leisure', value: 'sports_centre', label: 'Sportzentren', icon: '⚽' },
    picnic_site: { group: 'nature', tag: 'tourism', value: 'picnic_site', label: 'Picknickplätze', icon: '🧺' },
    viewpoint: { group: 'nature', tag: 'tourism', value: 'viewpoint', label: 'Aussichtspunkte', icon: '🔭', googleType: 'tourist_attraction' },

    // Kultur & Sehenswürdigkeiten
    museum: { group: 'culture', tag: 'tourism', value: 'museum', label: 'Museen', icon: '🏛️', googleType: 'museum' },
    attraction: { group: 'culture', tag: 'tourism', value: 'attraction', label: 'Attraktionen', icon: '⭐', googleType: 'tourist_attraction' },
    castle: { group: 'culture', tag: 'historic', value: 'castle', label: 'Burgen & Schlösser', icon: '🏰' },
    monument: { group: 'culture', tag: 'historic', value: 'monument', label: 'Denkmäler', icon: '🗿' },
    artwork: { group: 'culture', tag: 'tourism', value: 'artwork', label: 'Kunstwerke', icon: '🎨' },
    cinema: { group: 'culture', tag: 'amenity', value: 'cinema', label: 'Kinos', icon: '🎬', googleType: 'movie_theater' },
    theatre: { group: 'culture', tag: 'amenity', value: 'theatre', label: 'Theater', icon: '🎭' },
    place_of_worship: { group: 'culture', tag: 'amenity', value: 'place_of_worship', label: 'Gotteshäuser', icon: '⛪', googleType: 'church' },

    // Unterkunft
    hotel: { group: 'stay', tag: 'tourism', value: 'hotel', label: 'Hotels', icon: '🏨', googleType: 'lodging' },
    hostel: { group: 'stay', tag: 'tourism', value: 'hostel', label: 'Hostels', icon: '🛏️', googleType: 'lodging' },
    camp_site: { group: 'stay', tag: 'tourism', value: 'camp_site', label: 'Campingplätze', icon: '⛺' },

    // Services
    atm: { group: 'services', tag: 'amenity', value: 'atm', label: 'Geldautomaten', icon: '🏧', googleType: 'atm' },
    bank: { group: 'services', tag: 'amenity', value: 'bank', label: 'Banken', icon: '🏦', googleType: 'bank' },
    post_office: { group: 'services', tag: 'amenity', value: 'post_office', label: 'Post', icon: '📮', googleType: 'post_office' },
    library: { group: 'services', tag: 'amenity', value: 'library', label: 'Bibliotheken', icon: '📚', googleType: 'library' },
    toilets: { group: 'services', tag: 'amenity', value: 'toilets', label: 'Toiletten', icon: '🚻' },
    drinking_water: { group: 'services', tag: 'amenity', value: 'drinking_water', label: 'Trinkwasser', icon: '💧' },
    information: { group: 'services', tag: 'tourism', value: 'information', label: 'Infopunkte', icon: 'ℹ️' },
    police: { group: 'services', tag: 'amenity', value: 'police', label: 'Polizei', icon: '👮' },
};

const POI_QUICK_KEYS = ['restaurant', 'hotel', 'supermarket', 'fuel', 'attraction', 'cafe', 'bar'];

const POI_GROUPS = [
    { id: 'food', label: 'Essen' },
    { id: 'shopping', label: 'Einkaufen' },
    { id: 'transport', label: 'Mobilität' },
    { id: 'health', label: 'Gesundheit' },
    { id: 'nature', label: 'Natur' },
    { id: 'culture', label: 'Kultur' },
    { id: 'stay', label: 'Übernachten' },
    { id: 'services', label: 'Services' },
];

const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
];

/** Static route alerts from OpenStreetMap (construction, closures) — no live traffic. */
const ROUTE_ALERT_MAX_DIST_M = 2500;

const flattenRouteCoordinates = (geometry) => {
    const coords = geometry?.coordinates;
    if (!coords?.length) return [];

    if (geometry.type === 'MultiLineString') {
        return coords.flat();
    }

    // LineString: first element is [lng, lat]
    if (typeof coords[0]?.[0] === 'number') {
        return coords;
    }

    return coords.flat();
};

/** Denser route polyline so snap distance checks follow curves, not just sparse overview points. */
const densifyRouteCoordinates = (coordinates, maxStepM = 120) => {
    if (coordinates.length < 2) return coordinates;

    const densified = [coordinates[0]];

    for (let i = 1; i < coordinates.length; i++) {
        const [lng1, lat1] = coordinates[i - 1];
        const [lng2, lat2] = coordinates[i];
        const segLen = distanceMetersApprox(lat1, lng1, lat2, lng2);
        const steps = Math.max(1, Math.ceil(segLen / maxStepM));

        for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            densified.push([
                lng1 + t * (lng2 - lng1),
                lat1 + t * (lat2 - lat1),
            ]);
        }
    }

    return densified;
};

const projectPointOnSegment = (pLat, pLng, aLat, aLng, bLat, bLng) => {
    const cos = Math.cos((aLat * Math.PI) / 180);
    const scale = 111320 * cos;

    const px = pLng * scale;
    const py = pLat * 111320;
    const ax = aLng * scale;
    const ay = aLat * 111320;
    const bx = bLng * scale;
    const by = bLat * 111320;

    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
        return {
            lat: aLat,
            lng: aLng,
            dist: distanceMetersApprox(pLat, pLng, aLat, aLng),
        };
    }

    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const lat = (ay + t * dy) / 111320;
    const lng = (ax + t * dx) / scale;

    return {
        lat,
        lng,
        dist: distanceMetersApprox(pLat, pLng, lat, lng),
    };
};

const snapToRoute = (lat, lng, coordinates) => {
    let best = { lat, lng, dist: Infinity };

    for (let i = 0; i < coordinates.length - 1; i++) {
        const [lng1, lat1] = coordinates[i];
        const [lng2, lat2] = coordinates[i + 1];
        const projected = projectPointOnSegment(lat, lng, lat1, lng1, lat2, lng2);
        if (projected.dist < best.dist) {
            best = projected;
        }
    }

    return best;
};

export const fetchRouteAlerts = async (geometry, options = {}) => {
    const { signal } = options;
    if (!geometry?.coordinates?.length) return [];

    const lats = geometry.coordinates.map((c) => c[1]);
    const lngs = geometry.coordinates.map((c) => c[0]);
    const pad = 0.04;
    const bbox = `${Math.min(...lats) - pad},${Math.min(...lngs) - pad},${Math.max(...lats) + pad},${Math.max(...lngs) + pad}`;

    const query = `[out:json][timeout:25];
(
  way["highway"="construction"](${bbox});
  way["construction"](${bbox});
  node["highway"="construction"](${bbox});
  node["construction"](${bbox});
  way["access"="no"]["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](${bbox});
);
out center 40;`;

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

    if (!data) {
        console.warn('Route alerts fetch failed:', lastError);
        return [];
    }

    const alerts = [];
    const seen = new Set();

    for (const el of data.elements || []) {
        const tags = el.tags || {};
        const pos = el.lat != null ? { lat: el.lat, lng: el.lon } : el.center
            ? { lat: el.center.lat, lng: el.center.lon }
            : null;
        if (!pos) continue;

        const key = `${pos.lat.toFixed(4)},${pos.lng.toFixed(4)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        let type = 'info';
        let icon = 'ℹ️';
        let title = 'Hinweis entlang der Route';

        if (tags.highway === 'construction' || tags.construction) {
            type = 'construction';
            icon = '🚧';
            title = tags.construction
                ? `Baustelle: ${tags.construction}`
                : 'Baustelle';
        } else if (tags.access === 'no') {
            type = 'closure';
            icon = '⛔';
            title = tags.name ? `Sperrung: ${tags.name}` : 'Straßensperrung';
        } else {
            continue;
        }

        alerts.push({
            id: `${el.type}/${el.id}`,
            type,
            icon,
            title,
            detail: tags.description || tags.note || tags.fixme || '',
            lat: pos.lat,
            lng: pos.lng,
        });
    }

    const routeCoords = densifyRouteCoordinates(flattenRouteCoordinates(geometry));

    if (routeCoords.length < 2) {
        return alerts.slice(0, 20);
    }

    return alerts
        .map((alert) => {
            const snapped = snapToRoute(alert.lat, alert.lng, routeCoords);
            const useSnap = snapped.dist <= ROUTE_ALERT_MAX_DIST_M;
            return {
                ...alert,
                lat: useSnap ? snapped.lat : alert.lat,
                lng: useSnap ? snapped.lng : alert.lng,
                routeDistance: snapped.dist,
            };
        })
        .sort((a, b) => a.routeDistance - b.routeDistance)
        .slice(0, 20);
};

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

/** Bearing in degrees (0 = north, clockwise) from point a to b. */
export const computeBearing = (from, to) => {
    const lat1 = from.lat * Math.PI / 180;
    const lat2 = to.lat * Math.PI / 180;
    const dLng = (to.lng - from.lng) * Math.PI / 180;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};

export const distanceBetweenMeters = distanceMeters;

export const POI_SEARCH_RADIUS_KM = 20;

/** Bounding box for a circle around center with given radius in km. */
export const boundsFromCenterKm = (center, radiusKm) => {
    const latDelta = radiusKm / 111.32;
    const lngDelta = radiusKm / (111.32 * Math.cos(center.lat * Math.PI / 180));
    return {
        south: center.lat - latDelta,
        north: center.lat + latDelta,
        west: center.lng - lngDelta,
        east: center.lng + lngDelta,
    };
};

export const filterPoisByRadius = (pois, center, radiusKm) => {
    const maxM = radiusKm * 1000;
    return pois.filter((p) => distanceMeters(center, p) <= maxM);
};

const parseOsmElement = (el, cat, category) => {
    const pos = poiLatLng(el);
    if (!pos) return null;

    const tags = el.tags || {};
    const stars = tags.stars ? parseFloat(tags.stars) : null;

    const extras = [];
    if (tags.description) extras.push(tags.description);
    if (tags.wheelchair === 'yes') extras.push('Rollstuhlgerecht');
    else if (tags.wheelchair === 'limited') extras.push('Eingeschränkt rollstuhlgerecht');
    if (tags.fee === 'yes') extras.push('Gebühr');
    else if (tags.fee === 'no') extras.push('Kostenlos');
    if (tags.religion) extras.push(tags.religion);
    if (tags.denotation) extras.push(tags.denotation);

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
        description: extras.join(' · '),
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
            };
        }

        return poi;
    });
};

/** Expand bbox so panning within the view reuses one fetch. */
export const expandBounds = (bounds, factor = 1.5) => {
    const latMid = (bounds.south + bounds.north) / 2;
    const lngMid = (bounds.west + bounds.east) / 2;
    const latHalf = ((bounds.north - bounds.south) / 2) * factor;
    const lngHalf = ((bounds.east - bounds.west) / 2) * factor;
    return clampBoundsSize({
        south: latMid - latHalf,
        north: latMid + latHalf,
        west: lngMid - lngHalf,
        east: lngMid + lngHalf,
    });
};

export const clampBoundsSize = (bounds, maxSpan = 0.08) => {
    let { south, north, west, east } = bounds;
    const latSpan = north - south;
    const lngSpan = east - west;

    if (latSpan > maxSpan) {
        const mid = (south + north) / 2;
        south = mid - maxSpan / 2;
        north = mid + maxSpan / 2;
    }
    if (lngSpan > maxSpan) {
        const mid = (west + east) / 2;
        west = mid - maxSpan / 2;
        east = mid + maxSpan / 2;
    }

    return { south, north, west, east };
};

export const boundsContains = (outer, inner) =>
    outer.south <= inner.south &&
    outer.north >= inner.north &&
    outer.west <= inner.west &&
    outer.east >= inner.east;

export const filterPoisToBounds = (pois, bounds) =>
    pois.filter(
        (p) =>
            p.lat >= bounds.south &&
            p.lat <= bounds.north &&
            p.lng >= bounds.west &&
            p.lng <= bounds.east
    );

export { POI_CATEGORIES, POI_GROUPS, POI_QUICK_KEYS, escapeHtml };

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
out center 100;`;

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

    return pois;
};