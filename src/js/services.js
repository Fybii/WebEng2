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