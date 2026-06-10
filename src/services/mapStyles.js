/**
 * mapStyles.js
 *
 * Enthält alle verfügbaren Kartenstile für Leaflet.
 */

// ── Standard-Kartenstil ─────────────────────────────────

export const DEFAULT_MAP_STYLE_ID = "voyager";

// ── Verfügbare Kartenstile ─────────────────────────────────

export const MAP_STYLES = [
  {
    id:    "voyager",
    label: "Standard",
    url:   "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    options: {
      subdomains: "abcd",
      maxZoom:    20,
    },
  },
  {
    id:    "positron",
    label: "Hell",
    url:   "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    options: {
      subdomains: "abcd",
      maxZoom:    20,
    },
  },
  {
    id:    "dark",
    label: "Dunkel",
    url:   "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    options: {
      subdomains: "abcd",
      maxZoom:    20,
    },
  },
  {
    id:    "satellite",
    label: "Satellit",
    url:   "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 19,
    },
  },
];

// ── Kartenstil finden ─────────────────────────────────

export function getMapStyle(styleId) {
  const foundMapStyle = MAP_STYLES.find((mapStyle) => {
    return mapStyle.id === styleId;
  });

  return foundMapStyle ?? MAP_STYLES[0];
}