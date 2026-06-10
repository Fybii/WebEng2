import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  DEFAULT_MAP_STYLE_ID,
  MAP_STYLES,
  getMapStyle,
} from "../services/mapStyles";

import "./css/Map.css";

// ── Karten-Standardwerte ─────────────────────────────────

const DEFAULT_MAP_CENTER = [51.1657, 10.4515];
const DEFAULT_MAP_ZOOM   = 6;

// ── Viewport ─────────────────────────────────

const MOBILE_VIEWPORT_WIDTH_IN_PIXELS = 768;

// ── Style-Switcher-Konstanten ─────────────────────────────────

const SWIPE_CLOSE_DISTANCE_IN_PIXELS = 80;
const CLOSE_ANIMATION_DURATION_IN_MS = 260;

// ── Kartenstil-Vorschaubilder ─────────────────────────────────

const MAP_STYLE_PREVIEW_URLS = {
  voyager:   "https://a.basemaps.cartocdn.com/rastertiles/voyager/8/134/87.png",
  positron:  "https://a.basemaps.cartocdn.com/light_all/8/134/87.png",
  dark:      "https://a.basemaps.cartocdn.com/dark_all/8/134/87.png",
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/8/87/134",
};

// ── Leaflet-Icons ─────────────────────────────────

const LOCATION_ICON = L.divIcon({
  className: "map-location-icon",
  html: `
    <div class="map-dot">
      <div class="map-dot__pulse"></div>
      <div class="map-dot__core"></div>
    </div>
  `,
  iconSize:    [40, 40],
  iconAnchor:  [20, 20],
  popupAnchor: [0, -20],
});

const START_ICON = L.divIcon({
  className: "map-pin-icon",
  html: `
    <div class="map-pin map-pin--start">
      <div class="map-pin__dot"></div>
    </div>
  `,
  iconSize:    [30, 40],
  iconAnchor:  [15, 40],
  popupAnchor: [0, -40],
});

const TARGET_ICON = L.divIcon({
  className: "map-pin-icon",
  html: `
    <div class="map-pin map-pin--target">
      <div class="map-pin__dot"></div>
    </div>
  `,
  iconSize:    [30, 40],
  iconAnchor:  [15, 40],
  popupAnchor: [0, -40],
});

const NAVIGATION_ARROW_ICON = L.divIcon({
  className: "map-navigation-arrow",
  html: `
    <div class="map-navigation-arrow__body">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <circle
          cx="20"
          cy="20"
          r="18"
          fill="rgba(29,78,216,.18)"
          stroke="rgba(29,78,216,.4)"
          stroke-width="1.5"
        />
        <polygon points="20,5 31,33 20,27 9,33" fill="#1d4ed8" />
        <polygon points="20,10 27,30 20,25 13,30" fill="white" opacity=".55" />
        <circle cx="20" cy="20" r="3.5" fill="white" />
      </svg>
    </div>
  `,
  iconSize:   [40, 40],
  iconAnchor: [20, 20],
});

function createLetteredIcon(letter, isTarget = false) {
  const markerModifierClassName = isTarget
    ? "map-stop-marker__pin--target"
    : "map-stop-marker__pin--waypoint";

  return L.divIcon({
    className: "map-stop-marker",
    html: `
      <div class="map-stop-marker__pin ${markerModifierClassName}">
        <span class="map-stop-marker__letter">${letter}</span>
      </div>
    `,
    iconSize:   [32, 42],
    iconAnchor: [16, 42],
  });
}

// ── Icons ─────────────────────────────────

function LayersIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zm.01-2.69l7.36-5.73L21 8.85l-9-7-9 7 1.63 1.27L12 15.85z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
    </svg>
  );
}

// ── Hilfsfunktionen ─────────────────────────────────

function buildClassName(classNames) {
  return classNames
    .filter(Boolean)
    .join(" ");
}

function createLeafletLatLng(location) {
  return [
    location.latitude,
    location.longitude,
  ];
}

function normalizeLongitude(longitude) {
  return ((longitude + 540) % 360) - 180;
}

function stopLeafletEventPropagation(event) {
  const originalEvent = event?.originalEvent ?? event;

  if (originalEvent) {
    L.DomEvent.stopPropagation(originalEvent);
  }
}

function hideFailedTile(error) {
  if (error?.tile) {
    error.tile.style.visibility = "hidden";
  }
}

const HTML_ESCAPE_REPLACEMENTS = {
  "&":  "&amp;",
  "<":  "&lt;",
  ">":  "&gt;",
  "\"": "&quot;",
  "'":  "&#039;",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    return HTML_ESCAPE_REPLACEMENTS[character];
  });
}

