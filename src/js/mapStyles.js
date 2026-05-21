/** Basemap tile layers (OSM ecosystem + common alternatives). */
export const MAP_MAX_ZOOM = 20;
export const TILE_SIZE = 256;

/**
 * Minimum zoom so the viewport fits at most one world width —
 * tiles may wrap horizontally (globe) without showing duplicate worlds side by side.
 */
export const getGlobeMinZoom = (mapWidthPx) => {
    const width = Math.max(mapWidthPx || TILE_SIZE, TILE_SIZE);
    return Math.ceil(Math.log2(width / TILE_SIZE));
};

export const MAP_STYLES = [
    {
        id: 'voyager',
        label: 'Standard',
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        options: { subdomains: 'abcd', maxZoom: 20 },
    },
    {
        id: 'positron',
        label: 'Hell',
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        options: { subdomains: 'abcd', maxZoom: 20 },
    },
    {
        id: 'dark',
        label: 'Dunkel',
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        options: { subdomains: 'abcd', maxZoom: 20 },
    },
    {
        id: 'satellite',
        label: 'Satellit',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        options: { maxZoom: 19 },
    },
];

export const DEFAULT_MAP_STYLE_ID = 'voyager';

export const getMapStyle = (id) =>
    MAP_STYLES.find((s) => s.id === id) || MAP_STYLES[0];

export const TILE_LAYER_DEFAULTS = {
    detectRetina: false,
    updateWhenZooming: false,
    updateWhenIdle: true,
    keepBuffer: 3,
    noWrap: false,
};

/** Hide broken tile images instead of showing the browser error icon. */
export const bindTileErrorFallback = (layer) => {
    if (!layer) return layer;

    layer.on('tileerror', (event) => {
        event.tile.style.visibility = 'hidden';
        event.tile.style.pointerEvents = 'none';
    });

    return layer;
};
