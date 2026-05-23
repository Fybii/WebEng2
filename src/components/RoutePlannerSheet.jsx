import React, { useEffect, useState } from 'react';
import { searchPlaces } from '../js/services';

const formatSavedAt = (iso) => {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return '';
    }
};

const RoutePlannerSheet = ({
    isOpen,
    onClose,
    homeAddress,
    savedRoutes,
    canSaveRoute,
    routePreviewLabel,
    onSaveHomeFromTarget,
    onSaveHomeFromLocation,
    onSaveHomeFromPlace,
    onClearHome,
    onUseHomeAsTarget,
    onSaveRoute,
    onLoadRoute,
    onDeleteRoute,
    currentLocation,
}) => {
    const [routeName, setRouteName] = useState('');
    const [homeQuery, setHomeQuery] = useState('');
    const [homeResults, setHomeResults] = useState([]);
    const [isHomeSearching, setIsHomeSearching] = useState(false);
    const [homeSearchError, setHomeSearchError] = useState('');

    useEffect(() => {
        if (!isOpen) {
            setRouteName('');
            setHomeQuery('');
            setHomeResults([]);
            setHomeSearchError('');
            return;
        }

        if (canSaveRoute && routePreviewLabel && !routeName) {
            setRouteName(routePreviewLabel);
        }
    }, [isOpen, canSaveRoute, routePreviewLabel, routeName]);

    useEffect(() => {
        const query = homeQuery.trim();
        if (!isOpen || query.length < 2) {
            setHomeResults([]);
            setHomeSearchError('');
            setIsHomeSearching(false);
            return;
        }

        const controller = new AbortController();
        const timeoutId = window.setTimeout(async () => {
            try {
                setIsHomeSearching(true);
                setHomeSearchError('');
                const results = await searchPlaces(query, {
                    signal: controller.signal,
                    lat: currentLocation?.lat,
                    lng: currentLocation?.lng,
                });
                setHomeResults(results);
                if (results.length === 0) {
                    setHomeSearchError('Keine passende Orte gefunden.');
                }
            } catch (error) {
                if (error.name === 'AbortError') return;
                setHomeResults([]);
                setHomeSearchError(error.message || 'Suche fehlgeschlagen.');
            } finally {
                if (!controller.signal.aborted) {
                    setIsHomeSearching(false);
                }
            }
        }, 350);

        return () => {
            controller.abort();
            window.clearTimeout(timeoutId);
        };
    }, [homeQuery, isOpen, currentLocation]);

    if (!isOpen) return null;

    const handleSaveRoute = () => {
        const name = routeName.trim();
        if (!name) return;
        onSaveRoute(name);
        setRouteName('');
    };

    return (
        <div className='planner-overlay' onClick={onClose}>
            <div className='planner-sheet' onClick={(event) => event.stopPropagation()}>
                <div className='planner-header'>
                    <h2 className='planner-title'>Routen & Heimat</h2>
                    <button className='planner-close' type='button' onClick={onClose} aria-label='Schließen'>×</button>
                </div>

                <div className='planner-content'>
                    <section className='planner-section'>
                        <h3 className='planner-section-title'>Heimatadresse</h3>
                        {homeAddress ? (
                            <div className='planner-home-card'>
                                <span className='planner-home-label'>{homeAddress.label}</span>
                                <span className='planner-home-meta'>
                                    Gespeichert {formatSavedAt(homeAddress.updatedAt)}
                                </span>
                                <div className='planner-home-actions'>
                                    <button className='planner-btn planner-btn-primary' type='button' onClick={onUseHomeAsTarget}>
                                        Als Ziel verwenden
                                    </button>
                                    <button className='planner-btn' type='button' onClick={onClearHome}>
                                        Entfernen
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <p className='planner-hint'>Noch keine Heimatadresse gespeichert.</p>
                        )}

                        <div className='planner-home-set'>
                            <input
                                className='planner-input'
                                type='text'
                                placeholder='Adresse suchen…'
                                value={homeQuery}
                                onChange={(event) => setHomeQuery(event.target.value)}
                                autoComplete='off'
                            />
                            {isHomeSearching && <div className='planner-status'>Suche läuft…</div>}
                            {!isHomeSearching && homeSearchError && (
                                <div className='planner-error'>{homeSearchError}</div>
                            )}
                            {homeResults.length > 0 && (
                                <div className='planner-search-results'>
                                    {homeResults.map((place) => (
                                        <button
                                            key={place.id}
                                            type='button'
                                            className='planner-search-result'
                                            onClick={() => {
                                                onSaveHomeFromPlace(place);
                                                setHomeQuery('');
                                                setHomeResults([]);
                                            }}
                                        >
                                            <span className='planner-search-result-title'>{place.title}</span>
                                            {place.subtitle && (
                                                <span className='planner-search-result-subtitle'>{place.subtitle}</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className='planner-quick-actions'>
                            <button className='planner-btn' type='button' onClick={onSaveHomeFromTarget}>
                                Aktuelles Ziel übernehmen
                            </button>
                            <button className='planner-btn' type='button' onClick={onSaveHomeFromLocation}>
                                GPS-Standort übernehmen
                            </button>
                        </div>
                    </section>

                    <section className='planner-section'>
                        <h3 className='planner-section-title'>Gespeicherte Routen</h3>

                        {canSaveRoute ? (
                            <div className='planner-save-route'>
                                <input
                                    className='planner-input'
                                    type='text'
                                    placeholder='Name der Route…'
                                    value={routeName}
                                    onChange={(event) => setRouteName(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') handleSaveRoute();
                                    }}
                                />
                                <button
                                    className='planner-btn planner-btn-primary'
                                    type='button'
                                    onClick={handleSaveRoute}
                                    disabled={!routeName.trim()}
                                >
                                    Route speichern
                                </button>
                            </div>
                        ) : (
                            <p className='planner-hint'>Setze Start und Ziel, um eine Route zu speichern.</p>
                        )}

                        {savedRoutes.length === 0 ? (
                            <p className='planner-hint'>Noch keine Routen gespeichert.</p>
                        ) : (
                            <ul className='planner-route-list'>
                                {savedRoutes.map((route) => (
                                    <li key={route.id} className='planner-route-item'>
                                        <div className='planner-route-info'>
                                            <span className='planner-route-name'>{route.name}</span>
                                            <span className='planner-route-path'>
                                                {route.startLabel || 'Start'} → {route.targetLabel || 'Ziel'}
                                            </span>
                                            <span className='planner-route-meta'>
                                                {formatSavedAt(route.savedAt)}
                                                {route.waypoints?.length > 0 && ` · ${route.waypoints.length} Zwischenstopp${route.waypoints.length > 1 ? 's' : ''}`}
                                            </span>
                                        </div>
                                        <div className='planner-route-actions'>
                                            <button
                                                className='planner-btn planner-btn-primary'
                                                type='button'
                                                onClick={() => {
                                                    onLoadRoute(route);
                                                    onClose();
                                                }}
                                            >
                                                Laden
                                            </button>
                                            <button
                                                className='planner-btn planner-btn-danger'
                                                type='button'
                                                onClick={() => onDeleteRoute(route.id)}
                                                aria-label='Route löschen'
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
};

export default RoutePlannerSheet;
