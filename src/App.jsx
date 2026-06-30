import { useCallback, useEffect, useRef, useState } from "react";

import Splash from "./components/Splash.jsx";
import Map from "./components/Map.jsx";
import SearchCard from "./components/SearchCard.jsx";
import WikipediaCard from "./components/WikipediaCard.jsx";
import RoutePanel from "./components/RoutePanel.jsx";
import NavigationPanel from "./components/NavigationPanel.jsx";
import NavigationBar from "./components/NavigationBar.jsx";
import PoiBar from "./components/PoiBar.jsx";

import { startLocationWatch } from "./services/geo.js";
import { DEFAULT_MAP_STYLE_ID } from "./services/mapStyles.js";
import { reverseGeocode } from "./services/nominatim.js";
import { fetchSmartWikipediaArticle } from "./services/wikipedia.js";
import {
  calculateRoute,
  calculateRouteWithStops,
} from "./services/routing.js";
import {
  clearHome,
  deleteRoute,
  getHome,
  getSavedRoutes,
  saveHome,
  saveRoute,
} from "./services/storage.js";
import { fetchDestinationWeather } from "./services/wheater.js";
import { fetchPointsOfInterest } from "./services/poi.js";
import { fetchPlaceBoundary } from "./services/boundary.js";
import { fetchTrafficIncidentsForRoute } from "./services/traffic.js";

import "./App.css";

// ── Allgemeine Konstanten ─────────────────────────────────

const MOBILE_VIEWPORT_WIDTH_IN_PIXELS      = 768;
const WIKI_SHEET_CLOSE_ANIMATION_IN_MS     = 300;
const WIKI_SHEET_PEEK_THRESHOLD_IN_PIXELS  = 80;
const NAVIGATION_STEP_DISTANCE_THRESHOLD_M = 30;

// ── Entwicklungs-Fallback ─────────────────────────────────

const DEVELOPMENT_FALLBACK_LOCATION = {
  latitude:   47.6524,
  longitude:  9.4763,
  accuracy:   0,
  heading:    null,
  isFallback: true,
};

// ── Logo ─────────────────────────────────

const NavixLogo = ({ size = 26 }) => (
  <svg
    width={size}
    height={Math.round(size * 1.3)}
    viewBox="0 0 40 52"
    fill="none"
  >
    <path
      fill="var(--accent-p)"
      d="M20 0C8.96 0 0 8.96 0 20C0 34.82 20 52 20 52S40 34.82 40 20C40 8.96 31.04 0 20 0Z"
    />

    <circle
      cx="20"
      cy="20"
      r="13"
      fill="white"
      opacity=".15"
    />

    <path
      stroke="white"
      fill="none"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M13 14V26M13 14L27 26M27 14V26"
    />
  </svg>
);

// ── Kompass-Icon ─────────────────────────────────

const CompassIcon = ({ heading = 0 }) => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    style={{
      transform:  `rotate(${-heading}deg)`,
      transition: "transform .3s ease",
    }}
  >
    <path
      fill="#ef4444"
      d="M12 2L9 12h6L12 2z"
    />

    <path
      fill="#94a3b8"
      d="M12 22L9 12h6L12 22z"
    />

    <circle
      cx="12"
      cy="12"
      r="1.5"
      fill="white"
    />
  </svg>
);

// ── GPS-Icon ─────────────────────────────────

const GpsIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
  </svg>
);

// ── Hilfsfunktionen ─────────────────────────────────

function buildClassName(classNames) {
  return classNames
    .filter(Boolean)
    .join(" ");
}

function isMobileViewport() {
  return window.innerWidth < MOBILE_VIEWPORT_WIDTH_IN_PIXELS;
}

function createMapFocus(point, zoom) {
  return {
    point,
    zoom,
    key: Date.now(),
  };
}

function createPlainLocation(stop, fallbackName) {
  return {
    latitude:     stop.latitude,
    longitude:    stop.longitude,
    name:         stop.name || fallbackName,
    shortAddress: stop.shortAddress || "",
  };
}

function calculateEstimatedArrivalTime(durationInSeconds) {
  if (!durationInSeconds || durationInSeconds <= 0) {
    return null;
  }

  const arrivalDate = new Date(Date.now() + durationInSeconds * 1000);

  const arrivalHours   = String(arrivalDate.getHours()).padStart(2, "0");
  const arrivalMinutes = String(arrivalDate.getMinutes()).padStart(2, "0");

  return `${arrivalHours}:${arrivalMinutes}`;
}

function calculateDistanceInMeters(firstLocation, secondLocation) {
  if (!firstLocation || !secondLocation) {
    return Number.POSITIVE_INFINITY;
  }

  const latitudeDistanceInMeters =
    (firstLocation.latitude - secondLocation.latitude) * 111320;

  const longitudeDistanceInMeters =
    (firstLocation.longitude - secondLocation.longitude) *
    111320 *
    Math.cos((firstLocation.latitude * Math.PI) / 180);

  return Math.sqrt(
    latitudeDistanceInMeters ** 2 +
    longitudeDistanceInMeters ** 2
  );
}

function getSelectedRouteFromRouteData(routeData) {
  if (!routeData) {
    return null;
  }

  if (routeData.mode === "multi") {
    return {
      distance: routeData.totalDistance ?? 0,
      duration: routeData.totalDuration ?? 0,
      steps:    (routeData.legs ?? []).flatMap((leg) => leg.steps ?? []),
    };
  }

  const selectedRouteIndex = routeData.selectedIndex ?? 0;

  return routeData.routes?.[selectedRouteIndex] ?? null;
}

function getRouteDurationInSeconds(routeData) {
  return getSelectedRouteFromRouteData(routeData)?.duration ?? null;
}

function getTrafficRouteInput(routeData) {
  if (!routeData) {
    return {
      steps:       [],
      coordinates: [],
    };
  }

  if (routeData.mode === "multi") {
    return {
      steps:       (routeData.legs ?? []).flatMap((leg) => leg.steps ?? []),
      coordinates: routeData.fullCoordinates ?? [],
    };
  }

  const selectedRouteIndex = routeData.selectedIndex ?? 0;
  const selectedRoute      = routeData.routes?.[selectedRouteIndex];

  return {
    steps:       selectedRoute?.steps ?? [],
    coordinates: selectedRoute?.coordinates ?? [],
  };
}

function getNavigationTargetLabel(routeData, navigationLegIndex, waypointCount) {
  if (routeData?.mode !== "multi") {
    return null;
  }

  if (navigationLegIndex < waypointCount) {
    return String(navigationLegIndex + 1);
  }

  return "B";
}

// ── App ─────────────────────────────────

