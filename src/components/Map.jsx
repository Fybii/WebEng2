import React, { useEffect, useRef } from "react";
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { escapeHtml, formatRatingStars } from '../js/services';

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

const Map = ({ currentLocation, startPoint, targetPoint, startMode, mapFocus, onMapClick, routeData, isNavigating, waypoints, poiMarkers, onBoundsChange }) => {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);

    const currentLocationMarkerRef = useRef(null);
    const startMarkerRef = useRef(null);
    const targetMarkerRef = useRef(null);
    const routeOutlineRef = useRef(null);
    const routeLineRef = useRef(null);
    const waypointMarkersRef = useRef([]);
    const poiLayerRef = useRef(null);

    const onMapClickRef = useRef(onMapClick);
    const onBoundsChangeRef = useRef(onBoundsChange);

    useEffect(() => {
        onMapClickRef.current = onMapClick;
    }, [onMapClick])

    useEffect(() => {
        onBoundsChangeRef.current = onBoundsChange;
    }, [onBoundsChange])

    useEffect(() => {
        if (mapInstanceRef.current) return;

        const initialCenter = currentLocation ? [currentLocation.lat, currentLocation.lng] : DEFAULT_CENTER;
        const initialZoom = currentLocation ? 16 : DEFAULT_ZOOM;

        const map = L.map(mapRef.current, {
            zoomControl: false,
            attributionControl: true,
            preferCanvas: true
        }).setView(initialCenter, initialZoom);

        // CARTO/OSM – free, no API key (Stadia "Account Limit Exceeded" without paid quota)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20,
            detectRetina: false,
            updateWhenZooming: false,
            updateWhenIdle: true,
            keepBuffer: 2,
        }).addTo(map);

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

        mapInstanceRef.current = map;

        setTimeout(() => {
            map.invalidateSize();
            reportBounds();
        }, 300);

        return () => {
            map.remove();
            mapInstanceRef.current = null;
        }
    }, []);

    // Creates or moves the live location marker.
    useEffect(() => {
        const map = mapInstanceRef.current;

        if (!map || !currentLocation)
            return;

        if (currentLocationMarkerRef.current) {
            currentLocationMarkerRef.current.setLatLng([
                currentLocation.lat,
                currentLocation.lng
            ]);
        }
        else {
            currentLocationMarkerRef.current = L.marker(
                [currentLocation.lat, currentLocation.lng],
                {
                    icon: CURRENT_LOCATION_ICON
                }
            ).addTo(map).bindPopup('Aktueller Standort');
        }
    }, [currentLocation]);

    // Shows a separate marker only when the start point was set manually.
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map || !startPoint)
            return;

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
    }, [startPoint, startMode]);

    // Shows a target marker when the target point was set.
    useEffect(() => {
        const map = mapInstanceRef.current;

        if (!map || !targetPoint)
            return;

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
    }, [targetPoint]);

    // Draws / updates the route polyline from GeoJSON geometry.
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map) return;

        if (routeOutlineRef.current) { map.removeLayer(routeOutlineRef.current); routeOutlineRef.current = null; }
        if (routeLineRef.current) { map.removeLayer(routeLineRef.current); routeLineRef.current = null; }

        if (!routeData?.geometry) return;

        const coords = routeData.geometry.coordinates.map(c => [c[1], c[0]]);
        routeOutlineRef.current = L.polyline(coords, ROUTE_OUTLINE_STYLE).addTo(map);
        routeLineRef.current = L.polyline(coords, ROUTE_STYLE).addTo(map);

        map.fitBounds(routeLineRef.current.getBounds(), { padding: [60, 60] });
    }, [routeData]);

    // Follows GPS position during active navigation.
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map || !isNavigating || !currentLocation) return;

        map.setView([currentLocation.lat, currentLocation.lng], map.getZoom() < 16 ? 16 : map.getZoom(), { animate: true });
    }, [isNavigating, currentLocation]);

    useEffect(() => {
        const map = mapInstanceRef.current;

        if (!map || !mapFocus?.point) return;

        map.flyTo([mapFocus.point.lat, mapFocus.point.lng], mapFocus.zoom ?? 17, {
            animate: true,
            duration: 0.8
        });
    }, [mapFocus]);

    // Waypoint markers
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map) return;

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
    }, [waypoints]);

    // POI markers
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map) return;

        if (poiLayerRef.current) {
            map.removeLayer(poiLayerRef.current);
            poiLayerRef.current = null;
        }

        if (!poiMarkers?.length) return;

        const group = L.layerGroup();
        poiMarkers.forEach(poi => {
            const ratingLine = poi.rating != null
                ? `<div class="poi-popup-rating">${formatRatingStars(poi.rating)}${poi.ratingCount ? ` <span class="poi-popup-rating-count">(${poi.ratingCount})</span>` : ''}${poi.ratingSource === 'google' ? ' <span class="poi-popup-rating-src">Google</span>' : ''}</div>`
                : '';

            const popupHtml = `
                <div class="poi-popup">
                    <strong>${escapeHtml(poi.name)}</strong>
                    ${ratingLine}
                    ${poi.address ? `<br><span class="poi-popup-addr">${escapeHtml(poi.address)}</span>` : ''}
                    ${poi.cuisine ? `<br><span class="poi-popup-detail">Küche: ${escapeHtml(poi.cuisine)}</span>` : ''}
                    ${poi.openingHours ? `<br><span class="poi-popup-detail">Öffnungszeiten: ${escapeHtml(poi.openingHours)}</span>` : ''}
                    ${poi.phone ? `<br><a class="external" href="tel:${escapeHtml(poi.phone)}">${escapeHtml(poi.phone)}</a>` : ''}
                    ${poi.website ? `<br><a class="external" href="${escapeHtml(poi.website)}" target="_blank" rel="noopener noreferrer">Website</a>` : ''}
                </div>`;
            L.marker([poi.lat, poi.lng], { icon: POI_ICON(poi.icon) })
                .bindPopup(popupHtml, { maxWidth: 250 })
                .addTo(group);
        });
        group.addTo(map);
        poiLayerRef.current = group;
    }, [poiMarkers]);

    const handleZoomIn = () => { mapInstanceRef.current?.zoomIn(); };
    const handleZoomOut = () => { mapInstanceRef.current?.zoomOut(); };

    return (
        <div style={{position: 'relative', height: '100%', width: '100%'}}>
            <div ref={mapRef} className='map'></div>
            <div className='map-zoom-controls'>
                <button className='map-zoom-button' type='button' onClick={handleZoomIn} aria-label='Hineinzoomen'>+</button>
                <button className='map-zoom-button' type='button' onClick={handleZoomOut} aria-label='Herauszoomen'>−</button>
            </div>
        </div>
    )
};

export default Map;