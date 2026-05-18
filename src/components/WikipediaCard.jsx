import React from 'react';

const WikipediaCard = ({ info, flowState, error, isOpen, onRetry, onClose }) => {
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