function App() {
  const [notification, setNotification] = useState(null);

  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const [splashText]                          = useState("Standort wird ermittelt...");

  const [currentLocation, setCurrentLocation] = useState(null);
  const [isFollowing, setIsFollowing]         = useState(false);
  const [mapFocus, setMapFocus]               = useState(null);
  const [compassHeading, setCompassHeading]   = useState(0);
  const [mapStyleId, setMapStyleId]           = useState(DEFAULT_MAP_STYLE_ID);

  const [startLocation, setStartLocation]                 = useState(null);
  const [targetLocation, setTargetLocation]               = useState(null);
  const [wikiData, setWikiData]                           = useState(null);
  const [isLocationDataLoading, setIsLocationDataLoading] = useState(false);

  const [mapClickMode, setMapClickMode] = useState("target");

  const [activePOICategoryKey, setActivePOICategoryKey]             = useState(null);
  const [pointsOfInterest, setPointsOfInterest]                     = useState([]);
  const [arePointsOfInterestLoading, setArePointsOfInterestLoading] = useState(false);
  const [currentMapBounds, setCurrentMapBounds]                     = useState(null);

  const [isWikiSheetOpen, setIsWikiSheetOpen]         = useState(false);
  const [isWikiSheetClosing, setIsWikiSheetClosing]   = useState(false);
  const [wikiSheetDragY, setWikiSheetDragY]           = useState(0);
  const [isWikiSheetMounted, setIsWikiSheetMounted]   = useState(false);
  const [isWikiSheetDragging, setIsWikiSheetDragging] = useState(false);
  const [isWikiSheetPeeked, setIsWikiSheetPeeked]     = useState(false);

  const [routeData, setRouteData]             = useState(null);
  const [routeProfile, setRouteProfile]       = useState("driving");
  const [routePreference, setRoutePreference] = useState("fastest");
  const [isRouteLoading, setIsRouteLoading]   = useState(false);
  const [routeError, setRouteError]           = useState(null);

  const [destinationWeather, setDestinationWeather] = useState(null);
  const [isWeatherLoading, setIsWeatherLoading]     = useState(false);
  const [weatherError, setWeatherError]             = useState(null);

  const [isNavigating, setIsNavigating]               = useState(false);
  const [navigationStepIndex, setNavigationStepIndex] = useState(0);
  const [navigationLegIndex, setNavigationLegIndex]   = useState(0);

  const [homeLocation, setHomeLocation]                   = useState(() => getHome());
  const [savedRoutes, setSavedRoutes]                     = useState(() => getSavedRoutes());
  const [areSavedRoutesVisible, setAreSavedRoutesVisible] = useState(false);

  const [placeBoundaryGeoJson, setPlaceBoundaryGeoJson] = useState(null);

  const [waypoints, setWaypoints]               = useState([]);
  const [selectedLegIndex, setSelectedLegIndex] = useState(0);

  const [trafficIncidents, setTrafficIncidents]                     = useState([]);
  const [areTrafficIncidentsLoading, setAreTrafficIncidentsLoading] = useState(false);

  const pointsOfInterestFetchControllerRef = useRef(null);
  const pointsOfInterestRequestIdRef       = useRef(0);
  const placeBoundaryRequestIdRef          = useRef(0);

  const wikiSheetElementRef    = useRef(null);
  const wikiOverlayElementRef  = useRef(null);
  const wikiCloseTimerRef      = useRef(null);
  const wikiDragStartYRef      = useRef(0);
  const wikiDragDistanceYRef   = useRef(0);
  const isWikiDraggingRef      = useRef(false);
  const hasFirstLocationFixRef = useRef(false);

  // ── Basis-Reset-Funktionen ─────────────────────────────────

  function clearRouteExtras() {
    setWaypoints([]);
    setSelectedLegIndex(0);
    setNavigationLegIndex(0);
    setNavigationStepIndex(0);
  }

  function clearRouteState() {
    setRouteData(null);
    setRouteError(null);
    setDestinationWeather(null);
    setWeatherError(null);
    setTrafficIncidents([]);
    setAreTrafficIncidentsLoading(false);
  }

  function clearPlaceBoundary() {
    placeBoundaryRequestIdRef.current += 1;
    setPlaceBoundaryGeoJson(null);
  }

  // ── Theme an Kartenstil anpassen ─────────────────────────────────

  useEffect(() => {
    const theme = mapStyleId === "dark" ? "dark" : "light";

    document.documentElement.setAttribute("data-theme", theme);
  }, [mapStyleId]);

  // ── GPS-Überwachung starten ─────────────────────────────────

  useEffect(() => {
    hasFirstLocationFixRef.current = false;

    const stopLocationWatch = startLocationWatch(
      (nextLocation) => {
        setCurrentLocation(nextLocation);

        if (hasFirstLocationFixRef.current) {
          return;
        }

        hasFirstLocationFixRef.current = true;

        setIsSplashVisible(false);
        setIsFollowing(true);
        setMapFocus(createMapFocus(nextLocation, 16));

        setNotification({
          type:      "success",
          text:      "Standort gefunden - Tracking aktiv",
          autoClose: 2500,
        });
      },
      (errorType) => {
        setIsSplashVisible(false);

        console.warn(`GPS nicht verfügbar (${errorType}) → Fallback: Friedrichshafen`);

        setCurrentLocation(DEVELOPMENT_FALLBACK_LOCATION);
        setIsFollowing(true);
        setMapFocus(createMapFocus(DEVELOPMENT_FALLBACK_LOCATION, 16));

        setNotification({
          type:      "error",
          text:      "GPS nicht verfügbar — Teststandort: Friedrichshafen",
          autoClose: 4000,
        });
      }
    );

    const splashFallbackTimer = window.setTimeout(() => {
      setIsSplashVisible(false);
    }, 8000);

    return () => {
      stopLocationWatch();
      window.clearTimeout(splashFallbackTimer);
    };
  }, []);

  // ── Benachrichtigung automatisch schließen ─────────────────────────────────

  useEffect(() => {
    if (!notification?.autoClose) {
      return;
    }

    const notificationTimer = window.setTimeout(() => {
      setNotification(null);
    }, notification.autoClose);

    return () => {
      window.clearTimeout(notificationTimer);
    };
  }, [notification]);

  // ── Gerätewechsel ─────────────────────────────────

  useEffect(() => {
    function handleViewportResize() {
      if (window.innerWidth < MOBILE_VIEWPORT_WIDTH_IN_PIXELS || !isWikiSheetMounted) {
        return;
      }

      setIsWikiSheetMounted(false);
      setIsWikiSheetOpen(false);
      setIsWikiSheetPeeked(false);
      setIsWikiSheetClosing(false);

      wikiDragDistanceYRef.current = 0;
      isWikiDraggingRef.current    = false;
    }

    window.addEventListener("resize", handleViewportResize);

    return () => {
      window.removeEventListener("resize", handleViewportResize);
    };
  }, [isWikiSheetMounted]);

  // ── Mobile Wiki-Sheet öffnen ─────────────────────────────────

  const openWikiSheet = useCallback(() => {
    window.clearTimeout(wikiCloseTimerRef.current);

    wikiDragDistanceYRef.current = 0;
    isWikiDraggingRef.current    = false;

    setWikiSheetDragY(0);
    setIsWikiSheetClosing(false);
    setIsWikiSheetDragging(false);

    if (isWikiSheetPeeked) {
      setIsWikiSheetPeeked(false);
      setIsWikiSheetOpen(true);
      return;
    }

    setIsWikiSheetPeeked(false);
    setIsWikiSheetMounted(true);
    setIsWikiSheetOpen(false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsWikiSheetOpen(true);
      });
    });
  }, [isWikiSheetPeeked]);

  // ── Mobile Wiki-Sheet schließen ─────────────────────────────────

  const closeWikiSheet = useCallback(() => {
    if (!isWikiSheetOpen && !isWikiSheetClosing && !isWikiSheetPeeked) {
      return;
    }

    window.clearTimeout(wikiCloseTimerRef.current);

    setIsWikiSheetOpen(false);
    setIsWikiSheetPeeked(false);
    setIsWikiSheetClosing(true);
    setIsWikiSheetDragging(false);

    wikiCloseTimerRef.current = window.setTimeout(() => {
      wikiDragDistanceYRef.current = 0;

      setWikiSheetDragY(0);
      setIsWikiSheetMounted(false);
      setIsWikiSheetClosing(false);
    }, WIKI_SHEET_CLOSE_ANIMATION_IN_MS);
  }, [
    isWikiSheetOpen,
    isWikiSheetClosing,
    isWikiSheetPeeked,
  ]);

  // ── Mobile Wiki-Sheet aus Peek öffnen ─────────────────────────────────

  const expandWikiSheet = useCallback(() => {
    setIsWikiSheetPeeked(false);
    setIsWikiSheetOpen(true);

    wikiDragDistanceYRef.current = 0;

    setWikiSheetDragY(0);
  }, []);

  // ── Mobile Wiki-Sheet einklappen ─────────────────────────────────

  const peekWikiSheet = useCallback(() => {
    if (!isWikiSheetOpen && !isWikiSheetPeeked) {
      return;
    }

    setIsWikiSheetOpen(false);
    setIsWikiSheetPeeked(true);
    setIsWikiSheetDragging(false);

    wikiDragDistanceYRef.current = 0;
    isWikiDraggingRef.current    = false;

    setWikiSheetDragY(0);
  }, [
    isWikiSheetOpen,
    isWikiSheetPeeked,
  ]);

  // ── Mobile Wiki-Sheet Drag starten ─────────────────────────────────

  function handleWikiPointerDown(event) {
    if (isWikiSheetPeeked) {
      expandWikiSheet();
      return;
    }

    wikiDragStartYRef.current    = event.clientY;
    wikiDragDistanceYRef.current = 0;
    isWikiDraggingRef.current    = true;

    setWikiSheetDragY(0);
    setIsWikiSheetDragging(true);

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  // ── Mobile Wiki-Sheet Drag bewegen ─────────────────────────────────

  function handleWikiPointerMove(event) {
    if (!isWikiDraggingRef.current) {
      return;
    }

    const nextDragDistance = Math.max(
      event.clientY - wikiDragStartYRef.current,
      0
    );

    wikiDragDistanceYRef.current = nextDragDistance;

    setWikiSheetDragY(nextDragDistance);
  }

  // ── Mobile Wiki-Sheet Drag beenden ─────────────────────────────────

  function handleWikiPointerUp() {
    if (!isWikiDraggingRef.current) {
      return;
    }

    isWikiDraggingRef.current = false;

    setIsWikiSheetDragging(false);

    if (wikiDragDistanceYRef.current >= WIKI_SHEET_PEEK_THRESHOLD_IN_PIXELS) {
      peekWikiSheet();
      return;
    }

    wikiDragDistanceYRef.current = 0;

    setWikiSheetDragY(0);
  }

  // ── Standortdaten und Wikipedia laden ─────────────────────────────────

  async function loadLocationData(
    latitude,
    longitude,
    overrideName = null,
    options = {}
  ) {
    setWikiData(null);
    setIsLocationDataLoading(true);

    if (isMobileViewport()) {
      openWikiSheet();
    }

    try {
      const geocodeData = await reverseGeocode(latitude, longitude);

      const mergedOsmCategory =
        options.osmCategory ||
        geocodeData.osmCategory ||
        "";

      setTargetLocation({
        latitude,
        longitude,
        ...geocodeData,
        osmCategory: mergedOsmCategory,
        name:        overrideName || geocodeData.name,
      });

      const fetchedWikiData = await fetchSmartWikipediaArticle({
        latitude,
        longitude,
        userSearchText: options.userSearchText || "",
        placeName:      overrideName || geocodeData.name || "",
        rawPlaceName:   geocodeData.rawPlaceName || "",
        city:           geocodeData.city || "",
        osmCategory:    mergedOsmCategory,
      });

      setWikiData(fetchedWikiData);
    } catch (loadError) {
      console.error("Fehler beim Laden der Standortdaten:", loadError);
    } finally {
      setIsLocationDataLoading(false);
    }
  }

  // ── Route berechnen ─────────────────────────────────

  async function calculateAndSetRoute(
    nextRouteProfile = routeProfile,
    nextRoutePreference = routePreference,
    options = {}
  ) {
    const effectiveStartLocation =
      options.startLocation ??
      startLocation ??
      currentLocation;

    const effectiveTargetLocation =
      options.targetLocation ??
      targetLocation;

    const effectiveWaypoints =
      options.waypoints ??
      waypoints;

    if (!effectiveStartLocation || !effectiveTargetLocation) {
      return;
    }

    clearPlaceBoundary();

    setIsRouteLoading(true);
    setRouteError(null);

    try {
      if (effectiveWaypoints.length > 0) {
        const stops = [
          effectiveStartLocation,
          ...effectiveWaypoints,
          effectiveTargetLocation,
        ];

        const multiStopRoute = await calculateRouteWithStops(
          stops,
          nextRouteProfile,
          nextRoutePreference
        );

        setRouteData({
          mode: "multi",
          ...multiStopRoute,
        });

        setSelectedLegIndex(0);
      } else {
        const routes = await calculateRoute(
          effectiveStartLocation,
          effectiveTargetLocation,
          nextRouteProfile,
          nextRoutePreference
        );

        setRouteData({
          mode:          "single",
          routes,
          selectedIndex: 0,
        });
      }

      if (isMobileViewport() && !isNavigating) {
        openWikiSheet();
      }
    } catch (error) {
      console.error("Routing-Fehler:", error);

      setRouteError(error.message ?? "Route konnte nicht berechnet werden.");
      setRouteData(null);
    } finally {
      setIsRouteLoading(false);
    }
  }

  // ── Route bei Startpunktänderung neu berechnen ─────────────────────────────────

  useEffect(() => {
    if (!routeData && !isRouteLoading) {
      return;
    }

    calculateAndSetRoute(routeProfile, routePreference);
  }, [startLocation]);

  // ── Route bei Zwischenstoppänderung neu berechnen ─────────────────────────────────

  useEffect(() => {
    if (!routeData && !isRouteLoading) {
      return;
    }

    calculateAndSetRoute(routeProfile, routePreference);
  }, [waypoints]);

  // ── Ortsgrenze ausblenden sobald eine Route angezeigt wird ─────────────────────────────────

  useEffect(() => {
    if (routeData || isRouteLoading) {
      clearPlaceBoundary();
    }
  }, [
    routeData,
    isRouteLoading,
  ]);

  // ── Navigationsschritt anhand aktueller Position aktualisieren ─────────────────────────────────

  useEffect(() => {
    if (!isNavigating || !currentLocation || !routeData) {
      return;
    }

    const activeSteps = routeData.mode === "multi"
      ? routeData.legs?.[navigationLegIndex]?.steps ?? []
      : routeData.routes?.[routeData.selectedIndex ?? 0]?.steps ?? [];

    if (!activeSteps.length) {
      return;
    }

    let closestStepIndex    = navigationStepIndex;
    let closestStepDistance = Number.POSITIVE_INFINITY;

    for (
      let stepIndex = navigationStepIndex;
      stepIndex < activeSteps.length;
      stepIndex += 1
    ) {
      const maneuverLocation = activeSteps[stepIndex].maneuverLocation;

      if (!maneuverLocation) {
        continue;
      }

      const distanceToStepInMeters = calculateDistanceInMeters(
        currentLocation,
        maneuverLocation
      );

      if (distanceToStepInMeters < closestStepDistance) {
        closestStepDistance = distanceToStepInMeters;
        closestStepIndex    = stepIndex;
      }
    }

    if (
      closestStepDistance >= NAVIGATION_STEP_DISTANCE_THRESHOLD_M ||
      closestStepIndex <= navigationStepIndex
    ) {
      return;
    }

    setNavigationStepIndex(closestStepIndex);

    if (closestStepIndex < activeSteps.length - 1) {
      return;
    }

    if (routeData.mode === "multi") {
      const totalLegs = routeData.legs?.length ?? 0;

      if (navigationLegIndex < totalLegs - 1) {
        const reachedLabel = getNavigationTargetLabel(
          routeData,
          navigationLegIndex,
          waypoints.length
        );

        setNotification({
          type:      "success",
          text:      `📍 Stopp ${reachedLabel} erreicht — weiter zum nächsten`,
          autoClose: 4000,
        });

        setNavigationLegIndex(navigationLegIndex + 1);
        setNavigationStepIndex(0);
        setSelectedLegIndex(navigationLegIndex + 1);

        return;
      }
    }

    setNotification({
      type:      "success",
      text:      "🎯 Ziel erreicht!",
      autoClose: 5000,
    });

    setIsNavigating(false);

    if (isMobileViewport() && routeData) {
      openWikiSheet();
    }
  }, [
    currentLocation,
    isNavigating,
    navigationStepIndex,
    navigationLegIndex,
    routeData,
    waypoints.length,
    openWikiSheet,
  ]);

  // ── Karte während Navigation auf Standort halten ─────────────────────────────────

  useEffect(() => {
    if (!isNavigating || !currentLocation) {
      return;
    }

    setIsFollowing(true);
    setMapFocus(createMapFocus(currentLocation, 18));
  }, [
    currentLocation,
    isNavigating,
  ]);

  // ── POI-Kategorien laden ─────────────────────────────────

  async function loadPointsOfInterestForCategory(categoryKey, mapBounds) {
    if (!categoryKey || !mapBounds) {
      return;
    }

    const requestId = pointsOfInterestRequestIdRef.current + 1;
    pointsOfInterestRequestIdRef.current = requestId;

    pointsOfInterestFetchControllerRef.current?.abort();

    const fetchController = new AbortController();
    pointsOfInterestFetchControllerRef.current = fetchController;

    setArePointsOfInterestLoading(true);

    try {
      const fetchedPointsOfInterest = await fetchPointsOfInterest(
        mapBounds,
        categoryKey,
        {
          signal: fetchController.signal,
        }
      );

      if (requestId !== pointsOfInterestRequestIdRef.current) {
        return;
      }

      setPointsOfInterest(fetchedPointsOfInterest);
    } catch (fetchError) {
      if (fetchError.name === "AbortError") {
        return;
      }

      if (requestId !== pointsOfInterestRequestIdRef.current) {
        return;
      }

      console.warn("POI-Abfragefehler", fetchError);

      setPointsOfInterest([]);
    } finally {
      if (requestId === pointsOfInterestRequestIdRef.current) {
        setArePointsOfInterestLoading(false);
      }
    }
  }

  function handlePOICategorySelect(categoryKey) {
    setActivePOICategoryKey(categoryKey);

    if (!categoryKey) {
      pointsOfInterestRequestIdRef.current += 1;
      pointsOfInterestFetchControllerRef.current?.abort();

      setPointsOfInterest([]);
      setArePointsOfInterestLoading(false);
    }
  }

  function handleMapBoundsChange(newMapBounds) {
    setCurrentMapBounds(newMapBounds);
  }

  function handlePointOfInterestSelect(pointOfInterest) {
    clearRouteExtras();
    clearRouteState();
    clearPlaceBoundary();

    setTargetLocation({
      latitude:     pointOfInterest.latitude,
      longitude:    pointOfInterest.longitude,
      name:         pointOfInterest.name,
      shortAddress: "",
    });

    loadLocationData(
      pointOfInterest.latitude,
      pointOfInterest.longitude,
      pointOfInterest.name
    );
  }

  // ── POIs neu laden, wenn Kategorie oder Kartenausschnitt sich ändert ─────────────────────────────────

  useEffect(() => {
    if (!activePOICategoryKey || !currentMapBounds) {
      return;
    }

    const debounceTimer = window.setTimeout(() => {
      loadPointsOfInterestForCategory(activePOICategoryKey, currentMapBounds);
    }, 900);

    return () => {
      window.clearTimeout(debounceTimer);
    };
  }, [
    activePOICategoryKey,
    currentMapBounds,
  ]);

  // ── Kartenklick verarbeiten ─────────────────────────────────

  function handleMapClick(clickedLocation) {
    if (isNavigating) {
      return;
    }

    if (mapClickMode === "waypoint") {
      handleWaypointSelect(clickedLocation);
      return;
    }

    if (mapClickMode === "target") {
      clearRouteExtras();
      clearRouteState();
      clearPlaceBoundary();

      setTargetLocation({
        ...clickedLocation,
        name:         "Wird geladen...",
        shortAddress: "",
      });

      loadLocationData(
        clickedLocation.latitude,
        clickedLocation.longitude
      );

      return;
    }

    if (mapClickMode === "start") {
      handleStartSelect(clickedLocation);
    }
  }

  // ── Ziel auswählen ─────────────────────────────────

  async function handleTargetSelect({
    latitude,
    longitude,
    name,
    osmId,
    osmType,
    osmCategory,
    wikiSearchText,
  }) {
    if (isNavigating) {
      setIsNavigating(false);
      setNavigationStepIndex(0);
      setNavigationLegIndex(0);
    }

    const boundaryRequestId = placeBoundaryRequestIdRef.current + 1;
    placeBoundaryRequestIdRef.current = boundaryRequestId;

    clearRouteExtras();
    clearRouteState();
    setPlaceBoundaryGeoJson(null);

    const nextTargetLocation = {
      latitude,
      longitude,
      name,
      shortAddress: "",
    };

    setTargetLocation(nextTargetLocation);
    setIsFollowing(false);

    const isNamedRegion = osmId && osmType === "R";

    if (isNamedRegion) {
      fetchPlaceBoundary(osmType, osmId)
        .then((geoJson) => {
          if (boundaryRequestId !== placeBoundaryRequestIdRef.current) {
            return;
          }

          setPlaceBoundaryGeoJson(geoJson);

          if (!geoJson) {
            setMapFocus(createMapFocus({ latitude, longitude }, 12));
          }
        })
        .catch(() => {
          if (boundaryRequestId !== placeBoundaryRequestIdRef.current) {
            return;
          }

          setPlaceBoundaryGeoJson(null);
          setMapFocus(createMapFocus({ latitude, longitude }, 12));
        });
    } else {
      setMapFocus(createMapFocus({ latitude, longitude }, 14));
    }

    await loadLocationData(
      latitude,
      longitude,
      name || null,
      {
        osmCategory,
        userSearchText: wikiSearchText,
      }
    );

    return nextTargetLocation;
  }

    // ── Ziel löschen ─────────────────────────────────

  function handleTargetClear() {
    if (isNavigating) {
      setIsNavigating(false);
      setNavigationStepIndex(0);
      setNavigationLegIndex(0);
    }

    setTargetLocation(null);
    setWikiData(null);

    clearRouteState();
    clearRouteExtras();
    clearPlaceBoundary();

    closeWikiSheet();
  }

  // ── Start auswählen ─────────────────────────────────

  async function handleStartSelect(selectedLocation) {
    if (isNavigating) {
      setIsNavigating(false);
      setNavigationStepIndex(0);
      setNavigationLegIndex(0);
    }

    const temporaryStartLocation = {
      ...selectedLocation,
      name:         selectedLocation.name ?? "Startpunkt",
      shortAddress: selectedLocation.shortAddress ?? "",
    };

    setStartLocation(temporaryStartLocation);
    setMapClickMode("target");

    try {
      const geocodeData = await reverseGeocode(
        selectedLocation.latitude,
        selectedLocation.longitude
      );

      setStartLocation({
        latitude:  selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        ...geocodeData,
      });
    } catch {
      setStartLocation(temporaryStartLocation);
    }
  }

  // ── Start löschen ─────────────────────────────────

  function handleStartClear() {
    setStartLocation(null);
  }

  // ── Routenanfrage starten ─────────────────────────────────

  function handleRouteRequest() {
    setRouteProfile("driving");
    calculateAndSetRoute("driving", routePreference);
  }

  // ── Routenprofil ändern ─────────────────────────────────

  function handleProfileChange(nextProfile) {
    setRouteProfile(nextProfile);
    calculateAndSetRoute(nextProfile, routePreference);
  }

  // ── Routenpräferenz ändern ─────────────────────────────────

  function handlePreferenceChange(nextPreference) {
    setRoutePreference(nextPreference);
    calculateAndSetRoute(routeProfile, nextPreference);
  }

  // ── Routenalternative auswählen ─────────────────────────────────

  function handleSelectRoute(routeIndex) {
    setRouteData((currentRouteData) => {
      if (!currentRouteData) {
        return currentRouteData;
      }

      return {
        ...currentRouteData,
        selectedIndex: routeIndex,
      };
    });
  }

  // ── Route schließen ─────────────────────────────────

  function handleRouteClose() {
    setRouteData(null);
    setRouteError(null);
    setTrafficIncidents([]);
    setAreTrafficIncidentsLoading(false);
  }

  // ── Zwischenstopp per Karte hinzufügen ─────────────────────────────────

  function handleAddWaypointFromMap() {
    setMapClickMode("waypoint");

    setNotification({
      type:      "success",
      text:      "Tippe auf die Karte, um einen Zwischenstopp zu setzen.",
      autoClose: 3000,
    });
  }

  // ── Zwischenstopp auswählen ─────────────────────────────────

  async function handleWaypointSelect(selectedLocation) {
    let waypointName =
      selectedLocation.name ||
      selectedLocation.displayName ||
      "Zwischenstopp";

    if (!selectedLocation.name && !selectedLocation.displayName) {
      try {
        const geocodeData = await reverseGeocode(
          selectedLocation.latitude,
          selectedLocation.longitude
        );

        waypointName = geocodeData.name || waypointName;
      } catch {
        waypointName = "Zwischenstopp";
      }
    }

    setWaypoints((currentWaypoints) => [
      ...currentWaypoints,
      {
        latitude:  selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        name:      waypointName,
      },
    ]);

    setSelectedLegIndex(0);
    setMapClickMode("target");
  }

  // ── Routenstopps für Drag-and-drop vorbereiten ─────────────────────────────────

  function getRouteStopsForReorder() {
    const effectiveStartLocation = startLocation ?? currentLocation;

    if (!effectiveStartLocation || !targetLocation) {
      return [];
    }

    return [
      {
        type:                   "start",
        isCurrentLocationStart: !startLocation,
        ...effectiveStartLocation,
        name: startLocation?.name || "Mein Standort",
      },
      ...waypoints.map((waypoint) => ({
        type: "waypoint",
        ...waypoint,
      })),
      {
        type: "target",
        ...targetLocation,
        name: targetLocation.name || "Ziel",
      },
    ];
  }

  // ── Routenstopps neu sortieren ─────────────────────────────────

  function handleReorderRouteStops(fromIndex, toIndex) {
    if (fromIndex === toIndex) {
      return;
    }

    const routeStops = getRouteStopsForReorder();

    if (routeStops.length < 2) {
      return;
    }

    const nextRouteStops = [...routeStops];
    const [movedStop]   = nextRouteStops.splice(fromIndex, 1);

    nextRouteStops.splice(toIndex, 0, movedStop);

    const nextStartStop   = nextRouteStops[0];
    const nextMiddleStops = nextRouteStops.slice(1, -1);
    const nextTargetStop  = nextRouteStops[nextRouteStops.length - 1];

    if (nextStartStop.isCurrentLocationStart) {
      setStartLocation(null);
    } else {
      setStartLocation(
        createPlainLocation(nextStartStop, "Startpunkt")
      );
    }

    setWaypoints(
      nextMiddleStops.map((stop, index) => {
        return createPlainLocation(stop, `Zwischenziel ${index + 1}`);
      })
    );

    setTargetLocation(
      createPlainLocation(nextTargetStop, "Ziel")
    );

    setSelectedLegIndex(0);
    setNavigationLegIndex(0);
    setNavigationStepIndex(0);
    setRouteError(null);
  }

  // ── Zwischenstopp löschen ─────────────────────────────────

  function handleRemoveWaypoint(waypointIndex) {
    setWaypoints((currentWaypoints) => {
      return currentWaypoints.filter((_, index) => {
        return index !== waypointIndex;
      });
    });

    setSelectedLegIndex(0);
    setNavigationLegIndex(0);
    setNavigationStepIndex(0);
  }

  // ── Multi-Stop-Leg auswählen ─────────────────────────────────

  function handleSelectLeg(legIndex) {
    setSelectedLegIndex(legIndex);
  }

  // ── Wetter abrufen, wenn Route berechnet wurde ─────────────────────────────────

  const activeRouteDurationInSeconds = getRouteDurationInSeconds(routeData);

  useEffect(() => {
    if (!targetLocation || !routeData) {
      setDestinationWeather(null);
      setWeatherError(null);
      setIsWeatherLoading(false);
      return;
    }

    const controller = new AbortController();

    setIsWeatherLoading(true);
    setWeatherError(null);

    fetchDestinationWeather(targetLocation, {
      signal:                 controller.signal,
      routeDurationInSeconds: activeRouteDurationInSeconds,
    })
      .then((weather) => {
        if (controller.signal.aborted) {
          return;
        }

        setDestinationWeather(weather);
      })
      .catch((error) => {
        if (error.name === "AbortError") {
          return;
        }

        console.warn("Wetter-Fehler:", error);

        setDestinationWeather(null);
        setWeatherError(error.message ?? "Wetter konnte nicht geladen werden.");
      })
      .finally(() => {
        if (controller.signal.aborted) {
          return;
        }

        setIsWeatherLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [
    targetLocation,
    routeData,
    activeRouteDurationInSeconds,
  ]);

  // ── Verkehrsmeldungen laden, wenn Route berechnet wurde ─────────────────────────────────

  useEffect(() => {
    const shouldLoadTrafficIncidents =
      routeProfile === "driving" &&
      Boolean(routeData) &&
      !isRouteLoading &&
      !routeError;

    if (!shouldLoadTrafficIncidents) {
      setTrafficIncidents([]);
      setAreTrafficIncidentsLoading(false);
      return;
    }

    const trafficRouteInput = getTrafficRouteInput(routeData);

    if (
      trafficRouteInput.steps.length === 0 ||
      trafficRouteInput.coordinates.length === 0
    ) {
      setTrafficIncidents([]);
      setAreTrafficIncidentsLoading(false);
      return;
    }

    const controller = new AbortController();

    setAreTrafficIncidentsLoading(true);
    setTrafficIncidents([]);

    fetchTrafficIncidentsForRoute(
      trafficRouteInput.steps,
      trafficRouteInput.coordinates,
      {
        signal: controller.signal,
      }
    )
      .then((nextTrafficIncidents) => {
        if (controller.signal.aborted) {
          return;
        }

        setTrafficIncidents(nextTrafficIncidents);
      })
      .catch((error) => {
        if (error.name === "AbortError") {
          return;
        }

        console.warn("Verkehrsmeldungs-Fehler:", error);

        setTrafficIncidents([]);
      })
      .finally(() => {
        if (controller.signal.aborted) {
          return;
        }

        setAreTrafficIncidentsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [
    routeData,
    routeProfile,
    isRouteLoading,
    routeError,
  ]);

  // ── Navigation starten ─────────────────────────────────

  function handleStartNavigation() {
    setIsNavigating(true);
    setNavigationStepIndex(0);
    setNavigationLegIndex(0);
    setSelectedLegIndex(0);
    setIsFollowing(true);

    if (currentLocation) {
      setMapFocus(createMapFocus(currentLocation, 18));
    }

    if (isMobileViewport()) {
      closeWikiSheet();
    }
  }

  // ── Navigation stoppen ─────────────────────────────────

  function handleStopNavigation() {
    setIsNavigating(false);
    setNavigationStepIndex(0);
    setNavigationLegIndex(0);

    if (isMobileViewport() && routeData) {
      openWikiSheet();
    }
  }

  // ── Route speichern ─────────────────────────────────

  function handleSaveRoute(routeName) {
    if (!routeData || !targetLocation) {
      return;
    }

    const selectedRoute = getSelectedRouteFromRouteData(routeData);

    const routeEntry = {
      id:   Date.now(),
      name: routeName || targetLocation.name,

      target: {
        latitude:  targetLocation.latitude,
        longitude: targetLocation.longitude,
        name:      targetLocation.name,
      },

      profile:    routeProfile,
      preference: routePreference,
      distance:   selectedRoute?.distance ?? 0,
      duration:   selectedRoute?.duration ?? 0,
      savedAt:    Date.now(),
    };

    saveRoute(routeEntry);

    setSavedRoutes(getSavedRoutes());

    setNotification({
      type:      "success",
      text:      "Route gespeichert!",
      autoClose: 2500,
    });
  }

  // ── Gespeicherte Route löschen ─────────────────────────────────

  function handleDeleteRoute(routeId) {
    deleteRoute(routeId);
    setSavedRoutes(getSavedRoutes());
  }

  // ── Gespeicherte Route laden ─────────────────────────────────

  async function handleLoadRoute(routeEntry) {
    setAreSavedRoutesVisible(false);

    const loadedTargetLocation = await handleTargetSelect({
      latitude:  routeEntry.target.latitude,
      longitude: routeEntry.target.longitude,
      name:      routeEntry.target.name,
    });

    setRouteProfile(routeEntry.profile);
    setRoutePreference(routeEntry.preference);

    calculateAndSetRoute(
      routeEntry.profile,
      routeEntry.preference,
      {
        targetLocation: loadedTargetLocation,
      }
    );
  }

  // ── Zuhause setzen ─────────────────────────────────

  function handleSetHome() {
    if (!currentLocation) {
      return;
    }

    const nextHomeLocation = {
      latitude:  currentLocation.latitude,
      longitude: currentLocation.longitude,
      name:      "Zuhause",
    };

    saveHome(nextHomeLocation);

    setHomeLocation(nextHomeLocation);

    setNotification({
      type:      "success",
      text:      "🏠 Zuhause gesetzt!",
      autoClose: 2500,
    });
  }

  // ── Zuhause löschen ─────────────────────────────────

  function handleClearHome() {
    clearHome();
    setHomeLocation(null);
  }

  // ── Nach Hause navigieren ─────────────────────────────────

  function handleGoHome() {
    if (!homeLocation) {
      return;
    }

    handleTargetSelect({
      latitude:  homeLocation.latitude,
      longitude: homeLocation.longitude,
      name:      "Zuhause",
    });
  }

  // ── GPS-FAB anklicken ─────────────────────────────────

  function handleGpsFabClick() {
    if (!currentLocation) {
      return;
    }

    setIsFollowing(true);
    setMapFocus(createMapFocus(currentLocation, 16));
  }

  // ── Kompass anklicken ─────────────────────────────────

  async function handleCompassClick() {
    const canRequestDeviceOrientationPermission =
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function";

    if (canRequestDeviceOrientationPermission) {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();

        if (permission === "granted") {
          window.addEventListener(
            "deviceorientationabsolute",
            (event) => {
              setCompassHeading(Math.round(event.webkitCompassHeading ?? 0));
            },
            true
          );
        }
      } catch {
        setNotification({
          type:      "error",
          text:      "Kompass-Zugriff wurde nicht erlaubt.",
          autoClose: 3000,
        });
      }
    }

    if (currentLocation) {
      setIsFollowing(true);
      setMapFocus(createMapFocus(currentLocation, 16));
    }
  }

  // ── Karten-Follow-Modus verlassen ─────────────────────────────────

  function handleFollowLost() {
    setIsFollowing(false);
  }

  // ── Abgeleitete Navigationsdaten ─────────────────────────────────

  const activeNavigationSteps = (() => {
    if (!routeData) {
      return [];
    }

    if (routeData.mode === "multi") {
      return routeData.legs?.[navigationLegIndex]?.steps ?? [];
    }

    return routeData.routes?.[routeData.selectedIndex ?? 0]?.steps ?? [];
  })();

  const currentNavigationStep = activeNavigationSteps[navigationStepIndex];
  const nextNavigationStep    = activeNavigationSteps[navigationStepIndex + 1];

  const navigationRemainingDistance = (() => {
    const currentLegRemainingDistance = activeNavigationSteps
      .slice(navigationStepIndex)
      .reduce((sum, step) => {
        return sum + step.distance;
      }, 0);

    if (routeData?.mode === "multi") {
      const followingLegsDistance = (routeData.legs ?? [])
        .slice(navigationLegIndex + 1)
        .reduce((sum, leg) => {
          return sum + leg.distance;
        }, 0);

      return currentLegRemainingDistance + followingLegsDistance;
    }

    return currentLegRemainingDistance;
  })();

  const navigationReferenceDistance = routeData?.mode === "multi"
    ? routeData.totalDistance
    : routeData?.routes?.[routeData?.selectedIndex ?? 0]?.distance ?? 0;

  const navigationReferenceDuration = routeData?.mode === "multi"
    ? routeData.totalDuration
    : routeData?.routes?.[routeData?.selectedIndex ?? 0]?.duration ?? 0;

  const navigationRemainingDuration =
    navigationRemainingDistance > 0 && navigationReferenceDistance > 0
      ? Math.round(
          (navigationRemainingDistance / navigationReferenceDistance) *
          navigationReferenceDuration
        )
      : 0;

  const navigationEstimatedArrivalTime =
    calculateEstimatedArrivalTime(navigationRemainingDuration);

  const navigationTargetLetter = getNavigationTargetLabel(
    routeData,
    navigationLegIndex,
    waypoints.length
  );

  const canStartNavigation =
    Boolean(currentLocation) &&
    !startLocation;

  const shouldRenderWikiSheet = isWikiSheetMounted;

  const appShellClassName = buildClassName([
    "app-shell",
    isSplashVisible ? "app-shell--loading" : "app-shell--visible",
    isNavigating ? "app-shell--navigating" : "",
  ]);

  const wikiSheetOverlayClassName = buildClassName([
    "wiki-sheet-overlay",
    isWikiSheetOpen ? "wiki-sheet-overlay--open" : "",
    isWikiSheetClosing ? "wiki-sheet-overlay--closing" : "",
  ]);

  const wikiSheetClassName = buildClassName([
    "wiki-sheet",
    isWikiSheetOpen ? "wiki-sheet--open" : "",
    isWikiSheetClosing ? "wiki-sheet--closing" : "",
    isWikiSheetDragging ? "wiki-sheet--dragging" : "",
    isWikiSheetPeeked ? "wiki-sheet--peeked" : "",
  ]);

  // ── Render ─────────────────────────────────

  return (
    <>
      {notification && (
        <div className={`app-notification app-notification--${notification.type}`}>
          <span className="app-notification__text">
            {notification.text}
          </span>

          <button
            className="app-notification__close"
            onClick={() => {
              setNotification(null);
            }}
            type="button"
            aria-label="Benachrichtigung schließen"
          >
            ✕
          </button>
        </div>
      )}

      {isNavigating && (
        <NavigationBar
          currentStep={currentNavigationStep}
          nextStep={nextNavigationStep}
          remainingDistance={navigationRemainingDistance}
          remainingDuration={navigationRemainingDuration}
          eta={navigationEstimatedArrivalTime}
          targetLetter={navigationTargetLetter}
          onStop={handleStopNavigation}
          onCenter={handleGpsFabClick}
        />
      )}

      <Splash
        statusText={splashText}
        visible={isSplashVisible}
      />

      <div className={appShellClassName}>
        <aside className="sidebar">
          <div className="sidebar__inner">
            <div className="sidebar__header">
              <div className="sidebar__brand">
                <NavixLogo size={26} />

                <div>
                  <div className="sidebar__brand-name">
                    Na<em>vix</em>
                  </div>

                  <div className="sidebar__brand-version">
                    Navigation · v1.0
                  </div>
                </div>
              </div>
            </div>

            <div className="sidebar__search">
              <SearchCard
                currentLocation={currentLocation}
                targetLocation={targetLocation}
                startLocation={startLocation}
                waypoints={waypoints}
                mapClickMode={mapClickMode}
                onMapClickModeChange={setMapClickMode}
                onTargetSelect={handleTargetSelect}
                onTargetClear={handleTargetClear}
                onBoundaryClear={clearPlaceBoundary}
                onStartSelect={handleStartSelect}
                onStartClear={handleStartClear}
                onWaypointSelect={handleWaypointSelect}
                onWaypointRemove={handleRemoveWaypoint}
                onRouteStopsReorder={handleReorderRouteStops}
              />
            </div>

            <div className="sidebar__body">
              {isNavigating ? (
                <NavigationPanel
                  steps={activeNavigationSteps}
                  currentStepIndex={navigationStepIndex}
                  remainingDistance={navigationRemainingDistance}
                  remainingDuration={navigationRemainingDuration}
                  eta={navigationEstimatedArrivalTime}
                  targetLetter={navigationTargetLetter}
                  onStop={handleStopNavigation}
                />
              ) : routeData || isRouteLoading || routeError ? (
                <RoutePanel
                  routeData={routeData}
                  isLoading={isRouteLoading}
                  error={routeError}
                  profile={routeProfile}
                  preference={routePreference}
                  onProfileChange={handleProfileChange}
                  onPreferenceChange={handlePreferenceChange}
                  onSelectRoute={handleSelectRoute}
                  onClose={handleRouteClose}
                  canStartNavigation={canStartNavigation}
                  onStartNavigation={handleStartNavigation}
                  onSaveRoute={handleSaveRoute}
                  targetLocationName={targetLocation?.name ?? ""}
                  destinationWeather={destinationWeather}
                  isWeatherLoading={isWeatherLoading}
                  weatherError={weatherError}
                  waypoints={waypoints}
                  onAddWaypoint={handleAddWaypointFromMap}
                  onRemoveWaypoint={handleRemoveWaypoint}
                  selectedLegIndex={selectedLegIndex}
                  onSelectLeg={handleSelectLeg}
                  trafficIncidents={trafficIncidents}
                  areTrafficIncidentsLoading={areTrafficIncidentsLoading}
                />
              ) : (
                <WikipediaCard
                  location={targetLocation}
                  wikiData={wikiData}
                  isLoading={isLocationDataLoading}
                  currentLocation={currentLocation}
                  startLocation={startLocation}
                  onRouteRequest={handleRouteRequest}
                />
              )}
            </div>

            <div className="sidebar__footer">
              <NavixLogo size={11} />
              Navix 2026 · OpenStreetMap · Wikipedia
            </div>

            <div className="sidebar__saved">
              <div className="sidebar__home">
                {homeLocation ? (
                  <>
                    <button
                      className="sidebar__home-button"
                      onClick={handleGoHome}
                      type="button"
                    >
                      🏠 Zuhause navigieren
                    </button>

                    <button
                      className="sidebar__home-clear-button"
                      onClick={handleClearHome}
                      type="button"
                      aria-label="Zuhause löschen"
                    >
                      ×
                    </button>
                  </>
                ) : (
                  <button
                    className="sidebar__home-button sidebar__home-button--set"
                    onClick={handleSetHome}
                    type="button"
                    disabled={!currentLocation}
                  >
                    🏠 Aktuellen Standort als Zuhause setzen
                  </button>
                )}
              </div>

              {savedRoutes.length > 0 && (
                <div className="sidebar__routes-section">
                  <button
                    className="sidebar__routes-toggle"
                    onClick={() => {
                      setAreSavedRoutesVisible((currentValue) => {
                        return !currentValue;
                      });
                    }}
                    type="button"
                  >
                    <span>
                      📍 Gespeicherte Routen ({savedRoutes.length})
                    </span>

                    <span>
                      {areSavedRoutesVisible ? "▲" : "▼"}
                    </span>
                  </button>

                  {areSavedRoutesVisible && (
                    <ul className="sidebar__routes-list">
                      {savedRoutes.map((savedRoute) => (
                        <li
                          key={savedRoute.id}
                          className="sidebar__route-item"
                        >
                          <button
                            className="sidebar__route-load-button"
                            onClick={() => {
                              handleLoadRoute(savedRoute);
                            }}
                            type="button"
                          >
                            <span className="sidebar__route-name">
                              {savedRoute.name}
                            </span>

                            <span className="sidebar__route-meta">
                              {(savedRoute.distance / 1000).toFixed(1)} km ·{" "}
                              {Math.round(savedRoute.duration / 60)} Min
                            </span>
                          </button>

                          <button
                            className="sidebar__route-delete-button"
                            onClick={() => {
                              handleDeleteRoute(savedRoute.id);
                            }}
                            type="button"
                            aria-label="Gespeicherte Route löschen"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>

        <div className="map-area">
          <Map
            currentLocation={currentLocation}
            onMapClick={handleMapClick}
            mapFocus={mapFocus}
            isFollowing={isFollowing}
            onFollowLost={handleFollowLost}
            mapStyleId={mapStyleId}
            onMapStyleChange={setMapStyleId}
            targetLocation={targetLocation}
            startLocation={startLocation}
            routeData={routeData}
            onSelectRoute={handleSelectRoute}
            isNavigating={isNavigating}
            compassHeading={compassHeading}
            pointsOfInterest={pointsOfInterest}
            onPointOfInterestSelect={handlePointOfInterestSelect}
            onBoundsChange={handleMapBoundsChange}
            placeBoundaryGeoJson={placeBoundaryGeoJson}
            waypoints={waypoints}
            selectedLegIndex={selectedLegIndex}
            onSelectLeg={handleSelectLeg}
            trafficIncidents={trafficIncidents}
          />

          <div className="desktop-poi-bar-container">
            <PoiBar
              activeCategoryKey={activePOICategoryKey}
              arePointsOfInterestLoading={arePointsOfInterestLoading}
              onCategorySelect={handlePOICategorySelect}
            />
          </div>

          <div className="mobile-topbar">
            <div className="mobile-topbar__inner">
              <SearchCard
                currentLocation={currentLocation}
                targetLocation={targetLocation}
                startLocation={startLocation}
                waypoints={waypoints}
                mapClickMode={mapClickMode}
                onMapClickModeChange={setMapClickMode}
                onTargetSelect={handleTargetSelect}
                onTargetClear={handleTargetClear}
                onBoundaryClear={clearPlaceBoundary}
                onStartSelect={handleStartSelect}
                onStartClear={handleStartClear}
                onWaypointSelect={handleWaypointSelect}
                onWaypointRemove={handleRemoveWaypoint}
                onRouteStopsReorder={handleReorderRouteStops}
              />

              <PoiBar
                activeCategoryKey={activePOICategoryKey}
                arePointsOfInterestLoading={arePointsOfInterestLoading}
                onCategorySelect={handlePOICategorySelect}
              />
            </div>
          </div>

          <div className="map-fabs">
            <button
              className="fab"
              onClick={handleCompassClick}
              type="button"
              title={`Kompass: ${compassHeading}° - auf Standort zentrieren`}
            >
              <CompassIcon heading={compassHeading} />
            </button>

            <button
              className={`fab ${isFollowing ? "fab--active" : ""}`}
              onClick={handleGpsFabClick}
              type="button"
              title={isFollowing ? "Folgt Standort" : "Auf Standort zentrieren"}
              disabled={!currentLocation}
            >
              <GpsIcon />
            </button>
          </div>
        </div>
      </div>

      {shouldRenderWikiSheet && (
        <>
          {!isWikiSheetPeeked && !routeData && (
            <div
              ref={wikiOverlayElementRef}
              className={wikiSheetOverlayClassName}
              onClick={isWikiSheetOpen ? peekWikiSheet : undefined}
            />
          )}

          <div
            ref={wikiSheetElementRef}
            className={wikiSheetClassName}
            style={{
              "--sheet-drag-y": `${wikiSheetDragY}px`,
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <div
              className="wiki-sheet__drag-area"
              onPointerDown={handleWikiPointerDown}
              onPointerMove={handleWikiPointerMove}
              onPointerUp={handleWikiPointerUp}
              onPointerCancel={handleWikiPointerUp}
            >
              <div className="wiki-sheet__handle">
                <div className="wiki-sheet__handle-bar" />
              </div>
            </div>

            <div className="wiki-sheet__scroll">
              {routeData || isRouteLoading || routeError ? (
                <RoutePanel
                  routeData={routeData}
                  isLoading={isRouteLoading}
                  error={routeError}
                  profile={routeProfile}
                  preference={routePreference}
                  onProfileChange={handleProfileChange}
                  onPreferenceChange={handlePreferenceChange}
                  onSelectRoute={handleSelectRoute}
                  onClose={handleRouteClose}
                  canStartNavigation={canStartNavigation}
                  onStartNavigation={handleStartNavigation}
                  onSaveRoute={handleSaveRoute}
                  targetLocationName={targetLocation?.name ?? ""}
                  destinationWeather={destinationWeather}
                  isWeatherLoading={isWeatherLoading}
                  weatherError={weatherError}
                  waypoints={waypoints}
                  onAddWaypoint={handleAddWaypointFromMap}
                  onRemoveWaypoint={handleRemoveWaypoint}
                  selectedLegIndex={selectedLegIndex}
                  onSelectLeg={handleSelectLeg}
                  trafficIncidents={trafficIncidents}
                  areTrafficIncidentsLoading={areTrafficIncidentsLoading}
                />
              ) : (
                <WikipediaCard
                  location={targetLocation}
                  wikiData={wikiData}
                  isLoading={isLocationDataLoading}
                  currentLocation={currentLocation}
                  startLocation={startLocation}
                  onRouteRequest={handleRouteRequest}
                  onClose={closeWikiSheet}
                  isMobileSheet
                />
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default App;