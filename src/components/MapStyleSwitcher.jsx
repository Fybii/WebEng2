import React, { useEffect, useRef, useState } from 'react';
import { MAP_STYLES } from '../js/mapStyles';

const MapStyleSwitcher = ({ activeStyleId, onStyleChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const rootRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (event) => {
            if (!rootRef.current?.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown, true);
        return () => document.removeEventListener('pointerdown', handlePointerDown, true);
    }, [isOpen]);

    const activeLabel = MAP_STYLES.find((s) => s.id === activeStyleId)?.label || 'Karte';

    return (
        <div className={`map-style-control ${isOpen ? 'is-open' : ''}`} ref={rootRef}>
            <button
                type='button'
                className={`map-style-toggle ${isOpen ? 'open' : ''}`}
                onClick={() => setIsOpen((prev) => !prev)}
                aria-expanded={isOpen}
                aria-haspopup='listbox'
                aria-label='Kartenansicht wählen'
                title='Kartenansicht'
            >
                <svg viewBox='0 0 24 24' width='20' height='20' aria-hidden='true'>
                    <path fill='currentColor' d='M12 2L2 7v2h20V7L12 2zm0 2.18L18.3 8H5.7L12 4.18zM4 11v9h6v-6H4zm8 0v9h8v-9h-8z'/>
                </svg>
            </button>

            {isOpen && (
                <div className='map-style-menu' role='listbox' aria-label='Kartenansichten'>
                    <div className='map-style-menu-title'>Kartenansicht</div>
                    {MAP_STYLES.map((style) => (
                        <button
                            key={style.id}
                            type='button'
                            role='option'
                            aria-selected={activeStyleId === style.id}
                            className={`map-style-option ${activeStyleId === style.id ? 'active' : ''}`}
                            onClick={() => {
                                onStyleChange(style.id);
                                setIsOpen(false);
                            }}
                        >
                            <span className='map-style-option-label'>{style.label}</span>
                            {activeStyleId === style.id && (
                                <svg className='map-style-check' viewBox='0 0 24 24' width='16' height='16' aria-hidden='true'>
                                    <path fill='currentColor' d='M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z'/>
                                </svg>
                            )}
                        </button>
                    ))}
                </div>
            )}

            <span className='map-style-active-label'>{activeLabel}</span>
        </div>
    );
};

export default MapStyleSwitcher;
