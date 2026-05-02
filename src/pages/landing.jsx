import { Page } from 'framework7-react';
import React, { useCallback, useEffect, useRef, useState, version } from 'react';
import Map from '../components/Map';
import AppNotification from '../components/AppNotification';

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

    // References that are uses for values that must stay available
    // inside geolocation callbacks.
    const watchIdRef = useRef(null);
    const hasLocationFixRef = useRef(false);
    const shouldFocusOnNextFixRef = useRef(true);
    const startModeRef = useRef(startMode);
    const startLocationWatchRef = useRef(null);

    const closeNotification = useCallback(() => {
        setNotification(null);
    }, []);

    // Stops continuous location tracking
    const stopLocationWatch = useCallback(() => {
        if (watchIdRef.current != null && navigator.geolocation) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }

        setIsWatchingLocation(false);
        setIsLocating(false);
    }, []);

    // Starts continuous location tracking and updates the live location
    // marker.
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

        // watchPosition keeps listening for location updates after the
        // first fix.
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


                // the route start follows the live location when the start mode is
                // set to current.
                if (startModeRef.current == 'current') {
                    setStartPoint(point);
                }

                // Focuses the map only on the first fix or after an explicit user
                // action.
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
                timeout: 5000,
                maximumAge: 0,
            }
        )
    }, [closeNotification]);

    // Enables map click mode for start selection
    const activateManualStartSelection = useCallback(() => {
        setSelectionMode('start');
        setNotification({
            type: 'info',
            title: 'Startpunkt wählen',
            message: 'Tippe auf die Karte, um deinen Startpunkt zu setzen.',
            autoCloseMs: 3000,
        })
    }, []);

    // Enables map click mode for target selection
    const activateManualTargetSelection = useCallback(() => {
        setSelectionMode('target');
    
        setNotification({
            type: 'info',
            title: 'Zielpunkt wählen',
            message: 'Tippe auf die Karte, um deinen Zielpunkt zu setzen.',
            autoCloseMs: 3000,
        });
    }, []);

    // Sets a manual start point if selection mode is set to strat.
    const handleMapClick = useCallback((point) => {
        if (selectionMode == 'start') {
            startModeRef.current = 'manual';

            setStartMode('manual');
            setStartPoint(point);
            setSelectionMode('none');
            setMapFocus({
                point: point,
                zoom: 16,
                version: Date.now()
            });
            setNotification({
                type: 'success',
                title: 'Startpunkt gesetzt',
                message: 'Der manuelle Startpunkt wurde übernommen.',
                autoCloseMs: 2000,
            });
        }

        if (selectionMode == "target") {
            setTargetPoint(point);
            setSelectionMode('none');

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
            })
        }
    }, [selectionMode]);

    const formatPoint = (point) => {
        if (!point) return '';

        return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
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
                                <input id='startPoint' className='route-input' type='text' autoComplete='off' autoCapitalize='on' placeholder='Startpunkt eingeben...' value={startPoint ? formatPoint(startPoint) : ''} readOnly/>
                            </div>
                        </div>
                        <div className='route-line'>
                            <div className='marker-target'>
                                <div className='marker-target-dot'></div>
                            </div>
                            <div className='input-wrapper'>
                                <input id='targetPoint' className='route-input' type='text' autoComplete='off' autoCapitalize='on' placeholder='Zielpunkt eingeben...' value={targetPoint ? formatPoint(targetPoint) : ''} readOnly/>
                            </div>
                        </div>
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