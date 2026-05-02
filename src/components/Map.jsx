import React, { useEffect, useRef } from "react";
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

const Map = ({ currentLocation, startPoint, targetPoint, startMode, mapFocus, onMapClick}) => {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);

    const currentLocationMarkerRef = useRef(null);
    const startMarkerRef = useRef(null);
    const targetMarkerRef = useRef(null);

    // Keeps the latest click handler available without reinitializing the
    // Leaflet map.
    const onMapClickRef = useRef(onMapClick);

    useEffect(() => {
        onMapClickRef.current = onMapClick;
    }, [onMapClick])

    // Initializes the Leaflet map once.
    useEffect(() => {
        if (mapInstanceRef.current)
            return;

        const initialCenter = currentLocation ? [currentLocation.lat, currentLocation.lng] : DEFAULT_CENTER;
        const initialZoom = currentLocation ? 16 : DEFAULT_ZOOM;

        const map = L.map(mapRef.current, {
            zoomControl: false,
            attributionControl: false,
            preferCanvas: true
        }).setView(initialCenter, initialZoom)
        L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png', {
            maxZoom: 20,
            detectRetina: true
        }).addTo(map);
        
        map.on('click', (event) => {
            if (!onMapClickRef.current)
                return;

            onMapClickRef.current({
                lat: event.latlng.lat,
                lng: event.latlng.lng
            });
        });

        mapInstanceRef.current = map;

        // corrects map size after rendering
        setTimeout(() => {
            map.invalidateSize();
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

    // Moves the map only when the parent explicitly requests a focus change.
    useEffect(() => {
        const map = mapInstanceRef.current;

        if (!map || !mapFocus?.point)
            return;

        map.flyTo([mapFocus.point.lat, mapFocus.point.lng], mapFocus.zoom ?? 17, {
            animate: true,
            duration: 0.8
        })
    }, [mapFocus]);

    return <div ref={mapRef} className='map'></div>
};

export default Map;