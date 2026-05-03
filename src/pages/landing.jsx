import { Page } from 'framework7-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Map from '../components/Map';
import AppNotification from '../components/AppNotification';
import { searchPlaces, reversePlace } from '../js/services';

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

    // Converts coordinates into a readable place label.
    const resolvePointLabel = useCallback(async (point, fallbackLabel) => {
        try {
            const place = await reversePlace(point);
            return place.label || fallbackLabel;
        }
        catch {
            return fallbackLabel;
        }
    }, []);

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

                    resolvePointLabel(point, 'Aktueller Standort').then((label) => {
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

            resolvePointLabel(point, 'Gesetzter Startpunkt').then((label) => {
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
            setTargetPoint(point);
            setSelectionMode('none');
            setTargetLabel('Zielpunkt wird ermittelt...');
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

            resolvePointLabel(point, 'Gesetzter Zielpunkt').then((label) => {
                setTargetLabel(label);
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
            setStartSearch('')

            setNotification({
                type: 'success',
                title: 'Startpunkt gesetzt',
                message: 'Der ausgewählte Ort wurde als Startpunkt übernommen.',
                autoCloseMs: 2000,
            });
        }

        if (activeSearchField == 'target') {
            setTargetPoint(point);
            setTargetLabel(place.label);
            setTargetSearch('');

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

        if (!activeSearchField || query.length < 1) {
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
                    signal: controller.signal
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
                  onMapClick={handleMapClick}/>

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
                        <button id='setStartPointButton' className={`button button-circle button-secondary ${selectionMode == 'start' ? 'active' : ''}`} onClick={activateManualStartSelection} type='button'>
                            <img className='map-ui-icon' src='/assets/icons/icon-crosshair.svg'/>
                        </button>                       
                        <button id='setTargetPointButton' className={`button button-circle button-secondary ${selectionMode == 'target' ? 'active' : ''}`} onClick={activateManualTargetSelection} type='button'>
                            <img className='map-ui-icon' src='/assets/icons/icon-location-ripple.svg'/>
                        </button>
                    </div>
                </div>
            </div>
        </Page>
    );
};

export default LandingPage;