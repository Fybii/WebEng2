import React, { useEffect, useRef, useState } from "react";
import L from '../js/leaflet-setup';
import { escapeHtml, formatRatingStars } from '../js/services';
import { DEFAULT_MAP_STYLE_ID, getMapStyle, TILE_LAYER_DEFAULTS, MAP_MAX_ZOOM, getGlobeMinZoom, bindTileErrorFallback } from '../js/mapStyles';
import MapStyleSwitcher from './MapStyleSwitcher';

const DEFAULT_CENTER = [51.1657, 10.4515];
const DEFAULT_ZOOM = 6;

const CURRENT_LOCATION_ICON = L.divIcon({
        className: 'map-dot-marker-icon',
        html: `
            <div class="map-marker-dot">
                <div class="map-marker-dot-pulse"></div>
                <div class="map-marker-dot-core"></div>
            </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20],
    });

const MANUAL_START_ICON = L.divIcon({
        className: 'map-marker-icon',
        html: `
            <div class="map-marker-pin start">
                <div class="map-marker-pin-dot start"></div>
            </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -40],
    });

const TARGET_ICON = L.divIcon({
    className: 'map-marker-icon',
    html: `
        <div class="map-marker-pin target">
            <div class="map-marker-pin-dot target"></div>
        </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
})

// Restarts the marker placement animation when the manual start point changes.
const replayMarkerAnimation = (marker) => {
    const element = marker?.getElement();
    if (!element)
        return;

    element.classList.remove('is-placing');
    
    // Forces restart of css animation
    void element.offsetWidth;
    
    element.classList.add('is-placing');

    window.setTimeout(() => {
        element.classList.remove('is-placing');
    }, 500);
};

const ROUTE_STYLE = { color: '#3aafa9', weight: 5, opacity: 0.85 };
const ROUTE_OUTLINE_STYLE = { color: '#1a7a75', weight: 8, opacity: 0.4 };

const LEG_ROUTE_COLORS = [
    { line: '#3aafa9', outline: '#1a7a75' },
    { line: '#0070b4', outline: '#004a78' },
    { line: '#e5bc29', outline: '#9a7800' },
    { line: '#007a59', outline: '#004d38' },
    { line: '#d60c28', outline: '#8a0619' },
    { line: '#6366f1', outline: '#4338ca' },
];

const WAYPOINT_ICON = (index) => L.divIcon({
    className: 'map-marker-icon',
    html: `<div class="map-marker-waypoint">${index + 1}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
});

const POI_ICON = (emoji) => L.divIcon({
    className: 'map-poi-marker',
    html: `<div class="poi-marker-inner">${emoji}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
});

const ROUTE_ALERT_ICON = (emoji, type) => L.divIcon({
    className: 'map-route-alert-marker',
    html: `<div class="route-alert-marker-inner route-alert-${type}">${emoji}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
});

/** Limit min zoom so only one world width is visible; only update when map size changes. */
const applyGlobeViewConstraints = (map) => {
    if (!map) return;

    const width = map.getSize().x;
    if (!width) return;

    const minZoom = getGlobeMinZoom(width);
    if (map.getMinZoom() !== minZoom) {
        map.setMinZoom(minZoom);
    }

    if (map.getZoom() < minZoom) {
        map.setZoom(minZoom);
    }
};

