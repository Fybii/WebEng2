import { Page } from 'framework7-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Map from '../components/Map';
import AppNotification from '../components/AppNotification';
import WikipediaCard from '../components/WikipediaCard';
import { searchPlaces, reversePlace, fetchWikipediaInfo, calculateRoute } from '../js/services';


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
        const query = activeSearchField == 'start' ? startSearch.trim() : targetSearch.trim();

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
    }, [activeSearchField, startSearch, targetSearch]);

    useEffect(() => {
        return () => {
            if (activeWorkflowControllerRef.current) {
                activeWorkflowControllerRef.current.abort();
            }
        };
    }, []);

    // Automatically calculates the route when both startPoint and targetPoint are available
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

        calculateRoute(startPoint, targetPoint, { signal: controller.signal })
            .then((data) => {
                setRouteData(data);
                setIsRouteLoading(false);
                setNotification({
                    type: 'success',
                    title: 'Route berechnet',
                    message: `Route wurde erfolgreich berechnet. Distanz: ${(data.distance / 1000).toFixed(1)} km`,
                    autoCloseMs: 3000
                });
            })
            .catch((error) => {
                if (error.name === 'AbortError') return;

                console.error('Error calculating route:', error);
                setRouteError(error.message || 'Route konnte nicht berechnet werden.');
                setIsRouteLoading(false);
                setRouteData(null);

                setNotification({
                    type: 'danger',
                    title: 'Routenfehler',
                    message: error.message || 'Route konnte nicht berechnet werden.',
                    autoCloseMs: 4000
                });
            });

        return () => {
            controller.abort();
        };
    }, [startPoint, targetPoint]);

    // Closes the search panel when the user clicks outside the route bar.
    useEffect(() => {
        const handleDocumentPointerDown = (event) => {
            if (!activeSearchField) return;

            const target = event.target;

            if (!(target instanceof Element)) return;

            // Clicks inside the route bar should keep the search panel open.
            if (target.closest('.route-bar')) return;

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
                  routeData={routeData}/>

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

            <div className='map-ui'>
                <div className='map-ui-top'>
                    <div className='route-bar'>
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
                                            <button key={place.id} type='button' className='search-result' onClick={() => selectSearchResult(place)}>
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
                </div>
                <div className='map-ui-bottom'>
                    <div className='button-area'>
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
                    </div>
                </div>
            </div>

            <WikipediaCard 
                info={wikiInfo} 
                flowState={infoFlowState} 
                error={wikiError} 
                isOpen={isWikiCardOpen}
                onRetry={handleWorkflowRetry}
                routeData={routeData}
                onClose={() => {
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