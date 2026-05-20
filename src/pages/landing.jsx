import { Page } from 'framework7-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Map from '../components/Map';
import AppNotification from '../components/AppNotification';
import RoutePanel from '../components/RoutePanel';
import { searchPlaces, reversePlace, fetchWikipediaInfo, calculateRoute, fetchPOIs, POI_CATEGORIES } from '../js/services';


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
    const [isRouteLoading, setIsRouteLoading] = useState(false);
    const [routeError, setRouteError] = useState('');
    const [transportMode, setTransportMode] = useState('driving');

    const [isNavigating, setIsNavigating] = useState(false);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);

    const [waypoints, setWaypoints] = useState([]);

    const [activePOICategory, setActivePOICategory] = useState(null);
    const [poiMarkers, setPOIMarkers] = useState([]);
    const [isPOILoading, setIsPOILoading] = useState(false);

    const activeWorkflowControllerRef = useRef(null);

    // Refs keep values available inside async geolocation callbacks.
    const watchIdRef = useRef(null);
    const hasLocationFixRef = useRef(false);
    const shouldFocusOnNextFixRef = useRef(true);
    const startModeRef = useRef(startMode);
    const startLocationWatchRef = useRef(null);

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
                    timestamp: position.timestamp
                };

                const isFirstFix = !hasLocationFixRef.current;

                setCurrentLocation(point);
                setIsInitializing(false);
                setIsLocating(false);
                setIsWatchingLocation(true);


                // The route start follows the live location only while startMode is current.
                if (startModeRef.current == 'current') {
                    setStartPoint(point);
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

    const triggerTargetWorkflow = useCallback(async (point, skipGeocoding = false) => {
        if (activeWorkflowControllerRef.current) {
            activeWorkflowControllerRef.current.abort();
        }

        const controller = new AbortController();
        activeWorkflowControllerRef.current = controller;

        setTargetPoint(point);
        setIsWikiCardOpen(true);
        setWikiInfo(undefined);
        setWikiError('');

        let resolvedLabel = '';

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
            setTargetLabel(place.label);
            triggerTargetWorkflow(point, true);
            setTargetSearch('');
            setTargetGeoState({ loading: false, error: false, point: null });

            setNotification({
                type: 'success',
                title: 'Zielpunkt gesetzt',
                message: 'Der ausgewählte Ort wurde als Zielpunkt übernommen.',
                autoCloseMs: 2000,
            });
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
    }, [activeSearchField])

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

    // Automatically calculates the route when both points, waypoints or transport mode change.
    useEffect(() => {
        if (!startPoint || !targetPoint) {
            setRouteData(null);
            setRouteError('');
            setIsRouteLoading(false);
            return;
        }

        const controller = new AbortController();
        setIsRouteLoading(true);
        setRouteError('');

        const waypointCoords = waypoints.map(wp => wp.point).filter(Boolean);

        calculateRoute(startPoint, targetPoint, {
            signal: controller.signal,
            profile: transportMode,
            waypoints: waypointCoords,
        })
            .then((data) => {
                setRouteData(data);
                setIsRouteLoading(false);
                setCurrentStepIndex(0);
            })
            .catch((error) => {
                if (error.name === 'AbortError') return;

                console.error('Error calculating route:', error);
                setRouteError(error.message || 'Route konnte nicht berechnet werden.');
                setIsRouteLoading(false);
                setRouteData(null);
            });

        return () => {
            controller.abort();
        };
    }, [startPoint, targetPoint, transportMode, waypoints]);

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
        setCurrentStepIndex(0);
        shouldFocusOnNextFixRef.current = true;
    }, [routeData]);

    const stopNavigation = useCallback(() => {
        setIsNavigating(false);
        setCurrentStepIndex(0);
    }, []);

    const clearRoute = useCallback(() => {
        setIsNavigating(false);
        setCurrentStepIndex(0);
        setRouteData(null);
        setRouteError('');
        setTargetPoint(null);
        setTargetLabel('');
        setWaypoints([]);
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
        setMapFocus({ point: currentLocation, zoom: 16, version: Date.now() });
    }, [currentLocation]);

    const mapBoundsRef = useRef(null);

    const handleMapBoundsChange = useCallback((bounds) => {
        mapBoundsRef.current = bounds;
    }, []);

    const togglePOICategory = useCallback(async (category) => {
        if (activePOICategory === category) {
            setActivePOICategory(null);
            setPOIMarkers([]);
            return;
        }

        setActivePOICategory(category);
        setIsPOILoading(true);

        const center = currentLocation || startPoint || { lat: 51.1657, lng: 10.4515 };
        const radius = 0.03;
        const bounds = mapBoundsRef.current || {
            south: center.lat - radius,
            north: center.lat + radius,
            west: center.lng - radius,
            east: center.lng + radius,
        };

        try {
            const pois = await fetchPOIs(bounds, category);
            setPOIMarkers(pois);
            if (pois.length === 0) {
                setNotification({
                    type: 'info',
                    title: POI_CATEGORIES[category]?.label || 'POIs',
                    message: 'In diesem Kartenbereich wurden keine Einträge gefunden. Karte etwas zoomen oder verschieben.',
                    autoCloseMs: 3500,
                });
            }
        } catch (error) {
            console.error('POI fetch error:', error);
            setPOIMarkers([]);
            setActivePOICategory(null);
            setNotification({
                type: 'warning',
                title: 'POI-Suche fehlgeschlagen',
                message: error.message || 'Orte konnten nicht geladen werden.',
                autoCloseMs: 4000,
            });
        } finally {
            setIsPOILoading(false);
        }
    }, [activePOICategory, currentLocation, startPoint]);

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
                  isNavigating={isNavigating}
                  waypoints={waypoints}
                  poiMarkers={poiMarkers}
                  onBoundsChange={handleMapBoundsChange}/>

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

            <div className='map-ui'>
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

                            <div className='poi-bar'>
                                {Object.entries(POI_CATEGORIES).map(([key, cat]) => (
                                    <button key={key} type='button'
                                        className={`poi-chip ${activePOICategory === key ? 'active' : ''}`}
                                        onClick={() => togglePOICategory(key)}
                                        disabled={isPOILoading && activePOICategory !== key}>
                                        <span className='poi-chip-icon'>{cat.icon}</span>
                                        <span className='poi-chip-label'>{cat.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className='map-ui-bottom'>
                    <div className='button-area'>
                        <span className='map-action-tooltip-wrap'>
                            <button className='button button-circle button-secondary' type='button' onClick={recenterMap} aria-label='Standort zentrieren'>
                                <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>
                            </button>
                            <span className='map-action-tooltip'>Mein Standort</span>
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

            <RoutePanel
                routeData={routeData}
                isRouteLoading={isRouteLoading}
                routeError={routeError}
                transportMode={transportMode}
                onTransportModeChange={setTransportMode}
                onStartNavigation={startNavigation}
                isNavigating={isNavigating}
                currentStepIndex={currentStepIndex}
                onStopNavigation={stopNavigation}
                onClearRoute={clearRoute}
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