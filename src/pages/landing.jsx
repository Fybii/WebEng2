import { Page } from 'framework7-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Map from '../components/Map';
import AppNotification from '../components/AppNotification';
import RoutePanel from '../components/RoutePanel';
import RoutePlannerSheet from '../components/RoutePlannerSheet';
import PoiBar from '../components/PoiBar';
import {
    searchPlaces, reversePlace, fetchWikipediaInfo, calculateRoute, fetchDestinationWeather,
    fetchRouteAlerts, fetchPOIs, POI_CATEGORIES, hasOrsApiKey,
    boundsFromCenterKm, filterPoisByRadius, POI_SEARCH_RADIUS_KM, distanceBetweenMeters, normalizeRoutePreference,
} from '../js/services';
import {
    getHomeAddress, setHomeAddress, clearHomeAddress,
    getSavedRoutes, saveRoute, deleteSavedRoute,
} from '../js/userStorage';


const LandingPage = () => {
    const [notification, setNotification] = useState(null);
    const [isInitializing, setIsInitializing] = useState(true);

    const [currentLocation, setCurrentLocation] = useState(null);
    const [startPoint, setStartPoint] = useState(null);
    const [targetPoint, setTargetPoint] = useState(null);

    const [selectionMode, setSelectionMode] = useState('none');
    const [startMode, setStartMode] = useState('current');

    const [isLocating, setIsLocating] = useState(false);
    const [isWatchingLocation, setIsWatchingLocation] = useState(false);

    const [mapFocus, setMapFocus] = useState(null);

    const [activeSearchField, setActiveSearchField] = useState(null);
    const [startSearch, setStartSearch] = useState('');
    const [startLabel, setStartLabel] = useState('');
    const [targetSearch, setTargetSearch] = useState('');
    const [targetLabel, setTargetLabel] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState('');

    const [wikiInfo, setWikiInfo] = useState(undefined);
    const [wikiError, setWikiError] = useState('');
    const [isWikiCardOpen, setIsWikiCardOpen] = useState(false);
    const [infoFlowState, setInfoFlowState] = useState('idle');
    const [startGeoState, setStartGeoState] = useState({ loading: false, error: false, point: null });
    const [targetGeoState, setTargetGeoState] = useState({ loading: false, error: false, point: null });

    const [routeData, setRouteData] = useState(null);
    const [routeAlternatives, setRouteAlternatives] = useState([]);
    const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
    const [routePreference, setRoutePreference] = useState('fastest');
    const [routeAlerts, setRouteAlerts] = useState([]);
    const [isAlertsLoading, setIsAlertsLoading] = useState(false);
    const [isRouteLoading, setIsRouteLoading] = useState(false);
    const [routeError, setRouteError] = useState('');
    const [transportMode, setTransportMode] = useState('driving');

    const [destinationWeather, setDestinationWeather] = useState(null);
    const [isWeatherLoading, setIsWeatherLoading] = useState(false);
    const [weatherError, setWeatherError] = useState('');

    const [isNavigating, setIsNavigating] = useState(false);
    const [isMapFollowing, setIsMapFollowing] = useState(false);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);

    const [waypoints, setWaypoints] = useState([]);

    const [activePOICategory, setActivePOICategory] = useState(null);
    const [poiMarkers, setPOIMarkers] = useState([]);
    const [isPOILoading, setIsPOILoading] = useState(false);
    const [mapBounds, setMapBounds] = useState(null);

    const [homeAddress, setHomeAddressState] = useState(() => getHomeAddress());
    const [savedRoutes, setSavedRoutesState] = useState(() => getSavedRoutes());
    const [isPlannerOpen, setIsPlannerOpen] = useState(false);
    const [suppressRouteFit, setSuppressRouteFit] = useState(false);

    const activeWorkflowControllerRef = useRef(null);
    const poiCacheRef = useRef(null);
    const poiFetchAbortRef = useRef(null);
    const poiNotifyEmptyRef = useRef(false);

    // Refs keep values available inside async geolocation callbacks.
    const watchIdRef = useRef(null);
    const hasLocationFixRef = useRef(false);
    const shouldFocusOnNextFixRef = useRef(true);
    const startModeRef = useRef(startMode);
    const isNavigatingRef = useRef(isNavigating);
    const startLocationWatchRef = useRef(null);

    const ROUTE_START_UPDATE_MIN_METERS = 100;

    const closeNotification = useCallback(() => {
        setNotification(null);
    }, []);

    // Closes the search panel and discards temporary input text.
    const cancelSearch = useCallback(() => {
        setActiveSearchField(null);
        setSearchResults([]);
        setSearchError('');
        setIsSearching(false);

        setStartSearch('');
        setTargetSearch('');
    }, []);

    // Converts coordinates into a readable place label and tracks loading/error state.
    const resolvePointLabel = useCallback(async (field, point, fallbackLabel) => {
        const setGeoState = field === 'start' ? setStartGeoState : setTargetGeoState;
        setGeoState({ loading: true, error: false, point });

        try {
            const place = await reversePlace(point);
            setGeoState({ loading: false, error: false, point: null });
            return place.label || fallbackLabel;
        }
        catch {
            setGeoState({ loading: false, error: true, point });
            return fallbackLabel;
        }
    }, []);

    const retryResolveLabel = useCallback((field) => {
        const geoState = field === 'start' ? startGeoState : targetGeoState;
        if (!geoState.point) return;

        const fallback = field === 'start' ? 'Gesetzter Startpunkt' : 'Gesetzter Zielpunkt';
        const setLabel = field === 'start' ? setStartLabel : setTargetLabel;

        resolvePointLabel(field, geoState.point, fallback).then(setLabel);
    }, [startGeoState, targetGeoState, resolvePointLabel]);

    // Stops continuous location tracking when the page is left.
    const stopLocationWatch = useCallback(() => {
        if (watchIdRef.current != null && navigator.geolocation) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }

        setIsWatchingLocation(false);
        setIsLocating(false);
    }, []);

    // Starts continuous location tracking and updates the live location marker.
    const startLocationWatch = useCallback(() => {
        if (!navigator.geolocation) {
            setIsInitializing(false);
            setIsLocating(false);
            setIsWatchingLocation(false);
            setStartMode('manual');
            setSelectionMode('start');

            setNotification({
                type: 'danger',
                title: 'Standort nicht verfügbar',
                message: 'Standort wird von diesem Gerät nicht unterstützt.'
            });

            return;
        }

        if (watchIdRef.current != null) {
            return;
        }

        setIsLocating(true);
        setIsWatchingLocation(true);
        shouldFocusOnNextFixRef.current = true;

        // watchPosition keeps listening for location updates after the first fix.
        watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
                const point = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: position.timestamp,
                    heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
                };

                const isFirstFix = !hasLocationFixRef.current;

                setCurrentLocation(point);
                setIsInitializing(false);
                setIsLocating(false);
                setIsWatchingLocation(true);


                // Keep startPoint stable unless the user moved noticeably (avoids constant rerouting).
                if (startModeRef.current === 'current' && !isNavigatingRef.current) {
                    setStartPoint((prev) => {
                        if (!prev) return point;
                        if (distanceBetweenMeters(prev, point) < ROUTE_START_UPDATE_MIN_METERS) {
                            return prev;
                        }
                        return point;
                    });
                }

                // Focus the map only once, so GPS updates do not constantly move the map.
                if (shouldFocusOnNextFixRef.current) {
                    setMapFocus({
                        point,
                        zoom: 16,
                        version: Date.now()
                    });

                    shouldFocusOnNextFixRef.current = false;
                }

                if (isFirstFix) {
                    hasLocationFixRef.current = true;

                    resolvePointLabel('start', point, 'Aktueller Standort').then((label) => {
                        if (startModeRef.current == 'current')
                            setStartLabel(label);
                    });

                    setNotification({
                        type: 'success',
                        title: 'Standort gefunden',
                        message: 'Dein Standort wird automatisch aktualisiert.',
                        autoCloseMs: 2000,
                    });
                }
            },
            () => {
                setIsInitializing(false);
                setIsLocating(false);

                if (!hasLocationFixRef.current) {
                    if (watchIdRef.current != null) {
                        navigator.geolocation.clearWatch(watchIdRef.current);
                        watchIdRef.current = null;
                    }

                    setIsWatchingLocation(false);
                    setStartMode('manual');
                    setSelectionMode('start');
                    setNotification({
                        type: 'danger',
                        title: 'Standort nicht verfügbar',
                        message: 'Standort konnte nicht gefunden werden. Du kannst den Startpunkt manuell setzen.',
                        actionText: 'Erneut versuchen',
                        onAction: () => {
                            closeNotification();
                            setIsInitializing(true);
                            startLocationWatchRef.current?.();
                        },
                    });

                    return;
                }
                
                setNotification({
                    type: 'warning',
                    title: 'Standortupdate fehlgeschlagen',
                    message: 'Der letzte bekannte Standort bleibt sichtbar.',
                    autoCloseMs: 3000
                });
            }, 
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0,
            }
        )
    }, [closeNotification, resolvePointLabel]);

    // Enables map click mode for selecting a custom start point.
    const activateManualStartSelection = useCallback(() => {
        cancelSearch();
        setSelectionMode('start');
        setNotification({
            type: 'info',
            title: 'Startpunkt wählen',
            message: 'Tippe auf die Karte, um deinen Startpunkt zu setzen.',
            autoCloseMs: 3000,
        })
    }, [cancelSearch]);

    // Enables map click mode for selecting a target point.
    const activateManualTargetSelection = useCallback(() => {
        if (!startPoint) {
             setNotification({
                type: 'warning',
                title: 'Startpunkt fehlt',
                message: 'Bitte setze zuerst einen Startpunkt.',
                autoCloseMs: 3000,
            });
            return;
        }

        cancelSearch();
        setActiveSearchField(null);
        setSelectionMode('target');
    
        setNotification({
            type: 'info',
            title: 'Zielpunkt wählen',
            message: 'Tippe auf die Karte, um deinen Zielpunkt zu setzen.',
            autoCloseMs: 3000,
        });
    }, [startPoint, cancelSearch]);

    const suppressRouteFitForAWhile = useCallback(() => {
        setSuppressRouteFit(true);
        window.setTimeout(() => {
            setSuppressRouteFit(false);
        }, 2500);
    }, []);

    const triggerTargetWorkflow = useCallback(async (point, skipGeocoding = false, presetLabel = '') => {
        if (activeWorkflowControllerRef.current) {
            activeWorkflowControllerRef.current.abort();
        }

        const controller = new AbortController();
        activeWorkflowControllerRef.current = controller;

        setTargetPoint(point);
        setIsWikiCardOpen(true);
        setWikiInfo(undefined);
        setWikiError('');

        let resolvedLabel = presetLabel;

        try {
            if (!skipGeocoding) {
                setInfoFlowState('geocoding');
                setTargetLabel('Zielpunkt wird ermittelt...');
                setTargetGeoState({ loading: true, error: false, point });

                const place = await reversePlace(point, { signal: controller.signal });
                resolvedLabel = place.label || 'Gesetzter Zielpunkt';
                setTargetLabel(resolvedLabel);
                setTargetGeoState({ loading: false, error: false, point: null });
            } else {
                setTargetGeoState({ loading: false, error: false, point: null });
                if (presetLabel) {
                    setTargetLabel(presetLabel);
                }
            }

            setInfoFlowState('wiki_loading');
            
            const info = await fetchWikipediaInfo(point.lat, point.lng, { signal: controller.signal });
            setWikiInfo(info);
            setInfoFlowState('success');
        } catch (error) {
            if (error.name === 'AbortError') return;

            console.error('Target workflow error:', error);
            
            if (!skipGeocoding && !resolvedLabel) {
                setTargetGeoState({ loading: false, error: true, point });
                setInfoFlowState('error_geocoding');
            } else {
                setWikiError(error.message || 'Wikipedia-Informationen konnten nicht geladen werden.');
                setInfoFlowState('error_wikipedia');
            }
        }
    }, []);

    const setTargetFromPlace = useCallback((point, label, { openWiki = false } = {}) => {
        if (activeWorkflowControllerRef.current) {
            activeWorkflowControllerRef.current.abort();
        }

        setTargetPoint(point);
        setTargetLabel(label);
        setTargetSearch('');
        setTargetGeoState({ loading: false, error: false, point: null });
        setSelectionMode('none');
        setActiveSearchField(null);
        setSearchResults([]);
        setSearchError('');

        if (openWiki) {
            triggerTargetWorkflow(point, true, label);
        } else {
            setIsWikiCardOpen(false);
            setWikiInfo(undefined);
            setWikiError('');
            setInfoFlowState('idle');
        }

        setMapFocus({ point, zoom: 16, version: Date.now() });
        suppressRouteFitForAWhile();
    }, [triggerTargetWorkflow, suppressRouteFitForAWhile]);

    const handleWorkflowRetry = useCallback(() => {
        if (!targetPoint) return;
        const skipGeocoding = infoFlowState === 'error_wikipedia';
        triggerTargetWorkflow(targetPoint, skipGeocoding);
    }, [targetPoint, infoFlowState, triggerTargetWorkflow]);

    // Handles map clicks depending on the active selection mode.
    const handleMapClick = useCallback((point) => {
        if (activeSearchField && selectionMode == 'none') {
            cancelSearch();
            return;
        }

        if (!point || typeof point.lat != 'number' || typeof point.lng != 'number'){
            setNotification({
                type: 'danger',
                title: 'Ungültige Position',
                message: 'Der gewählte Punkt konnte nicht verarbeitet werden.',
                autoCloseMs: 3000,
            });
            return;
        }


        if (selectionMode == 'start') {
            startModeRef.current = 'manual';

            setStartMode('manual');
            setStartPoint(point);
            setStartLabel('Startpunkt wird ermittelt...');
            setStartSearch('');
            setSelectionMode('none');

            setMapFocus({
                point: point,
                zoom: 16,
                version: Date.now()
            });

            resolvePointLabel('start', point, 'Gesetzter Startpunkt').then((label) => {
                setStartLabel(label);
            });

            setNotification({
                type: 'success',
                title: 'Startpunkt gesetzt',
                message: 'Der manuelle Startpunkt wurde übernommen.',
                autoCloseMs: 2000,
            });
            return;
        }

        if (selectionMode == "target") {
            triggerTargetWorkflow(point, false);
            setSelectionMode('none');
            setTargetSearch('');
            suppressRouteFitForAWhile();

            setMapFocus({
                point: point,
                zoom: 16,
                version: Date.now()
            });

            setNotification({
                type: 'success',
                title: 'Zielpunkt gesetzt',
                message: 'Der Zielpunkt wurde übernommen.',
                autoCloseMs: 2000,
            });
        }
    }, [selectionMode]);

    const handleStartSearchFocus = () => {
        setActiveSearchField('start');
        setSelectionMode('none');
        setSearchError('');
        setSearchResults([]);
    };

    const handleTargetSearchFocus = () => {
        if (!startPoint) {
             setNotification({
                type: 'info',
                title: 'Startpunkt fehlt',
                message: 'Bitte setze zuerst einen Startpunkt.',
                autoCloseMs: 3000,
            });
            return;
        }

        setActiveSearchField('target');
        setSelectionMode('none');
        setSearchError('');
        setSearchResults([]);
    };

    const selectSearchResult = useCallback((place) => {
        const point = {
            lat: place.lat,
            lng: place.lng
        }

        if (activeSearchField == 'start') {
            startModeRef.current = 'manual';

            setStartMode('manual');
            setStartPoint(point);
            setStartLabel(place.label);
            setStartSearch('');
            setStartGeoState({ loading: false, error: false, point: null });

            setNotification({
                type: 'success',
                title: 'Startpunkt gesetzt',
                message: 'Der ausgewählte Ort wurde als Startpunkt übernommen.',
                autoCloseMs: 2000,
            });
        }

        if (activeSearchField == 'target') {
            setTargetFromPlace(point, place.label || place.title || 'Zielpunkt');

            setNotification({
                type: 'success',
                title: 'Zielpunkt gesetzt',
                message: 'Der ausgewählte Ort wurde als Zielpunkt übernommen.',
                autoCloseMs: 2000,
            });
            return;
        }

        setSelectionMode('none');
        setActiveSearchField(null);
        setSearchResults([]);
        setSearchError('');

        setMapFocus({
            point,
            zoom: 16,
            version: Date.now(),
        });
    }, [activeSearchField, setTargetFromPlace])

    const formatPoint = (point) => {
        if (!point) return '';

        return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
    };

    const getStartInputValue = () => {
        if (activeSearchField == 'start')
            return startSearch;

        if (startLabel)
            return startLabel;

        if (startPoint && startMode == 'current')
            return 'Aktueller Standort';

        if (startPoint) 
            return 'Startpunkt gesetzt';

        return '';
    };

    const getTargetInputValue = () => {
        if (activeSearchField == 'target')
            return targetSearch;

        if (targetLabel) 
            return targetLabel;

        if (targetPoint) 
            return 'Zielpunkt gesetzt';

        return '';
    };
    
    useEffect(() => {
        startModeRef.current = startMode;
    }, [startMode]);

    useEffect(() => {
        startLocationWatchRef.current = startLocationWatch;
    }, [startLocationWatch]);

    useEffect(() => {
        startLocationWatch();

        return () => {
            stopLocationWatch();
        }
    }, [startLocationWatch, stopLocationWatch]);

    // Debounces search input and cancels outdated requests.
    useEffect(() => {
        let query;
        if (activeSearchField === 'start') query = startSearch.trim();
        else if (activeSearchField === 'target') query = targetSearch.trim();
        else if (activeSearchField?.startsWith('waypoint-')) {
            const wpId = parseInt(activeSearchField.split('-')[1]);
            const wp = waypoints.find(w => w.id === wpId);
            query = wp?.label?.trim() || '';
        } else {
            query = '';
        }

        if (!activeSearchField || query.length < 2) {
            setSearchResults([]);
            setSearchError('');
            setIsSearching(false);
            return;
        }

        // Used to cancel the previous request when the user keeps typing.
        const controller = new AbortController();

        const timeoutId = window.setTimeout(async () => {
            try {
                setIsSearching(true);
                setSearchError('');

                const results = await searchPlaces(query, {
                    signal: controller.signal,
                    lat: currentLocation?.lat,
                    lng: currentLocation?.lng
                });

                setSearchResults(results);

                if (results.length == 0) {
                    setSearchError('Keine passende Orte gefunden.');
                }
            }
            catch (error) {
                if (error.name == 'AbortError') {
                    return;
                }

                setSearchResults([]);
                setSearchError('Ortssuche konnt nicht ausgeführt werden');
            }
            finally {
                if (!controller.signal.aborted) {
                    setIsSearching(false);
                }
            }
        }, 500);

        return () => {
            window.clearTimeout(timeoutId);
            controller.abort();
        }
    }, [activeSearchField, startSearch, targetSearch, waypoints]);

    useEffect(() => {
        return () => {
            if (activeWorkflowControllerRef.current) {
                activeWorkflowControllerRef.current.abort();
            }
        };
    }, []);

    useEffect(() => {
        isNavigatingRef.current = isNavigating;
    }, [isNavigating]);

    // Automatically calculates the route when both points, waypoints or transport mode change.
    useEffect(() => {
        if (isNavigating) return;

        if (!startPoint || !targetPoint) {
            setRouteData(null);
            setRouteAlternatives([]);
            setRouteAlerts([]);
            setRouteError('');
            setIsRouteLoading(false);
            setIsAlertsLoading(false);
            setDestinationWeather(null);
            setWeatherError('');
            setIsWeatherLoading(false);
            return;
        }

        const controller = new AbortController();
        setIsRouteLoading(true);
        setRouteError('');
        setRouteAlerts([]);

        const waypointCoords = waypoints.map(wp => wp.point).filter(Boolean);

        calculateRoute(startPoint, targetPoint, {
            signal: controller.signal,
            profile: transportMode,
            waypoints: waypointCoords,
            routePreference: transportMode === 'driving' ? routePreference : 'fastest',
        })
            .then(async (data) => {
                setRouteAlternatives(data.routes || [data]);
                setSelectedRouteIndex(data.selectedIndex ?? 0);
                setRouteData(data);
                setIsRouteLoading(false);
                setCurrentStepIndex(0);

                setIsAlertsLoading(true);
                try {
                    const alerts = await fetchRouteAlerts(data.geometry, { signal: controller.signal });
                    if (!controller.signal.aborted) {
                        setRouteAlerts(alerts);
                    }
                } catch (alertError) {
                    if (alertError.name !== 'AbortError') {
                        console.warn('Route alerts error:', alertError);
                    }
                } finally {
                    if (!controller.signal.aborted) {
                        setIsAlertsLoading(false);
                    }
                }
            })
            .catch((error) => {
                if (error.name === 'AbortError') return;

                console.error('Error calculating route:', error);
                setRouteError(error.message || 'Route konnte nicht berechnet werden.');
                setIsRouteLoading(false);
                setIsAlertsLoading(false);
                setRouteData(null);
                setRouteAlternatives([]);
            });

        return () => {
            controller.abort();
        };
    }, [isNavigating, startPoint, targetPoint, transportMode, waypoints, routePreference]);

    useEffect(() => {
        if (!targetPoint || !routeData?.duration) {
            setDestinationWeather(null);
            setWeatherError('');
            setIsWeatherLoading(false);
            return;
        }

        const controller = new AbortController();
        setIsWeatherLoading(true);
        setWeatherError('');

        fetchDestinationWeather(targetPoint, {
            signal: controller.signal,
            routeDurationSeconds: routeData.duration,
        })
            .then((weather) => {
                if (!controller.signal.aborted) {
                    setDestinationWeather(weather);
                }
            })
            .catch((error) => {
                if (error.name === 'AbortError') return;
                console.warn('Weather fetch error:', error);
                setDestinationWeather(null);
                setWeatherError(error.message || 'Wetter konnte nicht geladen werden.');
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsWeatherLoading(false);
                }
            });

        return () => controller.abort();
    }, [targetPoint, routeData?.duration]);

    const handleSelectRoute = useCallback((index) => {
        const selected = routeAlternatives[index];
        if (!selected) return;

        setSelectedRouteIndex(index);
        setRouteData({ ...selected, routes: routeAlternatives, selectedIndex: index });
        setCurrentStepIndex(0);
        setIsNavigating(false);

        setIsAlertsLoading(true);
        fetchRouteAlerts(selected.geometry)
            .then((alerts) => setRouteAlerts(alerts))
            .catch((error) => console.warn('Route alerts error:', error))
            .finally(() => setIsAlertsLoading(false));
    }, [routeAlternatives]);

    // GPS-based step advancement during navigation.
    useEffect(() => {
        if (!isNavigating || !routeData?.steps || !currentLocation) return;

        const steps = routeData.steps;
        let closestIdx = currentStepIndex;
        let closestDist = Infinity;

        for (let i = currentStepIndex; i < steps.length; i++) {
            const loc = steps[i].maneuverLocation;
            if (!loc) continue;
            const d = Math.sqrt(
                Math.pow((currentLocation.lat - loc.lat) * 111320, 2) +
                Math.pow((currentLocation.lng - loc.lng) * 111320 * Math.cos(currentLocation.lat * Math.PI / 180), 2)
            );
            if (d < closestDist) { closestDist = d; closestIdx = i; }
        }

        if (closestDist < 30 && closestIdx > currentStepIndex) {
            setCurrentStepIndex(closestIdx);
        }
    }, [isNavigating, currentLocation, routeData, currentStepIndex]);

    const startNavigation = useCallback(() => {
        if (!routeData?.steps?.length) return;
        setIsNavigating(true);
        setIsMapFollowing(true);
        setCurrentStepIndex(0);
        if (currentLocation) {
            setMapFocus({ point: currentLocation, zoom: 17, version: Date.now() });
        }
    }, [routeData, currentLocation]);

    const stopNavigation = useCallback(() => {
        setIsNavigating(false);
        setIsMapFollowing(false);
        setCurrentStepIndex(0);
    }, []);

    const clearRoute = useCallback(() => {
        setIsNavigating(false);
        setIsMapFollowing(false);
        setCurrentStepIndex(0);
        setRouteData(null);
        setRouteAlternatives([]);
        setRouteAlerts([]);
        setSelectedRouteIndex(0);
        setIsAlertsLoading(false);
        setRouteError('');
        setTargetPoint(null);
        setTargetLabel('');
        setWaypoints([]);
        setDestinationWeather(null);
        setWeatherError('');
        setIsWeatherLoading(false);
        setIsWikiCardOpen(false);
        setWikiInfo(undefined);
        setWikiError('');
        setInfoFlowState('idle');
        if (activeWorkflowControllerRef.current) {
            activeWorkflowControllerRef.current.abort();
        }
    }, []);

    const addWaypoint = useCallback(() => {
        setWaypoints(prev => [...prev, { id: Date.now(), point: null, label: '' }]);
    }, []);

    const removeWaypoint = useCallback((id) => {
        setWaypoints(prev => prev.filter(wp => wp.id !== id));
    }, []);

    const moveWaypoint = useCallback((id, direction) => {
        setWaypoints(prev => {
            const idx = prev.findIndex(wp => wp.id === id);
            if (idx < 0) return prev;
            const newIdx = idx + direction;
            if (newIdx < 0 || newIdx >= prev.length) return prev;
            const copy = [...prev];
            [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
            return copy;
        });
    }, []);

    const setWaypointFromSearch = useCallback((waypointId, place) => {
        const point = { lat: place.lat, lng: place.lng };
        setWaypoints(prev => prev.map(wp =>
            wp.id === waypointId ? { ...wp, point, label: place.label } : wp
        ));
        setMapFocus({ point, zoom: 16, version: Date.now() });
    }, []);

    const recenterMap = useCallback(() => {
        if (!currentLocation) return;
        setIsMapFollowing(true);
        setMapFocus({ point: currentLocation, zoom: 17, version: Date.now() });
    }, [currentLocation]);

    const handleMapFollowLost = useCallback(() => {
        setIsMapFollowing(false);
    }, []);

    const applyHomeAsTarget = useCallback((home) => {
        if (!home?.point) return false;

        const effectiveStart = startPoint ?? currentLocation;
        if (!effectiveStart) return false;

        cancelSearch();
        setSelectionMode('none');
        setActiveSearchField(null);
        if (activeWorkflowControllerRef.current) {
            activeWorkflowControllerRef.current.abort();
        }
        setIsWikiCardOpen(false);
        setWikiInfo(undefined);
        setWikiError('');
        setInfoFlowState('idle');
        setTargetPoint(home.point);
        setTargetLabel(home.label);
        setTargetSearch('');
        setTargetGeoState({ loading: false, error: false, point: null });
        setMapFocus({ point: home.point, zoom: 16, version: Date.now() });
        suppressRouteFitForAWhile();
        return true;
    }, [cancelSearch, startPoint, currentLocation, suppressRouteFitForAWhile]);

    const handleUseHomeAsTarget = useCallback(() => {
        if (!homeAddress) return;

        if (!applyHomeAsTarget(homeAddress)) {
            setNotification({
                type: 'warning',
                title: 'Startpunkt fehlt',
                message: 'Bitte setze zuerst einen Startpunkt.',
                autoCloseMs: 3000,
            });
            return;
        }

        setNotification({
            type: 'success',
            title: 'Heimatadresse',
            message: 'Die Heimatadresse wurde als Ziel gesetzt.',
            autoCloseMs: 2500,
        });
    }, [homeAddress, applyHomeAsTarget]);

    const handleSaveHomeFromTarget = useCallback(() => {
        if (!targetPoint) {
            setNotification({
                type: 'warning',
                title: 'Kein Zielpunkt',
                message: 'Bitte setze zuerst ein Ziel.',
                autoCloseMs: 3000,
            });
            return;
        }

        const label = targetLabel || 'Zielpunkt';
        const home = setHomeAddress({ label, point: targetPoint });
        setHomeAddressState(home);
        setNotification({
            type: 'success',
            title: 'Heimatadresse gespeichert',
            message: home.label,
            autoCloseMs: 3000,
        });
    }, [targetPoint, targetLabel]);

    const handleSaveHomeFromLocation = useCallback(async () => {
        if (!currentLocation) {
            setNotification({
                type: 'warning',
                title: 'Standort nicht verfügbar',
                message: 'Dein GPS-Standort konnte nicht ermittelt werden.',
                autoCloseMs: 3500,
            });
            return;
        }

        try {
            const place = await reversePlace(currentLocation);
            const home = setHomeAddress({
                label: place.label || 'Mein Standort',
                point: currentLocation,
            });
            setHomeAddressState(home);
            setNotification({
                type: 'success',
                title: 'Heimatadresse gespeichert',
                message: home.label,
                autoCloseMs: 3000,
            });
        } catch (error) {
            setNotification({
                type: 'danger',
                title: 'Speichern fehlgeschlagen',
                message: error.message || 'Adresse konnte nicht ermittelt werden.',
                autoCloseMs: 4000,
            });
        }
    }, [currentLocation]);

    const handleSaveHomeFromPlace = useCallback((place) => {
        const home = setHomeAddress({
            label: place.label || place.title,
            point: { lat: place.lat, lng: place.lng },
        });
        setHomeAddressState(home);
        setNotification({
            type: 'success',
            title: 'Heimatadresse gespeichert',
            message: home.label,
            autoCloseMs: 3000,
        });
    }, []);

    const handleClearHome = useCallback(() => {
        clearHomeAddress();
        setHomeAddressState(null);
        setNotification({
            type: 'info',
            title: 'Heimatadresse entfernt',
            message: 'Die gespeicherte Heimatadresse wurde gelöscht.',
            autoCloseMs: 2500,
        });
    }, []);

    const buildRouteSnapshot = useCallback((name) => {
        const startLabelSnapshot = startModeRef.current === 'current'
            ? 'Aktueller Standort'
            : (startLabel || 'Startpunkt');
        const targetLabelSnapshot = targetLabel || 'Zielpunkt';

        return {
            name: name.trim(),
            startMode: startModeRef.current,
            start: startModeRef.current === 'manual' && startPoint
                ? { point: startPoint, label: startLabelSnapshot }
                : null,
            startLabel: startLabelSnapshot,
            target: { point: targetPoint, label: targetLabelSnapshot },
            targetLabel: targetLabelSnapshot,
            waypoints: waypoints
                .filter((wp) => wp.point)
                .map((wp) => ({ point: wp.point, label: wp.label || '' })),
            transportMode,
            routePreference,
        };
    }, [startPoint, startLabel, targetPoint, targetLabel, waypoints, transportMode, routePreference]);

    const handleSaveRoute = useCallback((name) => {
        if (!startPoint || !targetPoint) {
            setNotification({
                type: 'warning',
                title: 'Route unvollständig',
                message: 'Start und Ziel müssen gesetzt sein.',
                autoCloseMs: 3000,
            });
            return;
        }

        const snapshot = buildRouteSnapshot(name);
        const saved = saveRoute(snapshot);
        setSavedRoutesState(getSavedRoutes());
        setNotification({
            type: 'success',
            title: 'Route gespeichert',
            message: saved.name,
            autoCloseMs: 3000,
        });
    }, [startPoint, targetPoint, buildRouteSnapshot]);

    const handleLoadSavedRoute = useCallback((saved) => {
        if (!saved?.target?.point) return;

        cancelSearch();
        setSelectionMode('none');
        setActiveSearchField(null);
        setIsNavigating(false);
        setCurrentStepIndex(0);
        setRouteData(null);
        setRouteAlternatives([]);
        setRouteAlerts([]);
        setSelectedRouteIndex(0);
        setRouteError('');
        setIsWikiCardOpen(false);
        setWikiInfo(undefined);
        setWikiError('');
        setInfoFlowState('idle');
        if (activeWorkflowControllerRef.current) {
            activeWorkflowControllerRef.current.abort();
        }

        if (saved.startMode === 'current') {
            startModeRef.current = 'current';
            setStartMode('current');
            setStartLabel('');
            setStartPoint(currentLocation || saved.start?.point || null);
        } else if (saved.start?.point) {
            startModeRef.current = 'manual';
            setStartMode('manual');
            setStartPoint(saved.start.point);
            setStartLabel(saved.start.label || saved.startLabel || '');
        }

        setTargetPoint(saved.target.point);
        setTargetLabel(saved.target.label || saved.targetLabel || '');
        setTargetSearch('');
        setTargetGeoState({ loading: false, error: false, point: null });
        setWaypoints((saved.waypoints || []).map((wp, index) => ({
            id: Date.now() + index,
            point: wp.point,
            label: wp.label || '',
        })));
        setTransportMode(saved.transportMode || 'driving');
        setRoutePreference(normalizeRoutePreference(saved.routePreference));

        const points = [
            saved.startMode === 'manual' ? saved.start?.point : (currentLocation || saved.start?.point),
            ...(saved.waypoints || []).map((wp) => wp.point),
            saved.target.point,
        ].filter(Boolean);

        if (points.length > 0) {
            const center = points.reduce(
                (acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }),
                { lat: 0, lng: 0 }
            );
            setMapFocus({
                point: { lat: center.lat / points.length, lng: center.lng / points.length },
                zoom: points.length > 1 ? 12 : 14,
                version: Date.now(),
            });
        }

        setNotification({
            type: 'success',
            title: 'Route geladen',
            message: saved.name,
            autoCloseMs: 2500,
        });
    }, [cancelSearch, currentLocation]);

    const handleDeleteSavedRoute = useCallback((id) => {
        setSavedRoutesState(deleteSavedRoute(id));
    }, []);

    const handleMapBoundsChange = useCallback((bounds) => {
        setMapBounds(bounds);
    }, []);

    const loadPOIs = useCallback(async (category, center, { notifyEmpty = false } = {}) => {
        if (!category || !center) return;

        const centerKey = `${center.lat.toFixed(3)},${center.lng.toFixed(3)}`;
        const cache = poiCacheRef.current;
        if (cache?.category === category && cache?.centerKey === centerKey) {
            setPOIMarkers(cache.pois);
            return;
        }

        if (poiFetchAbortRef.current) {
            poiFetchAbortRef.current.abort();
        }
        const controller = new AbortController();
        poiFetchAbortRef.current = controller;

        setIsPOILoading(true);

        const fetchBounds = boundsFromCenterKm(center, POI_SEARCH_RADIUS_KM);

        try {
            const pois = await fetchPOIs(fetchBounds, category, { signal: controller.signal });
            if (controller.signal.aborted) return;

            const nearby = filterPoisByRadius(pois, center, POI_SEARCH_RADIUS_KM);
            poiCacheRef.current = { category, centerKey, pois: nearby };
            setPOIMarkers(nearby);

            if (notifyEmpty && nearby.length === 0) {
                setNotification({
                    type: 'info',
                    title: POI_CATEGORIES[category]?.label || 'POIs',
                    message: `Im Umkreis von ${POI_SEARCH_RADIUS_KM} km wurden keine Einträge gefunden.`,
                    autoCloseMs: 3500,
                });
            }
        } catch (error) {
            if (error.name === 'AbortError') return;

            console.error('POI fetch error:', error);
            setPOIMarkers([]);
            if (notifyEmpty) {
                setActivePOICategory(null);
                poiCacheRef.current = null;
                setNotification({
                    type: 'warning',
                    title: 'POI-Suche fehlgeschlagen',
                    message: error.message || 'Orte konnten nicht geladen werden.',
                    autoCloseMs: 4000,
                });
            }
        } finally {
            if (!controller.signal.aborted) {
                setIsPOILoading(false);
            }
        }
    }, []);

    // Load POIs within 20 km when a category is selected.
    useEffect(() => {
        if (!activePOICategory) return;

        const center = currentLocation || startPoint;
        if (!center) {
            setNotification({
                type: 'warning',
                title: 'Standort nicht verfügbar',
                message: 'Für die Umkreissuche wird dein Standort benötigt.',
                autoCloseMs: 4000,
            });
            setActivePOICategory(null);
            return;
        }

        loadPOIs(activePOICategory, center, { notifyEmpty: poiNotifyEmptyRef.current });
        poiNotifyEmptyRef.current = false;
        // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once per category selection, not on every GPS tick
    }, [activePOICategory, loadPOIs]);

    const togglePOICategory = useCallback((category) => {
        if (activePOICategory === category) {
            if (poiFetchAbortRef.current) {
                poiFetchAbortRef.current.abort();
            }
            setActivePOICategory(null);
            setPOIMarkers([]);
            poiCacheRef.current = null;
            setIsPOILoading(false);
            return;
        }

        poiCacheRef.current = null;
        poiNotifyEmptyRef.current = true;
        setActivePOICategory(category);
    }, [activePOICategory]);

    const handlePOISelect = useCallback((poi) => {
        if (!poi?.lat || !poi?.lng) return;

        cancelSearch();
        setSelectionMode('none');

        const start = startPoint ?? (startModeRef.current === 'current' ? currentLocation : null);
        if (!start) {
            setNotification({
                type: 'warning',
                title: 'Kein Startpunkt',
                message: 'Bitte lege zuerst einen Startpunkt fest oder aktiviere deinen Standort.',
                autoCloseMs: 4000,
            });
            return;
        }

        if (!startPoint) {
            setStartPoint(start);
        }

        const point = { lat: poi.lat, lng: poi.lng };
        const label = poi.name || poi.address || 'Ziel';

        setTargetSearch(label);
        setMapFocus({ point, zoom: 17, version: Date.now() });
        triggerTargetWorkflow(point, true, label);
    }, [startPoint, currentLocation, cancelSearch, triggerTargetWorkflow]);

    const swapStartTarget = useCallback(() => {
        if (!startPoint || !targetPoint) return;
        const prevStart = startPoint;
        const prevStartLabel = startLabel;
        const prevTarget = targetPoint;
        const prevTargetLabel = targetLabel;

        startModeRef.current = 'manual';
        setStartMode('manual');
        setStartPoint(prevTarget);
        setStartLabel(prevTargetLabel || 'Startpunkt');
        setTargetPoint(prevStart);
        setTargetLabel(prevStartLabel || 'Zielpunkt');
    }, [startPoint, targetPoint, startLabel, targetLabel]);

    // Closes the search panel when the user clicks outside the route bar.
    useEffect(() => {
        const handleDocumentPointerDown = (event) => {
            if (!activeSearchField) return;

            const target = event.target;

            if (!(target instanceof Element)) return;

            // Clicks inside the route bar should keep the search panel open.
            if (target.closest('.search-stack')) return;

            cancelSearch();
        };

        document.addEventListener('pointerdown', handleDocumentPointerDown, true);

        return () => {
            document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
        };
    }, [activeSearchField, cancelSearch]);

    if (isInitializing) {
        return (
            <Page name='landing' className='landing-page'>
                <div className='loading'>
                    <div className='loading-circle'></div>
                    <div className='loading-title'>Standort wird ermittelt...</div>
                    <div className='loading-text'>Bitte warten Sie einen moment.</div>
                </div>
            </Page>
        )
    }

    return (
        <Page name='landing' className='landing-page'>
             <Map currentLocation={currentLocation}
                  startPoint={startPoint}
                  targetPoint={targetPoint}
                  startMode={startMode}
                  mapFocus={mapFocus}
                  onMapClick={handleMapClick}
                  routeData={routeData}
                  suppressRouteFit={suppressRouteFit}
                  routeAlternatives={routeAlternatives}
                  selectedRouteIndex={selectedRouteIndex}
                  routeAlerts={routeAlerts}
                  isNavigating={isNavigating}
                  isMapFollowing={isMapFollowing}
                  onMapFollowLost={handleMapFollowLost}
                  waypoints={waypoints}
                  poiMarkers={poiMarkers}
                  onBoundsChange={handleMapBoundsChange}
                  onPOISelect={handlePOISelect}/>

             {notification && (
                <AppNotification type={notification.type}
                                 title={notification.title}
                                 message={notification.message}
                                 actionText={notification.actionText}
                                 onAction={notification.onAction}
                                 autoCloseMs={notification.autoCloseMs}
                                 onClose={closeNotification}
                                 />
            )}

            {isNavigating && routeData?.steps?.[currentStepIndex] && (
                <div className='nav-hud'>
                    <div className='nav-hud-main'>
                        <span className='nav-hud-icon'>{routeData.steps[currentStepIndex].icon}</span>
                        <div className='nav-hud-info'>
                            <span className='nav-hud-distance'>
                                {routeData.steps[currentStepIndex].distance >= 1000
                                    ? `In ${(routeData.steps[currentStepIndex].distance / 1000).toFixed(1)} km`
                                    : `In ${Math.round(routeData.steps[currentStepIndex].distance)} m`}
                            </span>
                            <span className='nav-hud-instruction'>{routeData.steps[currentStepIndex].instruction}</span>
                        </div>
                        <button
                            className='nav-hud-exit'
                            type='button'
                            onClick={stopNavigation}
                            aria-label='Navigation beenden'
                        >
                            <svg viewBox='0 0 24 24' width='20' height='20' aria-hidden='true'>
                                <path fill='currentColor' d='M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'/>
                            </svg>
                        </button>
                    </div>
                    {routeData.steps[currentStepIndex + 1] && (
                        <div className='nav-hud-next'>
                            <span className='nav-hud-next-label'>Danach</span>
                            <span className='nav-hud-next-icon'>{routeData.steps[currentStepIndex + 1].icon}</span>
                            <span className='nav-hud-next-text'>{routeData.steps[currentStepIndex + 1].instruction}</span>
                        </div>
                    )}
                </div>
            )}

            {isNavigating && !isMapFollowing && (
                <button
                    className='nav-recenter-fab'
                    type='button'
                    onClick={recenterMap}
                    aria-label='Karte auf Standort zentrieren'
                >
                    <svg className='nav-recenter-fab-icon' viewBox='0 0 24 24' width='22' height='22' aria-hidden='true'>
                        <path fill='currentColor' d='M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71L12 2z'/>
                    </svg>
                    Zentrieren
                </button>
            )}

            <div className={`map-ui ${isNavigating ? 'map-ui--navigating' : ''}`}>
                <div className='map-ui-top'>
                    {!isNavigating && (
                        <div className='search-stack'>
                            <div className='route-bar'>
                                <div className='route-bar-main'>
                                <div className='route-bar-rows'>
                                    <div className='route-line'>
                                        <div className='marker-start'></div>
                                        <div className='input-wrapper start'>
                                            <input id='startPoint' className='route-input' type='text'
                                                   autoComplete='off' autoCapitalize='on' placeholder='Startpunkt eingeben...'
                                                   value={getStartInputValue()} onFocus={handleStartSearchFocus} onChange={(event) => {setActiveSearchField('start'); setStartSearch(event.target.value)}}/>
                                            {startGeoState.loading && <span className='geo-loading-indicator'></span>}
                                            {startGeoState.error && (
                                                <button className='geo-retry-button' onClick={() => retryResolveLabel('start')} type='button' title='Erneut versuchen'>↻</button>
                                            )}
                                        </div>
                                    </div>

                                    {waypoints.map((wp, idx) => (
                                        <div key={wp.id} className='route-line waypoint-line'>
                                            <div className='marker-waypoint'>{idx + 1}</div>
                                            <div className='input-wrapper'>
                                                <input className='route-input' type='text'
                                                       autoComplete='off' placeholder={`Zwischenstopp ${idx + 1}...`}
                                                       value={wp.label}
                                                       onFocus={() => { setActiveSearchField(`waypoint-${wp.id}`); setSearchError(''); setSearchResults([]); }}
                                                       onChange={(event) => {
                                                           setActiveSearchField(`waypoint-${wp.id}`);
                                                           setWaypoints(prev => prev.map(w => w.id === wp.id ? { ...w, label: event.target.value } : w));
                                                       }}/>
                                            </div>
                                            <div className='waypoint-actions'>
                                                {idx > 0 && (
                                                    <button className='waypoint-move' type='button' onClick={() => moveWaypoint(wp.id, -1)} aria-label='Nach oben'>▲</button>
                                                )}
                                                {idx < waypoints.length - 1 && (
                                                    <button className='waypoint-move' type='button' onClick={() => moveWaypoint(wp.id, 1)} aria-label='Nach unten'>▼</button>
                                                )}
                                                <button className='waypoint-remove' type='button' onClick={() => removeWaypoint(wp.id)} aria-label='Entfernen'>×</button>
                                            </div>
                                        </div>
                                    ))}

                                    {startPoint && (
                                        <div className='route-line'>
                                            <div className='marker-target'>
                                                <div className='marker-target-dot'></div>
                                            </div>
                                            <div className='input-wrapper'>
                                                <input id='targetPoint' className='route-input' type='text'
                                                       autoComplete='off' autoCapitalize='on' placeholder='Zielpunkt eingeben...'
                                                       value={getTargetInputValue()} onFocus={handleTargetSearchFocus} onChange={(event) => {setActiveSearchField('target'); setTargetSearch(event.target.value)}}/>
                                                {homeAddress && (
                                                    <button
                                                        className='home-target-btn'
                                                        type='button'
                                                        onClick={handleUseHomeAsTarget}
                                                        title='Nach Hause navigieren'
                                                        aria-label='Heimatadresse als Ziel'
                                                    >
                                                        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
                                                    </button>
                                                )}
                                                {targetGeoState.loading && <span className='geo-loading-indicator'></span>}
                                                {targetGeoState.error && (
                                                    <button className='geo-retry-button' onClick={() => retryResolveLabel('target')} type='button' title='Erneut versuchen'>↻</button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className='route-bar-actions'>
                                    {startPoint && targetPoint && (
                                        <button className='route-bar-swap' type='button' onClick={swapStartTarget} aria-label='Start und Ziel tauschen'>
                                            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z"/></svg>
                                        </button>
                                    )}
                                    {startPoint && (
                                        <button className='route-bar-add-stop' type='button' onClick={addWaypoint}>
                                            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                                        </button>
                                    )}
                                    {targetPoint && (
                                        <button className='route-bar-clear' type='button' onClick={clearRoute} aria-label='Route löschen'>
                                            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                                        </button>
                                    )}
                                </div>
                                </div>

                                {activeSearchField && (
                                    <div className='search-panel'>
                                        {isSearching && (
                                            <div className='search-status'>Suche läuft...</div>
                                        )}
                                        {!isSearching && searchError && (
                                            <div className='search-error'>{searchError}</div>
                                        )}
                                        {searchResults.length > 0 && (
                                            <div className='search-results'>
                                                {searchResults.map((place) => (
                                                    <button key={place.id} type='button' className='search-result' onClick={() => {
                                                        if (activeSearchField?.startsWith('waypoint-')) {
                                                            const wpId = parseInt(activeSearchField.split('-')[1]);
                                                            setWaypointFromSearch(wpId, place);
                                                            cancelSearch();
                                                        } else {
                                                            selectSearchResult(place);
                                                        }
                                                    }}>
                                                        <span className='search-result-title'>{place.title}</span>
                                                        {place.subtitle && (
                                                            <span className='search-result-subtitle'>{place.subtitle}</span>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <PoiBar
                                activeCategory={activePOICategory}
                                isLoading={isPOILoading}
                                onSelectCategory={togglePOICategory}
                            />
                        </div>
                    )}
                </div>
                <div className='map-ui-bottom'>
                    <div className='button-area'>
                        {!isNavigating && (
                            <span className='map-action-tooltip-wrap'>
                                <button className='button button-circle button-secondary' type='button' onClick={() => setIsPlannerOpen(true)} aria-label='Routen und Heimatadresse'>
                                    <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/></svg>
                                </button>
                                <span className='map-action-tooltip'>Routen & Heimat</span>
                            </span>
                        )}
                        <span className='map-action-tooltip-wrap'>
                                    {isNavigating ? (
                                        <button
                                            className={`button button-circle map-nav-follow-btn ${isMapFollowing ? 'is-following' : 'needs-recenter'}`}
                                            type='button'
                                            onClick={recenterMap}
                                            aria-label={isMapFollowing ? 'Navigation folgt deinem Standort' : 'Standort zentrieren'}
                                        >
                                            <svg
                                                className='map-nav-arrow-icon'
                                                viewBox='0 0 24 24'
                                                width='24'
                                                height='24'
                                                aria-hidden='true'
                                                style={currentLocation?.heading != null ? { transform: `rotate(${currentLocation.heading}deg)` } : undefined}
                                            >
                                                <path fill='currentColor' d='M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71L12 2z'/>
                                            </svg>
                                        </button>
                                    ) : (
                                        <button className='button button-circle button-secondary' type='button' onClick={recenterMap} aria-label='Standort zentrieren'>
                                            <svg viewBox='0 0 24 24' width='24' height='24'><path fill='currentColor' d='M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z'/></svg>
                                        </button>
                                    )}
                            <span className='map-action-tooltip'>
                                {isNavigating
                                    ? (isMapFollowing ? 'Navigation folgt' : 'Zentrieren')
                                    : 'Mein Standort'}
                            </span>
                        </span>
                        {!isNavigating && (
                            <>
                                <span className='map-action-tooltip-wrap'>
                                    <button id='setStartPointButton' className={`button button-circle button-secondary ${selectionMode == 'start' ? 'active' : ''}`} onClick={activateManualStartSelection} type='button' aria-label='Startpunkt setzen'>
                                        <img className='map-ui-icon' src='/assets/icons/icon-crosshair.svg' alt=''/>
                                    </button>
                                    <span className='map-action-tooltip'>Startpunkt setzen</span>
                                </span>
                                <span className='map-action-tooltip-wrap'>
                                    <button id='setTargetPointButton' className={`button button-circle button-secondary ${selectionMode == 'target' ? 'active' : ''}`} onClick={activateManualTargetSelection} type='button' aria-label='Zielpunkt setzen'>
                                        <img className='map-ui-icon' src='/assets/icons/icon-location-ripple.svg' alt=''/>
                                    </button>
                                    <span className='map-action-tooltip'>Zielpunkt setzen</span>
                                </span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <RoutePlannerSheet
                isOpen={isPlannerOpen}
                onClose={() => setIsPlannerOpen(false)}
                homeAddress={homeAddress}
                savedRoutes={savedRoutes}
                canSaveRoute={Boolean(startPoint && targetPoint)}
                routePreviewLabel={
                    startPoint && targetPoint
                        ? `${startLabel || (startMode === 'current' ? 'Aktueller Standort' : 'Start')} → ${targetLabel || 'Ziel'}`
                        : ''
                }
                onSaveHomeFromTarget={handleSaveHomeFromTarget}
                onSaveHomeFromLocation={handleSaveHomeFromLocation}
                onSaveHomeFromPlace={handleSaveHomeFromPlace}
                onClearHome={handleClearHome}
                onUseHomeAsTarget={handleUseHomeAsTarget}
                onSaveRoute={handleSaveRoute}
                onLoadRoute={handleLoadSavedRoute}
                onDeleteRoute={handleDeleteSavedRoute}
                currentLocation={currentLocation}
            />

            <RoutePanel
                routeData={routeData}
                isRouteLoading={isRouteLoading}
                routeError={routeError}
                transportMode={transportMode}
                onTransportModeChange={setTransportMode}
                routePreference={routePreference}
                onRoutePreferenceChange={setRoutePreference}
                destinationWeather={destinationWeather}
                isWeatherLoading={isWeatherLoading}
                weatherError={weatherError}
                targetLabel={targetLabel}
                routeAlternatives={routeAlternatives}
                selectedRouteIndex={selectedRouteIndex}
                onSelectRoute={handleSelectRoute}
                onStartNavigation={startNavigation}
                isNavigating={isNavigating}
                currentStepIndex={currentStepIndex}
                onStopNavigation={stopNavigation}
                onClearRoute={clearRoute}
                hasTarget={Boolean(targetPoint)}
                wikiInfo={wikiInfo}
                wikiFlowState={infoFlowState}
                wikiError={wikiError}
                isWikiOpen={isWikiCardOpen}
                onWikiRetry={handleWorkflowRetry}
                onWikiClose={() => {
                    setIsWikiCardOpen(false);
                    if (activeWorkflowControllerRef.current) {
                        activeWorkflowControllerRef.current.abort();
                    }
                    setTargetPoint(null);
                    setTargetLabel('');
                    setWikiInfo(undefined);
                    setWikiError('');
                    setInfoFlowState('idle');
                }}
            />
        </Page>
    );
};

export default LandingPage;