// ── GeoJSON-Grenzen ─────────────────────────────────

function findLargestPolygonBounds(geoJson) {
  const geometry = geoJson?.type === "Feature"
    ? geoJson.geometry
    : geoJson;

  if (!geometry) {
    return null;
  }

  function ringToBounds(ring) {
    return L.latLngBounds(
      ring.map(([longitude, latitude]) => {
        return [
          latitude,
          longitude,
        ];
      })
    );
  }

  function calculateBoundsArea(bounds) {
    return (
      (bounds.getNorth() - bounds.getSouth()) *
      (bounds.getEast() - bounds.getWest())
    );
  }

  if (geometry.type === "Polygon") {
    return ringToBounds(geometry.coordinates[0]);
  }

  if (geometry.type !== "MultiPolygon") {
    return null;
  }

  let largestBounds = null;
  let largestArea   = -1;

  for (const polygon of geometry.coordinates) {
    const bounds = ringToBounds(polygon[0]);
    const area   = calculateBoundsArea(bounds);

    if (area > largestArea) {
      largestArea   = area;
      largestBounds = bounds;
    }
  }

  return largestBounds;
}

// ── Gerätewechsel prüfen ─────────────────────────────────

function isCurrentViewportMobile() {
  return window.innerWidth < MOBILE_VIEWPORT_WIDTH_IN_PIXELS;
}

function useIsMobileViewport() {
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    return isCurrentViewportMobile();
  });

  useEffect(() => {
    function updateViewportType() {
      setIsMobileViewport(isCurrentViewportMobile());
    }

    window.addEventListener("resize", updateViewportType);

    return () => {
      window.removeEventListener("resize", updateViewportType);
    };
  }, []);

  return isMobileViewport;
}

// ── Kartenstil-Option ─────────────────────────────────

function MapStyleOption({
  mapStyle,
  isActive,
  isMobile,
  onSelect,
}) {
  const optionClassName = isMobile
    ? buildClassName([
        "map-style-sheet__option",
        isActive ? "map-style-sheet__option--active" : "",
      ])
    : buildClassName([
        "map-style-item",
        isActive ? "map-style-item--active" : "",
      ]);

  const swatchClassName = isMobile
    ? "map-style-sheet__swatch"
    : "map-style-item__swatch";

  const previewClassName = isMobile
    ? "map-style-sheet__preview"
    : "map-style-item__preview";

  const checkClassName = isMobile
    ? "map-style-sheet__check"
    : "map-style-item__check";

  const labelClassName = isMobile
    ? "map-style-sheet__label"
    : "map-style-item__label";

  return (
    <button
      type="button"
      className={optionClassName}
      onClick={() => {
        onSelect(mapStyle.id);
      }}
    >
      <div className={swatchClassName}>
        <img
          src={MAP_STYLE_PREVIEW_URLS[mapStyle.id]}
          alt={mapStyle.label}
          className={previewClassName}
        />

        {isActive && (
          <div className={checkClassName}>
            <CheckIcon />
          </div>
        )}
      </div>

      <span className={labelClassName}>
        {mapStyle.label}
      </span>
    </button>
  );
}

// ── Kartenstil-Wechsler ─────────────────────────────────

