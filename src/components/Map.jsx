import React, { useEffect, useRef } from "react";
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';


const Map = () => {
    /**
     * Map-Component
     * 
     * Component that renders a leaflet card with OpenStreetMap.
     */
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);

    useEffect(() => {
        if (mapInstanceRef.current)
            return;

        const map = L.map(mapRef.current, {
            zoomControl: false,
            attributionControl: false,
            preferCanvas: true
        }).setView([47.6519, 9.4786], 13) // Friedrichshafen
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 15,
            detectRetina: true
        }).addTo(map);

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

    return <div ref={mapRef} className='map'></div>
};

export default Map;