const Map = ({ currentLocation, startPoint, targetPoint, startMode, mapFocus, onMapClick, routeData, routeAlternatives, selectedRouteIndex, routeAlerts, isNavigating, isMapFollowing, onMapFollowLost, suppressRouteFit, waypoints, poiMarkers, onBoundsChange, onPOISelect }) => {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);

    const currentLocationMarkerRef = useRef(null);
    const startMarkerRef = useRef(null);
    const targetMarkerRef = useRef(null);
    const routeOutlineRef = useRef(null);
    const routeLineRef = useRef(null);
    const routeLegLinesRef = useRef([]);
    const routeLegOutlinesRef = useRef([]);
    const alternativeRoutesRef = useRef([]);
    const waypointMarkersRef = useRef([]);
    const poiLayerRef = useRef(null);
    const routeAlertsLayerRef = useRef(null);
    const tileLayerRef = useRef(null);
    const skippedRouteFitKeyRef = useRef(null);

    const [mapStyleId, setMapStyleId] = useState(DEFAULT_MAP_STYLE_ID);
    const [mapReady, setMapReady] = useState(false);

    const onMapClickRef = useRef(onMapClick);
    const onBoundsChangeRef = useRef(onBoundsChange);
    const onPOISelectRef = useRef(onPOISelect);
    const onMapFollowLostRef = useRef(onMapFollowLost);
    const isMapFollowingRef = useRef(isMapFollowing);
    const isProgrammaticMoveRef = useRef(false);

    useEffect(() => {
        onMapClickRef.current = onMapClick;
    }, [onMapClick])

    useEffect(() => {
        onBoundsChangeRef.current = onBoundsChange;
    }, [onBoundsChange])

    useEffect(() => {
        onPOISelectRef.current = onPOISelect;
    }, [onPOISelect])

    useEffect(() => {
        onMapFollowLostRef.current = onMapFollowLost;
    }, [onMapFollowLost]);

    useEffect(() => {
        isMapFollowingRef.current = isMapFollowing;
    }, [isMapFollowing]);

    useEffect(() => {
        if (mapInstanceRef.current) return;

        const initialCenter = currentLocation ? [currentLocation.lat, currentLocation.lng] : DEFAULT_CENTER;
        const initialZoom = currentLocation ? 16 : DEFAULT_ZOOM;

        const map = L.map(mapRef.current, {
            zoomControl: false,
            attributionControl: false,
            preferCanvas: true,
            touchZoom: true,
            maxZoom: MAP_MAX_ZOOM,
            worldCopyJump: true,
        }).setView(initialCenter, initialZoom);

        const initialStyle = getMapStyle(DEFAULT_MAP_STYLE_ID);
        tileLayerRef.current = bindTileErrorFallback(L.tileLayer(initialStyle.url, {
            ...TILE_LAYER_DEFAULTS,
            ...initialStyle.options,
        })).addTo(map);

        map.on('click', (event) => {
            if (!onMapClickRef.current) return;
            onMapClickRef.current({ lat: event.latlng.lat, lng: event.latlng.lng });
        });

        const reportBounds = () => {
            if (onBoundsChangeRef.current) {
                const b = map.getBounds();
                onBoundsChangeRef.current({
                    south: b.getSouth(),
                    north: b.getNorth(),
                    west: b.getWest(),
                    east: b.getEast(),
                });
            }
        };
        map.on('moveend', reportBounds);
        map.on('zoomend', reportBounds);
        map.on('resize', () => {
            map.invalidateSize();
            applyGlobeViewConstraints(map);
            reportBounds();
        });

        mapInstanceRef.current = map;
        setMapReady(true);

        setTimeout(() => {
            map.invalidateSize();
            applyGlobeViewConstraints(map);
            reportBounds();
        }, 300);

        return () => {
            setMapReady(false);
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
            currentLocationMarkerRef.current = null;
            startMarkerRef.current = null;
            targetMarkerRef.current = null;
            waypointMarkersRef.current = [];
            poiLayerRef.current = null;
            routeAlertsLayerRef.current = null;
            tileLayerRef.current = null;
        };
    }, []);

    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!mapReady || !map) return;

        const style = getMapStyle(mapStyleId);
        const newLayer = bindTileErrorFallback(L.tileLayer(style.url, {
            ...TILE_LAYER_DEFAULTS,
            ...style.options,
        })).addTo(map);

        newLayer.bringToBack();

        if (tileLayerRef.current) {
            map.removeLayer(tileLayerRef.current);
        }

        tileLayerRef.current = newLayer;
    }, [mapStyleId]);

    // Creates or moves the live location marker.
    useEffect(() => {
        const map = mapInstanceRef.current;

        if (!mapReady || !map || !currentLocation) {
            return;
        }

        if (currentLocationMarkerRef.current) {
            currentLocationMarkerRef.current.setLatLng([
                currentLocation.lat,
                currentLocation.lng,
            ]);
        } else {
            currentLocationMarkerRef.current = L.marker(
                [currentLocation.lat, currentLocation.lng],
                {
                    icon: CURRENT_LOCATION_ICON,
                    zIndexOffset: 1000,
                },
            ).addTo(map).bindPopup('Aktueller Standort');
        }

        currentLocationMarkerRef.current.update();
    }, [currentLocation, mapReady]);

    // Shows a separate marker only when the start point was set manually.
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!mapReady || !map || !startPoint) {
            return;
        }

        if (startMode == 'current') {
            if (startMarkerRef.current) {
                map.removeLayer(startMarkerRef.current);
                startMarkerRef.current = null;
            }

            return;
        }

        if (startMarkerRef.current) {
            startMarkerRef.current.setLatLng([startPoint.lat, startPoint.lng]);
        }
        else {
            startMarkerRef.current = L.marker([startPoint.lat, startPoint.lng], {
                icon: MANUAL_START_ICON
            }).addTo(map).bindPopup('Startpunkt');
        }

        requestAnimationFrame(() => {
            replayMarkerAnimation(startMarkerRef.current);
        });
    }, [startPoint, startMode, mapReady]);

    // Shows a target marker when the target point was set.
    useEffect(() => {
        const map = mapInstanceRef.current;

        if (!mapReady || !map || !targetPoint) {
            return;
        }

        if (targetMarkerRef.current) {
            targetMarkerRef.current.setLatLng([targetPoint.lat, targetPoint.lng]);
        }
        else {
            targetMarkerRef.current = L.marker([targetPoint.lat, targetPoint.lng], {
                icon: TARGET_ICON
            }).addTo(map).bindPopup('Zielpunkt');
        }

        requestAnimationFrame(() => {
            replayMarkerAnimation(targetMarkerRef.current);
        })
    }, [targetPoint, mapReady]);

    // Draws / updates the route polyline from GeoJSON geometry.
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!mapReady || !map) return;

        const clearRouteLayers = () => {
            if (routeOutlineRef.current) { map.removeLayer(routeOutlineRef.current); routeOutlineRef.current = null; }
            if (routeLineRef.current) { map.removeLayer(routeLineRef.current); routeLineRef.current = null; }
            routeLegLinesRef.current.forEach((layer) => map.removeLayer(layer));
            routeLegOutlinesRef.current.forEach((layer) => map.removeLayer(layer));
            routeLegLinesRef.current = [];
            routeLegOutlinesRef.current = [];
        };

        clearRouteLayers();

        if (!routeData?.geometry) {
            skippedRouteFitKeyRef.current = null;
            return;
        }

        const legGeometries = routeData.legGeometries?.filter((leg) => leg?.length >= 2) || [];
        let boundsLayer = null;

        if (legGeometries.length > 1) {
            const legStyles = routeData.legStyles || [];
            legGeometries.forEach((coords, index) => {
                const colors = LEG_ROUTE_COLORS[index % LEG_ROUTE_COLORS.length];
                const extraStyle = legStyles[index] || {};
                const outline = L.polyline(coords, {
                    color: colors.outline,
                    weight: 8,
                    opacity: 0.4,
                    dashArray: extraStyle.dashArray,
                }).addTo(map);
                const line = L.polyline(coords, {
                    color: colors.line,
                    weight: 5,
                    opacity: 0.9,
                    dashArray: extraStyle.dashArray,
                }).addTo(map);
                routeLegOutlinesRef.current.push(outline);
                routeLegLinesRef.current.push(line);
            });
            boundsLayer = routeLegLinesRef.current[0];
        } else {
            const coords = routeData.geometry.coordinates.map(c => [c[1], c[0]]);
            routeOutlineRef.current = L.polyline(coords, ROUTE_OUTLINE_STYLE).addTo(map);
            routeLineRef.current = L.polyline(coords, ROUTE_STYLE).addTo(map);
            boundsLayer = routeLineRef.current;
        }

        if (boundsLayer && !isNavigating) {
            const routeFitKey = `${routeData.distance ?? 0}-${routeData.duration ?? 0}-${selectedRouteIndex ?? 0}`;
            const shouldSkipFit = suppressRouteFit || skippedRouteFitKeyRef.current === routeFitKey;

            if (suppressRouteFit) {
                skippedRouteFitKeyRef.current = routeFitKey;
            }

            if (!shouldSkipFit) {
                const group = L.featureGroup([
                    ...routeLegLinesRef.current,
                    ...routeLegOutlinesRef.current,
                    routeLineRef.current,
                    routeOutlineRef.current,
                ].filter(Boolean));
                map.fitBounds(group.getBounds(), { padding: [60, 60] });
            }
        }
    }, [routeData, mapReady, isNavigating, suppressRouteFit, selectedRouteIndex]);

    // Draws dimmed alternative route polylines.
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!mapReady || !map) return;

        alternativeRoutesRef.current.forEach((layer) => map.removeLayer(layer));
        alternativeRoutesRef.current = [];

        if (!routeAlternatives?.length || routeAlternatives.length < 2) return;

        routeAlternatives.forEach((route, index) => {
            if (index === selectedRouteIndex || !route.geometry?.coordinates?.length) return;

            const coords = route.geometry.coordinates.map((c) => [c[1], c[0]]);
            const line = L.polyline(coords, {
                color: '#94a3b8',
                weight: 4,
                opacity: 0.55,
                dashArray: '8 10',
            }).addTo(map);
            alternativeRoutesRef.current.push(line);
        });
    }, [routeAlternatives, selectedRouteIndex, mapReady]);

    // Follows GPS position during active navigation when follow mode is enabled.
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map || !isNavigating || !isMapFollowing || !currentLocation) return;

        isProgrammaticMoveRef.current = true;
        map.panTo([currentLocation.lat, currentLocation.lng], { animate: true });
    }, [isNavigating, isMapFollowing, currentLocation]);

    // Unlock follow mode when the user pans or zooms manually.
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!mapReady || !map || !isNavigating) return;

        const handleUserInteraction = () => {
            if (isProgrammaticMoveRef.current) return;
            if (isMapFollowingRef.current) {
                onMapFollowLostRef.current?.();
            }
        };

        const handleMoveEnd = () => {
            isProgrammaticMoveRef.current = false;
        };

        const handleZoomStart = () => {
            if (isProgrammaticMoveRef.current) return;
            handleUserInteraction();
        };

        map.on('dragstart', handleUserInteraction);
        map.on('zoomstart', handleZoomStart);
        map.on('moveend', handleMoveEnd);

        return () => {
            map.off('dragstart', handleUserInteraction);
            map.off('zoomstart', handleZoomStart);
            map.off('moveend', handleMoveEnd);
        };
    }, [mapReady, isNavigating]);

    useEffect(() => {
        const map = mapInstanceRef.current;

        if (!mapReady || !map || !mapFocus?.point) return;

        isProgrammaticMoveRef.current = true;
        map.flyTo([mapFocus.point.lat, mapFocus.point.lng], mapFocus.zoom ?? 17, {
            animate: true,
            duration: 0.8
        });
    }, [mapFocus, mapReady]);

    // Waypoint markers
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!mapReady || !map) return;

        waypointMarkersRef.current.forEach(m => map.removeLayer(m));
        waypointMarkersRef.current = [];

        if (!waypoints?.length) return;

        waypoints.forEach((wp, i) => {
            if (!wp.point) return;
            const marker = L.marker([wp.point.lat, wp.point.lng], {
                icon: WAYPOINT_ICON(i),
            }).addTo(map).bindPopup(wp.label || `Zwischenstopp ${i + 1}`);
            waypointMarkersRef.current.push(marker);
        });
    }, [waypoints, mapReady]);

    // POI markers
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!mapReady || !map) return;

        if (poiLayerRef.current) {
            map.removeLayer(poiLayerRef.current);
            poiLayerRef.current = null;
        }

        if (!poiMarkers?.length) return;

        const group = L.layerGroup();
        poiMarkers.forEach(poi => {
            const ratingLine = poi.rating != null
                ? `<div class="poi-popup-rating">${formatRatingStars(poi.rating)}${poi.ratingCount ? ` <span class="poi-popup-rating-count">(${poi.ratingCount})</span>` : ''}${poi.ratingSource === 'google' ? ' <span class="poi-popup-rating-src">Google-Bewertung</span>' : ''}</div>`
                : '';

            const popupHtml = `
                <div class="poi-popup">
                    <strong>${escapeHtml(poi.name)}</strong>
                    ${ratingLine}
                    ${poi.address ? `<br><span class="poi-popup-addr">${escapeHtml(poi.address)}</span>` : ''}
                    ${poi.description ? `<br><span class="poi-popup-detail">${escapeHtml(poi.description)}</span>` : ''}
                    ${poi.cuisine ? `<br><span class="poi-popup-detail">Küche: ${escapeHtml(poi.cuisine)}</span>` : ''}
                    ${poi.openingHours ? `<br><span class="poi-popup-detail">Öffnungszeiten: ${escapeHtml(poi.openingHours)}</span>` : ''}
                    ${poi.phone ? `<br><a class="external" href="tel:${escapeHtml(poi.phone)}">${escapeHtml(poi.phone)}</a>` : ''}
                    ${poi.website ? `<br><a class="external" href="${escapeHtml(poi.website)}" target="_blank" rel="noopener noreferrer">Webseite</a>` : ''}
                    <button type="button" class="poi-popup-nav-link">Dorthin navigieren</button>
                </div>`;
            const marker = L.marker([poi.lat, poi.lng], { icon: POI_ICON(poi.icon) })
                .bindPopup(popupHtml, { maxWidth: 250 });

            marker.on('popupopen', () => {
                const popupEl = marker.getPopup()?.getElement();
                const navBtn = popupEl?.querySelector('.poi-popup-nav-link');
                if (!navBtn || navBtn.dataset.bound) return;
                navBtn.dataset.bound = '1';
                navBtn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    marker.closePopup();
                    onPOISelectRef.current?.(poi);
                });
            });

            marker.addTo(group);
        });
        group.addTo(map);
        poiLayerRef.current = group;
    }, [poiMarkers, mapReady]);

    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!mapReady || !map) return;

        if (routeAlertsLayerRef.current) {
            map.removeLayer(routeAlertsLayerRef.current);
            routeAlertsLayerRef.current = null;
        }

        if (!routeAlerts?.length) return;

        const group = L.layerGroup();
        routeAlerts.forEach((alert) => {
            if (alert.lat == null || alert.lng == null) return;

            const popupHtml = `
                <div class="route-alert-popup route-alert-popup-${alert.type}">
                    <strong>${escapeHtml(alert.title)}</strong>
                    ${alert.detail ? `<p class="route-alert-popup-detail">${escapeHtml(alert.detail)}</p>` : ''}
                    <p class="route-alert-popup-note">Hinweis aus OpenStreetMap (kein Live-Stau)</p>
                </div>`;

            L.marker([alert.lat, alert.lng], {
                icon: ROUTE_ALERT_ICON(alert.icon, alert.type),
                zIndexOffset: 800,
            })
                .bindPopup(popupHtml, { maxWidth: 260, className: 'route-alert-leaflet-popup' })
                .addTo(group);
        });

        group.addTo(map);
        routeAlertsLayerRef.current = group;
    }, [routeAlerts, mapReady]);

    const handleZoomIn = () => { mapInstanceRef.current?.zoomIn(); };
    const handleZoomOut = () => { mapInstanceRef.current?.zoomOut(); };

    return (
        <div className={`map-root${isNavigating ? ' map-root--navigating' : ''}`} style={{position: 'relative', height: '100%', width: '100%'}}>
            <div ref={mapRef} className='map'></div>
            <div className='map-zoom-controls'>
                <MapStyleSwitcher activeStyleId={mapStyleId} onStyleChange={setMapStyleId} />
                <button className='map-zoom-button' type='button' onClick={handleZoomIn} aria-label='Hineinzoomen'>+</button>
                <button className='map-zoom-button' type='button' onClick={handleZoomOut} aria-label='Herauszoomen'>−</button>
            </div>
        </div>
    )
};

export default Map;