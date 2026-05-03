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