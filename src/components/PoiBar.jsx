import React, { useState } from 'react';
import { POI_CATEGORIES, POI_GROUPS, POI_QUICK_KEYS } from '../js/services';

const PoiBar = ({ activeCategory, isLoading, onSelectCategory }) => {
    const [showMore, setShowMore] = useState(false);

    const handleSelect = (key) => {
        onSelectCategory(key);
        setShowMore(false);
    };

    const isQuickActive = (key) => activeCategory === key;
    const isMoreActive = activeCategory && !POI_QUICK_KEYS.includes(activeCategory);

    return (
        <>
            <div className='poi-quick-bar'>
                {POI_QUICK_KEYS.map((key) => {
                    const cat = POI_CATEGORIES[key];
                    if (!cat) return null;

                    return (
                        <button
                            key={key}
                            type='button'
                            className={`poi-quick-item ${isQuickActive(key) ? 'active' : ''}`}
                            onClick={() => handleSelect(key)}
                            disabled={isLoading && activeCategory !== key}
                        >
                            <span className='poi-quick-icon'>{cat.icon}</span>
                            <span className='poi-quick-label'>{cat.label}</span>
                        </button>
                    );
                })}

                <button
                    type='button'
                    className={`poi-quick-item poi-quick-more ${showMore || isMoreActive ? 'active' : ''}`}
                    onClick={() => setShowMore(true)}
                    aria-label='Weitere Kategorien'
                >
                    <span className='poi-quick-icon poi-quick-icon-more'>
                        <svg viewBox='0 0 24 24' width='22' height='22' aria-hidden='true'>
                            <path fill='currentColor' d='M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z'/>
                        </svg>
                    </span>
                    <span className='poi-quick-label'>
                        {isMoreActive && POI_CATEGORIES[activeCategory]
                            ? POI_CATEGORIES[activeCategory].label
                            : 'Mehr'}
                    </span>
                </button>
            </div>

            {showMore && (
                <div className='poi-more-overlay' onClick={() => setShowMore(false)}>
                    <div className='poi-more-sheet' onClick={(e) => e.stopPropagation()}>
                        <div className='poi-more-header'>
                            <h3 className='poi-more-title'>Orte in der Nähe</h3>
                            <button type='button' className='poi-more-close' onClick={() => setShowMore(false)} aria-label='Schließen'>×</button>
                        </div>

                        <div className='poi-more-content'>
                            {POI_GROUPS.map((group) => {
                                const items = Object.entries(POI_CATEGORIES).filter(([, cat]) => cat.group === group.id);
                                if (items.length === 0) return null;

                                return (
                                    <section key={group.id} className='poi-more-section'>
                                        <h4 className='poi-more-section-title'>{group.label}</h4>
                                        <div className='poi-more-grid'>
                                            {items.map(([key, cat]) => (
                                                <button
                                                    key={key}
                                                    type='button'
                                                    className={`poi-more-item ${activeCategory === key ? 'active' : ''}`}
                                                    onClick={() => handleSelect(key)}
                                                    disabled={isLoading && activeCategory !== key}
                                                >
                                                    <span className='poi-more-item-icon'>{cat.icon}</span>
                                                    <span className='poi-more-item-label'>{cat.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </section>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default PoiBar;
