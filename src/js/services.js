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

// Builds a readable label from Photon's property fields.
const createSearchLabel = (props) => {
    const parts = [
        props.name,
        props.street,
        props.housenumber && props.street ? props.housenumber : null,
        props.city || props.town || props.village,
        props.state,
        props.country
    ].filter(Boolean);

    return parts.join(', ');
};

// Searches places using Photon (autocomplete-capable, OSM-based).
export const searchPlaces = async (query, options = {}) => {
    const normalizedQuery = query.trim();

    if (normalizedQuery.length < 2) {
        return [];
    }

    const params = new URLSearchParams({
        q: normalizedQuery,
        lang: 'de',
        limit: '10'
    });

    if (options.lat != null && options.lng != null) {
        params.set('lat', String(options.lat));
        params.set('lon', String(options.lng));
    }

    const response = await fetch(
        `https://photon.komoot.io/api/?${params.toString()}`,
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
    const features = data.features ?? [];

    return features.map((feature, index) => {
        const props = feature.properties ?? {};
        const coords = feature.geometry?.coordinates;

        if (!coords || coords.length < 2) return null;

        const label = createSearchLabel(props);
        const name = props.name || label;
        const city = props.city || props.town || props.village || '';
        const state = props.state || '';
        const subtitle = [city, state, props.country].filter(Boolean).join(', ');

        return {
            id: props.osm_id ?? index,
            label,
            title: name,
            subtitle: name !== subtitle ? subtitle : '',
            lat: coords[1],
            lng: coords[0]
        };
    }).filter((place) => place && Number.isFinite(place.lat) && Number.isFinite(place.lng));
};

const REVERSE_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1000;

// Converts map coordinates into a readable place or address.
// Retries automatically on timeout, rate-limit (429) and server errors (5xx).
export const reversePlace = async (point, options = {}) => {
    if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number') {
        throw new Error('Invalid coordinates');
    }

    let lastError;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
            const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }

        if (options.signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REVERSE_TIMEOUT_MS);

        const onExternalAbort = () => controller.abort();
        options.signal?.addEventListener('abort', onExternalAbort, { once: true });

        try {
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
                    signal: controller.signal,
                    headers: {
                        Accept: 'application/json'
                    }
                }
            );

            clearTimeout(timeoutId);
            options.signal?.removeEventListener('abort', onExternalAbort);

            if (response.status === 429) {
                lastError = new Error('Rate limit exceeded');
                continue;
            }

            if (response.status >= 500) {
                lastError = new Error(`Server error (${response.status})`);
                continue;
            }

            if (!response.ok) {
                throw new Error(`Reverse geocoding failed (${response.status})`);
            }

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            const label = createReadableLabel(data);
            const labelParts = label.split(',').map((part) => part.trim());

            return {
                label,
                title: labelParts[0] || label,
                subtitle: labelParts.slice(1).join(', '),
                lat: point.lat,
                lng: point.lng
            };
        } catch (error) {
            clearTimeout(timeoutId);
            options.signal?.removeEventListener('abort', onExternalAbort);

            if (error.name === 'AbortError') {
                if (options.signal?.aborted) {
                    throw error;
                }
                lastError = new Error('Request timed out');
                continue;
            }

            throw error;
        }
    }

    throw lastError;
};