function MapStyleSwitcher({
  activeStyleId,
  onMapStyleChange,
}) {
  const [isStyleMenuMounted, setIsStyleMenuMounted] = useState(false);
  const [isStyleMenuOpen, setIsStyleMenuOpen]       = useState(false);
  const [isStyleMenuClosing, setIsStyleMenuClosing] = useState(false);
  const [isSheetDragging, setIsSheetDragging]       = useState(false);
  const [sheetDragDistance, setSheetDragDistance]   = useState(0);

  const isMobileViewport = useIsMobileViewport();

  const styleSwitcherElementRef     = useRef(null);
  const closeAnimationTimeoutRef    = useRef(null);
  const sheetDragStartPositionRef   = useRef(0);
  const currentSheetDragDistanceRef = useRef(0);

  const clearCloseAnimationTimeout = useCallback(() => {
    if (!closeAnimationTimeoutRef.current) {
      return;
    }

    window.clearTimeout(closeAnimationTimeoutRef.current);
    closeAnimationTimeoutRef.current = null;
  }, []);

  const openStyleMenu = useCallback(() => {
    clearCloseAnimationTimeout();

    currentSheetDragDistanceRef.current = 0;

    setSheetDragDistance(0);
    setIsStyleMenuClosing(false);
    setIsStyleMenuMounted(true);
    setIsStyleMenuOpen(false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsStyleMenuOpen(true);
      });
    });
  }, [clearCloseAnimationTimeout]);

  const closeStyleMenu = useCallback(() => {
    if (!isStyleMenuOpen && !isStyleMenuClosing) {
      return;
    }

    clearCloseAnimationTimeout();

    setIsStyleMenuOpen(false);
    setIsStyleMenuClosing(true);
    setIsSheetDragging(false);

    closeAnimationTimeoutRef.current = window.setTimeout(() => {
      currentSheetDragDistanceRef.current = 0;

      setSheetDragDistance(0);
      setIsStyleMenuMounted(false);
      setIsStyleMenuClosing(false);
    }, CLOSE_ANIMATION_DURATION_IN_MS);
  }, [
    clearCloseAnimationTimeout,
    isStyleMenuOpen,
    isStyleMenuClosing,
  ]);

  function toggleStyleMenu() {
    if (isStyleMenuOpen) {
      closeStyleMenu();
      return;
    }

    openStyleMenu();
  }

  function selectMapStyle(styleId) {
    onMapStyleChange(styleId);
    closeStyleMenu();
  }

  function handleSheetPointerDown(event) {
    sheetDragStartPositionRef.current   = event.clientY;
    currentSheetDragDistanceRef.current = 0;

    setSheetDragDistance(0);
    setIsSheetDragging(true);

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleSheetPointerMove(event) {
    if (!isSheetDragging) {
      return;
    }

    const nextDragDistance = Math.max(
      event.clientY - sheetDragStartPositionRef.current,
      0
    );

    currentSheetDragDistanceRef.current = nextDragDistance;

    setSheetDragDistance(nextDragDistance);
  }

  function handleSheetPointerUp() {
    if (!isSheetDragging) {
      return;
    }

    setIsSheetDragging(false);

    if (currentSheetDragDistanceRef.current >= SWIPE_CLOSE_DISTANCE_IN_PIXELS) {
      closeStyleMenu();
      return;
    }

    currentSheetDragDistanceRef.current = 0;

    setSheetDragDistance(0);
  }

  function renderMapStyleOptions(isMobile) {
    return MAP_STYLES.map((mapStyle) => (
      <MapStyleOption
        key={mapStyle.id}
        mapStyle={mapStyle}
        isMobile={isMobile}
        isActive={activeStyleId === mapStyle.id}
        onSelect={selectMapStyle}
      />
    ));
  }

  const styleToggleClassName = buildClassName([
    "map-style-toggle",
    isStyleMenuOpen ? "map-style-toggle--open" : "",
  ]);

  const desktopPanelClassName = buildClassName([
    "map-style-panel",
    isStyleMenuOpen ? "map-style-panel--open" : "",
  ]);

  const mobileOverlayClassName = buildClassName([
    "map-style-overlay",
    isStyleMenuOpen ? "map-style-overlay--open" : "",
    isStyleMenuClosing ? "map-style-overlay--closing" : "",
  ]);

  const mobileSheetClassName = buildClassName([
    "map-style-sheet",
    isStyleMenuOpen ? "map-style-sheet--open" : "",
    isStyleMenuClosing ? "map-style-sheet--closing" : "",
    isSheetDragging ? "map-style-sheet--dragging" : "",
  ]);

  // ── Klick außerhalb schließt Kartenstil-Menü ─────────────────────────────────

  useEffect(() => {
    if (!isStyleMenuOpen) {
      return;
    }

    function handleOutsidePointerDown(event) {
      const clickedInsideSwitcher =
        styleSwitcherElementRef.current?.contains(event.target);

      if (!clickedInsideSwitcher) {
        closeStyleMenu();
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
    };
  }, [isStyleMenuOpen, closeStyleMenu]);

  // ── Schließ-Timer aufräumen ─────────────────────────────────

  useEffect(() => {
    return () => {
      clearCloseAnimationTimeout();
    };
  }, [clearCloseAnimationTimeout]);

  return (
    <div
      className="map-style-switcher"
      ref={styleSwitcherElementRef}
    >
      <button
        type="button"
        className={styleToggleClassName}
        onClick={toggleStyleMenu}
        aria-expanded={isStyleMenuOpen}
        aria-label="Kartenstil wechseln"
        title="Kartenstil wechseln"
      >
        <LayersIcon />
      </button>

      {!isMobileViewport && (
        <div className={desktopPanelClassName}>
          <p className="map-style-panel__title">
            Kartendesign
          </p>

          <div className="map-style-grid">
            {renderMapStyleOptions(false)}
          </div>
        </div>
      )}

      {isMobileViewport && isStyleMenuMounted && (
        <>
          <div
            className={mobileOverlayClassName}
            onClick={closeStyleMenu}
          />

          <div
            className={mobileSheetClassName}
            style={{
              "--sheet-drag-y": `${sheetDragDistance}px`,
            }}
          >
            <div
              className="map-style-sheet__drag-area"
              onPointerDown={handleSheetPointerDown}
              onPointerMove={handleSheetPointerMove}
              onPointerUp={handleSheetPointerUp}
              onPointerCancel={handleSheetPointerUp}
            >
              <div className="map-style-sheet__handle">
                <div className="map-style-sheet__handle-bar" />
              </div>

              <div className="map-style-sheet__header">
                <h3 className="map-style-sheet__title">
                  Kartendesign
                </h3>
              </div>
            </div>

            <div className="map-style-sheet__grid">
              {renderMapStyleOptions(true)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Map ─────────────────────────────────

function Map({
  currentLocation,
  onMapClick,
  mapFocus,
  isFollowing,
  onFollowLost,
  mapStyleId,
  onMapStyleChange,
  targetLocation,
  startLocation,
  routeData,
  onSelectRoute,
  isNavigating,
  compassHeading,
  pointsOfInterest = [],
  onPointOfInterestSelect,
  onBoundsChange,
  placeBoundaryGeoJson,
  waypoints = [],
  selectedLegIndex = 0,
  onSelectLeg,
  trafficIncidents = [],
}) {
  const mapContainerElementRef = useRef(null);
  const mapInstanceRef         = useRef(null);

  const locationMarkerRef = useRef(null);
  const startMarkerRef    = useRef(null);
  const targetMarkerRef   = useRef(null);

  const selectedRouteLayerRef    = useRef(null);
  const alternativeRouteLayerRef = useRef(null);
  const tileLayerRef             = useRef(null);

  const poiMarkersLayerGroupRef = useRef(null);
  const placeBoundaryLayerRef   = useRef(null);
  const waypointMarkersLayerRef = useRef(null);
  const trafficMarkersLayerRef  = useRef(null);

  const isProgrammaticMoveRef = useRef(false);

  const onMapClickRef              = useRef(onMapClick);
  const onFollowLostRef            = useRef(onFollowLost);
  const onSelectRouteRef           = useRef(onSelectRoute);
  const onPointOfInterestSelectRef = useRef(onPointOfInterestSelect);
  const onBoundsChangeRef          = useRef(onBoundsChange);
  const onSelectLegRef             = useRef(onSelectLeg);
  const isNavigatingRef            = useRef(isNavigating);

  const [isMapReady, setIsMapReady] = useState(false);

  // ── Callback-Referenzen aktualisieren ─────────────────────────────────

  useEffect(() => {
    onMapClickRef.current              = onMapClick;
    onFollowLostRef.current            = onFollowLost;
    onSelectRouteRef.current           = onSelectRoute;
    onPointOfInterestSelectRef.current = onPointOfInterestSelect;
    onBoundsChangeRef.current          = onBoundsChange;
    onSelectLegRef.current             = onSelectLeg;
    isNavigatingRef.current            = isNavigating;
  }, [
    onMapClick,
    onFollowLost,
    onSelectRoute,
    onPointOfInterestSelect,
    onBoundsChange,
    onSelectLeg,
    isNavigating,
  ]);

  // ── Layer entfernen ─────────────────────────────────

  function removeLayerSafely(layerRef) {
    const map = mapInstanceRef.current;

    if (!map || !layerRef.current) {
      return;
    }

    map.removeLayer(layerRef.current);
    layerRef.current = null;
  }

  function clearRouteLayers() {
    removeLayerSafely(selectedRouteLayerRef);
    removeLayerSafely(alternativeRouteLayerRef);
  }

  function clearPlaceBoundaryLayer() {
    removeLayerSafely(placeBoundaryLayerRef);
  }

  function clearPointOfInterestMarkers() {
    removeLayerSafely(poiMarkersLayerGroupRef);
  }

  function clearWaypointMarkers() {
    removeLayerSafely(waypointMarkersLayerRef);
  }

  function clearTrafficMarkers() {
    removeLayerSafely(trafficMarkersLayerRef);
  }

  // ── Karte initialisieren ─────────────────────────────────

  useEffect(() => {
    if (mapInstanceRef.current || !mapContainerElementRef.current) {
      return;
    }

    const map = L.map(mapContainerElementRef.current, {
      zoomControl:        false,
      attributionControl: false,
      preferCanvas:       true,
      maxZoom:            18,
      minZoom:            3,
      worldCopyJump:      true,
    }).setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);

    const initialMapStyle = getMapStyle(DEFAULT_MAP_STYLE_ID);

    tileLayerRef.current = L.tileLayer(initialMapStyle.url, {
      ...initialMapStyle.options,
    }).addTo(map);

    tileLayerRef.current.on("tileerror", hideFailedTile);

    map.on("click", (event) => {
      onMapClickRef.current?.({
        latitude:  event.latlng.lat,
        longitude: normalizeLongitude(event.latlng.lng),
      });
    });

    map.on("dragstart", () => {
      if (!isProgrammaticMoveRef.current) {
        onFollowLostRef.current?.();
      }
    });

    map.on("zoomstart", () => {
      if (!isProgrammaticMoveRef.current) {
        onFollowLostRef.current?.();
      }
    });

    map.on("moveend", () => {
      isProgrammaticMoveRef.current = false;

      const mapBounds   = map.getBounds();
      const currentZoom = map.getZoom();

      onBoundsChangeRef.current?.({
        north: mapBounds.getNorth(),
        south: mapBounds.getSouth(),
        east:  mapBounds.getEast(),
        west:  mapBounds.getWest(),
        zoom:  currentZoom,
      });
    });

    mapInstanceRef.current = map;

    setIsMapReady(true);

    return () => {
      map.remove();

      mapInstanceRef.current           = null;
      locationMarkerRef.current        = null;
      startMarkerRef.current           = null;
      targetMarkerRef.current          = null;
      selectedRouteLayerRef.current    = null;
      alternativeRouteLayerRef.current = null;
      tileLayerRef.current             = null;
      poiMarkersLayerGroupRef.current  = null;
      placeBoundaryLayerRef.current    = null;
      waypointMarkersLayerRef.current  = null;
      trafficMarkersLayerRef.current   = null;

      setIsMapReady(false);
    };
  }, []);

  // ── Ortsgrenze zeichnen ─────────────────────────────────

  useEffect(() => {
    const map = mapInstanceRef.current;

    if (!isMapReady || !map) {
      return;
    }

    clearPlaceBoundaryLayer();

    if (!placeBoundaryGeoJson) {
      return;
    }

    const boundaryLayer = L.geoJSON(placeBoundaryGeoJson, {
      style: {
        color:       "#1d4ed8",
        weight:      2.5,
        opacity:     0.8,
        fillColor:   "#1d4ed8",
        fillOpacity: 0.06,
        dashArray:   "6, 5",
      },
    }).addTo(map);

    placeBoundaryLayerRef.current = boundaryLayer;

    const focusBounds = findLargestPolygonBounds(placeBoundaryGeoJson);

    if (focusBounds?.isValid()) {
      isProgrammaticMoveRef.current = true;

      map.fitBounds(focusBounds, {
        padding: [30, 30],
        maxZoom: 13,
      });
    }

    return () => {
      clearPlaceBoundaryLayer();
    };
  }, [placeBoundaryGeoJson, isMapReady]);

  // ── Kartenstil wechseln ─────────────────────────────────

  useEffect(() => {
    const map = mapInstanceRef.current;

    if (!isMapReady || !map) {
      return;
    }

    const selectedMapStyle = getMapStyle(mapStyleId);

    const nextTileLayer = L.tileLayer(selectedMapStyle.url, {
      ...selectedMapStyle.options,
    }).addTo(map);

    nextTileLayer.bringToBack();
    nextTileLayer.on("tileerror", hideFailedTile);

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    tileLayerRef.current = nextTileLayer;
  }, [mapStyleId, isMapReady]);

  // ── Standortmarker aktualisieren ─────────────────────────────────

  useEffect(() => {
    const map = mapInstanceRef.current;

    if (!isMapReady || !map) {
      return;
    }

    if (!currentLocation) {
      if (locationMarkerRef.current) {
        map.removeLayer(locationMarkerRef.current);
        locationMarkerRef.current = null;
      }

      return;
    }

    const locationIcon = isNavigating
      ? NAVIGATION_ARROW_ICON
      : LOCATION_ICON;

    const locationLatLng = createLeafletLatLng(currentLocation);

    if (locationMarkerRef.current) {
      locationMarkerRef.current.setIcon(locationIcon);
      locationMarkerRef.current.setLatLng(locationLatLng);
      return;
    }

    locationMarkerRef.current = L.marker(locationLatLng, {
      icon:         locationIcon,
      zIndexOffset: 1000,
    })
      .addTo(map)
      .bindPopup("Mein Standort");
  }, [currentLocation, isNavigating, isMapReady]);

  // ── Navigationspfeil drehen ─────────────────────────────────

  useEffect(() => {
    if (!isNavigating || !locationMarkerRef.current) {
      return;
    }

    const navigationHeading =
      currentLocation?.heading ??
      compassHeading ??
      0;

    const markerElement = locationMarkerRef.current.getElement();

    const navigationArrowElement = markerElement?.querySelector(
      ".map-navigation-arrow__body"
    );

    if (!navigationArrowElement) {
      return;
    }

    navigationArrowElement.style.transform = `rotate(${navigationHeading}deg)`;
  }, [
    compassHeading,
    currentLocation?.heading,
    isNavigating,
  ]);

  // ── Zielmarker setzen oder entfernen ─────────────────────────────────

  useEffect(() => {
    const map = mapInstanceRef.current;

    if (!isMapReady || !map) {
      return;
    }

    if (!targetLocation) {
      if (targetMarkerRef.current) {
        map.removeLayer(targetMarkerRef.current);
        targetMarkerRef.current = null;
      }

      return;
    }

    const targetLatLng = createLeafletLatLng(targetLocation);

    if (targetMarkerRef.current) {
      targetMarkerRef.current.setLatLng(targetLatLng);
      return;
    }

    targetMarkerRef.current = L.marker(targetLatLng, {
      icon:         TARGET_ICON,
      zIndexOffset: 900,
    })
      .addTo(map)
      .bindPopup("Zielpunkt");
  }, [targetLocation, isMapReady]);

  // ── Startmarker setzen oder entfernen ─────────────────────────────────

  useEffect(() => {
    const map = mapInstanceRef.current;

    if (!isMapReady || !map) {
      return;
    }

    if (!startLocation) {
      if (startMarkerRef.current) {
        map.removeLayer(startMarkerRef.current);
        startMarkerRef.current = null;
      }

      return;
    }

    const startLatLng = createLeafletLatLng(startLocation);

    if (startMarkerRef.current) {
      startMarkerRef.current.setLatLng(startLatLng);
      return;
    }

    startMarkerRef.current = L.marker(startLatLng, {
      icon:         START_ICON,
      zIndexOffset: 800,
    })
      .addTo(map)
      .bindPopup("Startpunkt");
  }, [startLocation, isMapReady]);

  // ── Zwischenzielmarker setzen ─────────────────────────────────

  useEffect(() => {
    const map = mapInstanceRef.current;

    if (!isMapReady || !map) {
      return;
    }

    clearWaypointMarkers();

    if (!waypoints?.length) {
      return;
    }

    const waypointMarkers = waypoints.map((waypoint, waypointIndex) => {
      const waypointLabel = String(waypointIndex + 1);

      const marker = L.marker(
        [
          waypoint.latitude,
          waypoint.longitude,
        ],
        {
          icon:         createLetteredIcon(waypointLabel, false),
          zIndexOffset: 950,
        }
      );

      marker.bindPopup(
        `Zwischenstopp ${escapeHtml(waypointLabel)}: ${escapeHtml(waypoint.name ?? "Stopp")}`
      );

      return marker;
    });

    waypointMarkersLayerRef.current = L.layerGroup(waypointMarkers).addTo(map);
  }, [waypoints, isMapReady]);

  // ── Verkehrsmeldungs-Marker setzen ─────────────────────────────────

  useEffect(() => {
    const map = mapInstanceRef.current;

    if (!isMapReady || !map) {
      return;
    }

    clearTrafficMarkers();

    if (!trafficIncidents?.length) {
      return;
    }

    const trafficMarkers = trafficIncidents.map((incident) => {
      const markerIcon = L.divIcon({
        className: "map-traffic-marker",
        html: `
          <div class="map-traffic-marker__body map-traffic-marker__body--${escapeHtml(incident.typeKey)}">
            ${escapeHtml(incident.icon)}
          </div>
        `,
        iconSize:   [30, 30],
        iconAnchor: [15, 15],
      });

      const marker = L.marker(
        [
          incident.latitude,
          incident.longitude,
        ],
        {
          icon:         markerIcon,
          zIndexOffset: 600,
        }
      );

      const descriptionHtml = (incident.description ?? [])
        .map((descriptionLine) => {
          return `
            <span class="map-traffic-popup__line">
              ${escapeHtml(descriptionLine)}
            </span>
          `;
        })
        .join("");

      marker.bindPopup(
        `
          <div class="map-traffic-popup">
            <strong class="map-traffic-popup__title">
              ${escapeHtml(incident.icon)} ${escapeHtml(incident.title)}
            </strong>

            ${
              incident.subtitle
                ? `
                  <span class="map-traffic-popup__subtitle">
                    ${escapeHtml(incident.subtitle)}
                  </span>
                `
                : ""
            }

            ${descriptionHtml}
          </div>
        `,
        {
          closeButton: false,
          offset:      [0, -12],
        }
      );

      return marker;
    });

    trafficMarkersLayerRef.current = L.layerGroup(trafficMarkers).addTo(map);
  }, [trafficIncidents, isMapReady]);

  // ── POI-Marker setzen ─────────────────────────────────

  useEffect(() => {
    const map = mapInstanceRef.current;

    if (!isMapReady || !map) {
      return;
    }

    clearPointOfInterestMarkers();

    if (!pointsOfInterest?.length) {
      return;
    }

    const pointOfInterestMarkers = pointsOfInterest.map((pointOfInterest) => {
      const markerIcon = L.divIcon({
        className: "map-poi-marker",
        html: `
          <div class="map-poi-marker__body">
            ${escapeHtml(pointOfInterest.icon)}
          </div>
        `,
        iconSize:   [36, 36],
        iconAnchor: [18, 18],
      });

      const marker = L.marker(
        [
          pointOfInterest.latitude,
          pointOfInterest.longitude,
        ],
        {
          icon:         markerIcon,
          zIndexOffset: 500,
        }
      );

      const popupContent = `
        <div class="map-poi-popup">
          <span class="map-poi-popup__icon">
            ${escapeHtml(pointOfInterest.icon)}
          </span>

          <div class="map-poi-popup__text">
            <strong class="map-poi-popup__name">
              ${escapeHtml(pointOfInterest.name)}
            </strong>

            <span class="map-poi-popup__category">
              ${escapeHtml(pointOfInterest.categoryLabel)}
            </span>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, {
        offset:      [0, -20],
        closeButton: false,
        className:   "navix-poi-popup",
      });

      marker.on("click", (markerEvent) => {
        stopLeafletEventPropagation(markerEvent);
        marker.openPopup();

        onPointOfInterestSelectRef.current?.(pointOfInterest);
      });

      return marker;
    });

    poiMarkersLayerGroupRef.current = L.layerGroup(pointOfInterestMarkers).addTo(map);
  }, [pointsOfInterest, isMapReady]);

  // ── Routenalternative zeichnen ─────────────────────────────────

  function createAlternativeRouteLayers(route, routeIndex) {
    const visibleRouteLine = L.polyline(route.coordinates, {
      color:     "#94a3b8",
      weight:    6,
      opacity:   0.5,
      dashArray: "1 10",
      lineCap:   "round",
    });

    const clickableRouteLine = L.polyline(route.coordinates, {
      color:       "#000000",
      weight:      24,
      opacity:     0,
      interactive: true,
    });

    clickableRouteLine.on("click", (event) => {
      stopLeafletEventPropagation(event);

      if (!isNavigatingRef.current) {
        onSelectRouteRef.current?.(routeIndex);
      }
    });

    return [
      visibleRouteLine,
      clickableRouteLine,
    ];
  }

  // ── Hauptroute zeichnen ─────────────────────────────────

  function createSelectedRouteLayer(route) {
    return L.layerGroup([
      L.polyline(route.coordinates, {
        color:    "#ffffff",
        weight:   9,
        opacity:  1,
        lineJoin: "round",
        lineCap:  "round",
      }),
      L.polyline(route.coordinates, {
        color:    "#1d4ed8",
        weight:   5,
        opacity:  1,
        lineJoin: "round",
        lineCap:  "round",
      }),
    ]);
  }

  // ── Multi-Stop-Route zeichnen ─────────────────────────────────

  function createMultiStopRouteLayer(legs) {
    const segmentLayers = [];

    legs.forEach((leg, legIndex) => {
      const isSelectedLeg = legIndex === selectedLegIndex;

      segmentLayers.push(
        L.polyline(leg.coordinates, {
          color:    "#ffffff",
          weight:   9,
          opacity:  isSelectedLeg ? 1 : 0.5,
          lineJoin: "round",
          lineCap:  "round",
        })
      );

      segmentLayers.push(
        L.polyline(leg.coordinates, {
          color:    "#1d4ed8",
          weight:   5,
          opacity:  isSelectedLeg ? 1 : 0.35,
          lineJoin: "round",
          lineCap:  "round",
        })
      );

      const clickableLine = L.polyline(leg.coordinates, {
        color:       "#000000",
        weight:      24,
        opacity:     0,
        interactive: true,
      });

      clickableLine.on("click", (event) => {
        stopLeafletEventPropagation(event);

        if (!isNavigatingRef.current) {
          onSelectLegRef.current?.(legIndex);
        }
      });

      segmentLayers.push(clickableLine);
    });

    return L.layerGroup(segmentLayers);
  }

  // ── Normale Route zeichnen ─────────────────────────────────

  function drawSingleRoute(map, nextRouteData) {
    const routes = nextRouteData.routes ?? [];

    if (!routes.length) {
      return;
    }

    const selectedRouteIndex = nextRouteData.selectedIndex ?? 0;
    const selectedRoute      = routes[selectedRouteIndex];

    if (!selectedRoute?.coordinates?.length) {
      return;
    }

    const alternativeRouteLayers = isNavigating
      ? []
      : routes.flatMap((route, routeIndex) => {
          if (routeIndex === selectedRouteIndex) {
            return [];
          }

          return createAlternativeRouteLayers(route, routeIndex);
        });

    if (alternativeRouteLayers.length > 0) {
      alternativeRouteLayerRef.current = L
        .layerGroup(alternativeRouteLayers)
        .addTo(map);
    }

    selectedRouteLayerRef.current = createSelectedRouteLayer(selectedRoute).addTo(map);

    if (!isNavigating) {
      isProgrammaticMoveRef.current = true;

      map.fitBounds(L.latLngBounds(selectedRoute.coordinates), {
        padding: [60, 60],
        maxZoom: 16,
      });
    }
  }

  // ── Multi-Stop-Route zeichnen ─────────────────────────────────

  function drawMultiStopRoute(map, nextRouteData) {
    const legs = nextRouteData.legs ?? [];

    if (!legs.length) {
      return;
    }

    selectedRouteLayerRef.current = createMultiStopRouteLayer(legs).addTo(map);

    if (!isNavigating && nextRouteData.fullCoordinates?.length) {
      isProgrammaticMoveRef.current = true;

      map.fitBounds(L.latLngBounds(nextRouteData.fullCoordinates), {
        padding: [60, 60],
        maxZoom: 16,
      });
    }
  }

  // ── Route zeichnen ─────────────────────────────────

  useEffect(() => {
    const map = mapInstanceRef.current;

    if (!isMapReady || !map) {
      return;
    }

    clearRouteLayers();

    if (!routeData) {
      return;
    }

    if (routeData.mode === "multi") {
      drawMultiStopRoute(map, routeData);
      return;
    }

    drawSingleRoute(map, routeData);
  }, [
    routeData,
    isMapReady,
    isNavigating,
    selectedLegIndex,
  ]);

  // ── Karte folgt GPS-Position ─────────────────────────────────

  useEffect(() => {
    const map = mapInstanceRef.current;

    if (!isMapReady || !map || !isFollowing || !currentLocation) {
      return;
    }

    isProgrammaticMoveRef.current = true;

    map.panTo(createLeafletLatLng(currentLocation), {
      animate: true,
    });
  }, [
    currentLocation,
    isFollowing,
    isMapReady,
  ]);

  // ── Karte auf gewählten Punkt bewegen ─────────────────────────────────

  useEffect(() => {
    const map = mapInstanceRef.current;

    if (!isMapReady || !map || !mapFocus?.point) {
      return;
    }

    isProgrammaticMoveRef.current = true;

    map.flyTo(
      createLeafletLatLng(mapFocus.point),
      mapFocus.zoom ?? 16,
      {
        animate:  true,
        duration: 0.9,
      }
    );
  }, [
    mapFocus,
    isMapReady,
  ]);

  // ── Kartengröße bei Layoutänderung aktualisieren ─────────────────────────────────

  useEffect(() => {
    if (!isMapReady || !mapContainerElementRef.current) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      mapInstanceRef.current?.invalidateSize();
    });

    resizeObserver.observe(mapContainerElementRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isMapReady]);

  return (
    <div className="map-root">
      <div
        ref={mapContainerElementRef}
        className="map-leaflet"
      />

      <MapStyleSwitcher
        activeStyleId={mapStyleId}
        onMapStyleChange={onMapStyleChange}
      />
    </div>
  );
}

export default Map;