import React from 'react';

const WikipediaCard = ({ info, isLoading, error, isOpen, onRetry, onClose }) => {
    const [isExpanded, setIsExpanded] = React.useState(false);

    if (!isOpen) return null;

    const toggleExpand = () => setIsExpanded(!isExpanded);

    return (
        <div className={`wiki-card ${isLoading ? 'is-loading' : ''} ${error ? 'is-error' : ''} ${isExpanded ? 'is-expanded' : ''}`}>
            <div className="wiki-card-drag-handle" onClick={toggleExpand}></div>
            <button className="wiki-card-close" onClick={onClose} type="button">
                <img src="/assets/icons/icon-dismiss.svg" alt="Close" />
            </button>

            <div className="wiki-card-content">
                {isLoading && (
                    <div className="wiki-card-skeleton">
                        <div className="skeleton-text-title"></div>
                        <div className="skeleton-text-line" style={{ width: '40%', marginBottom: 'var(--space-md)' }}></div>
                        <div className="skeleton-image"></div>
                        <div className="skeleton-text-line"></div>
                        <div className="skeleton-text-line"></div>
                    </div>
                )}

                {error && (
                    <div className="wiki-card-error">
                        <div className="error-message">{error}</div>
                        <button className="button button-danger" onClick={onRetry} type="button">Erneut versuchen</button>
                    </div>
                )}

                {!isLoading && !error && !info && (
                    <div className="wiki-card-empty">
                        <span className="wiki-card-empty-text">Keine Wikipedia-Informationen für diesen Ort gefunden.</span>
                    </div>
                )}

                {!isLoading && !error && info && (
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
