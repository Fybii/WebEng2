import React, { useState } from 'react';

const formatDistance = (meters) => {
    if (meters == null) return '';
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
};

const formatDuration = (seconds) => {
    if (seconds == null) return '';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} Min.`;
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return rem === 0 ? `${hours} Std.` : `${hours} Std. ${rem} Min.`;
};

const MODES = [
    { id: 'driving', label: 'Auto', icon: (<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.85 7h10.29l1.08 3.11H5.78L6.85 7zM19 17H5v-5h14v5z"/><circle fill="currentColor" cx="7.5" cy="14.5" r="1.5"/><circle fill="currentColor" cx="16.5" cy="14.5" r="1.5"/></svg>) },
    { id: 'cycling', label: 'Fahrrad', icon: (<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM5 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5zm5.8-10l2.4-2.4.8.8c1.3 1.3 3.1 2.1 5 2.1v-2c-1.3 0-2.5-.5-3.4-1.4l-1.2-1.2c-.4-.4-1-.6-1.6-.6s-1.1.2-1.4.6L9.2 9.8c-.4.4-.6.9-.6 1.4 0 .6.2 1.1.6 1.4L12 15v5h2v-6.2l-3.2-3.3zM19 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/></svg>) },
    { id: 'walking', label: 'Zu Fuß', icon: (<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/></svg>) },
];

const RoutePanel = ({
    routeData, isRouteLoading, routeError, transportMode, onTransportModeChange,
    onStartNavigation, isNavigating, currentStepIndex, onStopNavigation, onClearRoute,
    wikiInfo, wikiFlowState, wikiError, isWikiOpen, onWikiRetry, onWikiClose,
}) => {
    const [showSteps, setShowSteps] = useState(false);
    const [showWiki, setShowWiki] = useState(false);

    if (isNavigating && routeData?.steps?.[currentStepIndex]) {
        const remaining = routeData.steps.slice(currentStepIndex).reduce((a, s) => a + s.distance, 0);
        const remainingTime = routeData.steps.slice(currentStepIndex).reduce((a, s) => a + s.duration, 0);

        const eta = new Date(Date.now() + remainingTime * 1000);
        const etaStr = eta.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

        return (
            <div className='route-panel nav-active'>
                <div className='nav-bottom-bar'>
                    <div className='nav-remaining'>
                        <span className='nav-remaining-time'>{formatDuration(remainingTime)}</span>
                        <span className='nav-remaining-dot'>·</span>
                        <span className='nav-remaining-dist'>{formatDistance(remaining)}</span>
                        <span className='nav-remaining-dot'>·</span>
                        <span className='nav-remaining-eta'>Ankunft {etaStr}</span>
                    </div>
                    <button className='nav-stop-button' type='button' onClick={onStopNavigation}>Beenden</button>
                </div>
            </div>
        );
    }

    if (!isWikiOpen && !routeData && !isRouteLoading && !routeError) return null;

    const wikiLoading = wikiFlowState === 'geocoding' || wikiFlowState === 'wiki_loading';
    const wikiErrorState = wikiFlowState === 'error_geocoding' || wikiFlowState === 'error_wikipedia';

    return (
        <div className='route-panel'>
            <div className='route-panel-header'>
                <div className='route-panel-handle'></div>
                {onClearRoute && (
                    <button className='rp-close-btn' type='button' onClick={onClearRoute} aria-label='Route schließen'>
                        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                    </button>
                )}
            </div>

            {(routeData || isRouteLoading || routeError) && (
                <>
                    <div className='route-panel-modes'>
                        {MODES.map((m) => (
                            <button key={m.id} type='button'
                                className={`rp-mode-btn ${transportMode === m.id ? 'active' : ''}`}
                                onClick={() => onTransportModeChange(m.id)}>
                                {m.icon}
                                <span className='rp-mode-label'>{m.label}</span>
                            </button>
                        ))}
                    </div>

                    {isRouteLoading && (
                        <div className='route-panel-loading'>
                            <div className='rp-loading-spinner'></div>
                            <span>Route wird berechnet...</span>
                        </div>
                    )}

                    {!isRouteLoading && routeError && (
                        <div className='rp-route-error'>
                            <span>{routeError}</span>
                        </div>
                    )}

                    {routeData && (
                        <div className='route-panel-summary'>
                            <div className='rp-summary-main'>
                                <span className='rp-duration'>{formatDuration(routeData.duration)}</span>
                                <span className='rp-distance'>{formatDistance(routeData.distance)}</span>
                            </div>
                            {routeData.summary && (
                                <span className='rp-via'>über {routeData.summary}</span>
                            )}
                        </div>
                    )}

                    {routeData && (
                        <button className='rp-start-button' type='button' onClick={onStartNavigation}>
                            Route starten
                        </button>
                    )}

                    {routeData?.steps?.length > 0 && (
                        <div className='rp-steps-section'>
                            <button className='rp-steps-toggle' type='button' onClick={() => setShowSteps(!showSteps)}>
                                {showSteps ? 'Schritte ausblenden' : `${routeData.steps.length} Schritte anzeigen`}
                                <span className={`rp-chevron ${showSteps ? 'open' : ''}`}>&#9662;</span>
                            </button>
                            {showSteps && (
                                <div className='rp-steps-list'>
                                    {routeData.steps.map((s, i) => (
                                        <div key={i} className='rp-step'>
                                            <span className='rp-step-icon'>{s.icon}</span>
                                            <div className='rp-step-info'>
                                                <span className='rp-step-instruction'>{s.instruction}</span>
                                                {s.distance > 0 && <span className='rp-step-dist'>{formatDistance(s.distance)}</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {isWikiOpen && (
                <div className='rp-wiki-section'>
                    <button className='rp-wiki-toggle' type='button' onClick={() => setShowWiki(!showWiki)}>
                        {wikiLoading ? 'Wikipedia lädt...' : wikiInfo?.title ? `Wikipedia: ${wikiInfo.title}` : 'Wikipedia-Info'}
                        <span className={`rp-chevron ${showWiki ? 'open' : ''}`}>&#9662;</span>
                    </button>

                    {showWiki && (
                        <div className='rp-wiki-content'>
                            {wikiLoading && (
                                <div className='rp-wiki-loading'>
                                    <div className='rp-loading-spinner'></div>
                                    <span>{wikiFlowState === 'geocoding' ? 'Adresse wird ermittelt...' : 'Wikipedia wird geladen...'}</span>
                                </div>
                            )}

                            {wikiErrorState && (
                                <div className='rp-wiki-error'>
                                    <p>{wikiFlowState === 'error_geocoding' ? 'Adresse nicht verfügbar.' : (wikiError || 'Wikipedia-Fehler.')}</p>
                                    <button className='button button-secondary' type='button' onClick={onWikiRetry}>Erneut</button>
                                </div>
                            )}

                            {!wikiLoading && !wikiErrorState && !wikiInfo && (
                                <p className='rp-wiki-empty'>Keine Wikipedia-Infos für diesen Ort.</p>
                            )}

                            {!wikiLoading && !wikiErrorState && wikiInfo && (
                                <div className='rp-wiki-article'>
                                    {wikiInfo.imageUrl && (
                                        <img className='rp-wiki-image' src={wikiInfo.imageUrl} alt={wikiInfo.title} />
                                    )}
                                    <h4 className='rp-wiki-title'>{wikiInfo.title}</h4>
                                    {wikiInfo.description && <p className='rp-wiki-desc'>{wikiInfo.description}</p>}
                                    <p className='rp-wiki-summary'>{wikiInfo.summary}</p>
                                    <a href={wikiInfo.pageUrl} target='_blank' rel='noopener noreferrer' className='rp-wiki-link'>
                                        Mehr auf Wikipedia
                                    </a>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default RoutePanel;
