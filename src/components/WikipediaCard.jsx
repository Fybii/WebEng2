import React from 'react';

const formatDistance = (meters) => {
    if (meters === undefined || meters === null) return '';
    const km = meters / 1000;
    return `${km.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
};

const formatDuration = (seconds) => {
    if (seconds === undefined || seconds === null) return '';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
        return `${minutes} Min.`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) {
        return `${hours} Std.`;
    }
    return `${hours} Std. ${remainingMinutes} Min.`;
};

const PROFILE_LABELS = { driving: 'Auto', cycling: 'Fahrrad', walking: 'Zu Fuß' };

const WikipediaCard = ({ info, flowState, error, isOpen, onRetry, routeData, onClose }) => {
    const [isExpanded, setIsExpanded] = React.useState(false);

    if (!isOpen) return null;

    const toggleExpand = () => setIsExpanded(!isExpanded);

    const isLoading = flowState === 'geocoding' || flowState === 'wiki_loading';
    const isError = flowState === 'error_geocoding' || flowState === 'error_wikipedia';

    return (
        <div className={`wiki-card ${isLoading ? 'is-loading' : ''} ${isError ? 'is-error' : ''} ${isExpanded ? 'is-expanded' : ''}`}>
            <div className="wiki-card-drag-handle" onClick={toggleExpand}></div>
            <button className="wiki-card-close" onClick={onClose} type="button">
                <img src="/assets/icons/icon-dismiss.svg" alt="Close" />
            </button>

            <div className="wiki-card-content">
                {routeData && (
                    <div className="route-info-box">
                        <div className="route-info-meta">
                            <div className="route-info-item">
                                <span className="route-info-label">Distanz</span>
                                <span className="route-info-value">{formatDistance(routeData.distance)}</span>
                            </div>
                            <div className="route-info-item">
                                <span className="route-info-label">Dauer ({PROFILE_LABELS[routeData.profile] || 'Auto'})</span>
                                <span className="route-info-value">{formatDuration(routeData.duration)}</span>
                            </div>
                        </div>
                        {routeData.summary && (
                            <div className="route-info-summary">
                                <span className="route-info-label">Route</span>
                                <span className="route-info-value">über {routeData.summary}</span>
                            </div>
                        )}
                    </div>
                )}

                {isLoading && (
                    <div className="wiki-card-skeleton">
                        <div className="wiki-card-status-container">
                            <div className="wiki-card-status-spinner"></div>
                            <span className="wiki-card-status-text">
                                {flowState === 'geocoding' ? 'Adresse wird ermittelt...' : 'Wikipedia-Artikel werden gesucht...'}
                            </span>
                        </div>
                        <div className="skeleton-text-title"></div>
                        <div className="skeleton-text-line" style={{ width: '40%', marginBottom: 'var(--space-md)' }}></div>
                        <div className="skeleton-image"></div>
                        <div className="skeleton-text-line"></div>
                        <div className="skeleton-text-line"></div>
                    </div>
                )}

                {isError && (
                    <div className="wiki-card-error">
                        <div className="wiki-card-error-header">
                            <div className="wiki-card-error-icon">
                                <img src="/assets/icons/icon-danger.svg" alt="Error" />
                            </div>
                            <div className="wiki-card-error-meta">
                                <h3 className="wiki-card-error-title">
                                    {flowState === 'error_geocoding' ? 'Adresse nicht verfügbar' : 'Wikipedia-Fehler'}
                                </h3>
                                <p className="wiki-card-error-message">
                                    {flowState === 'error_geocoding' 
                                        ? 'Die Adresse dieses Ortes konnte nicht ermittelt werden.' 
                                        : (error || 'Wikipedia-Informationen konnten nicht geladen werden.')}
                                </p>
                            </div>
                        </div>
                        <div className="wiki-card-error-actions">
                            <button className="button button-secondary" onClick={onClose} type="button">Schließen</button>
                            <button className="button button-danger" onClick={onRetry} type="button">Erneut versuchen</button>
                        </div>
                    </div>
                )}

                {!isLoading && !isError && !info && (
                    <div className="wiki-card-empty">
                        <span className="wiki-card-empty-text">Keine Wikipedia-Informationen für diesen Ort gefunden.</span>
                    </div>
                )}

                {!isLoading && !isError && info && (
                    <div className="wiki-card-info">
                        <h3 className="wiki-card-title">{info.title}</h3>
                        {info.description && <p className="wiki-card-description">{info.description}</p>}
                        
                        {info.imageUrl && (
                            <div className="wiki-card-image">
                                <img src={info.imageUrl} alt={info.title} />
                            </div>
                        )}
                        
                        <p className="wiki-card-summary">{info.summary}</p>
                        <a href={info.pageUrl} target="_blank" rel="noopener noreferrer" className="wiki-card-link external">
                            Mehr auf Wikipedia lesen
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WikipediaCard;
