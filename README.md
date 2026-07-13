# Navix – Navigation & Explore

Navix ist eine kartenbasierte Progressive Web App (PWA) mit Geocoding, Wikipedia-Integration, Points of Interest und Routing.

## Voraussetzungen

- [Node.js](https://nodejs.org/) ≥ 18
- npm (wird mit Node.js mitgeliefert)

---

## Setup

```bash
# 1. Repository klonen
git clone https://github.com/Fybii/WebEng2
cd navix

# 2. Abhängigkeiten installieren
npm install
```
---

## Anwendung starten

### Produktion (empfohlen für Abgabe / Bewertung)

```bash
npm run build     # Produktions-Bundle erstellen (Ausgabe: dist/)
npm run preview   # Produktions-Bundle lokal unter http://localhost:4173 servieren
```

### Entwicklung

```bash
npm run dev       # Dev-Server mit Hot-Reload unter http://localhost:5173
```

---

## Demo-Flow

1. App öffnet sich mit einer interaktiven Karte (OpenStreetMap)
2. **Suche**: Adresse oder Ort im Suchfeld eingeben → Ergebnis auf Karte zentrieren
3. **POIs**: Kategorie (z. B. Restaurants, Tankstellen) auswählen → Pins auf der Karte
4. **Wikipedia**: POI oder Ort antippen → Wikipedia-Info-Karte öffnet sich
5. **Routing**: Start- und Zielpunkt setzen → Route mit Abbiegehinweisen berechnen
6. **PWA-Installation**: Browser-Banner oder „Zum Startbildschirm hinzufügen" nutzen

---

## Projektstruktur

```
src/
  components/   # React-Komponenten (Karte, Suche, Navigation, POI, …)
  services/     # API-Anbindungen (Nominatim, ORS, Wikipedia, …)
  styles/       # Globale CSS-Variablen und Layout
```

---

## Secrets / Umgebungsvariablen

| Variable | Beschreibung |
|---|---|
| `VITE_ORS_API_KEY` | API-Key für [OpenRouteService](https://openrouteservice.org/) (Routing) |

---

## Anmerkung zum API-Key

Normalerweise werden API-Keys nicht im Repository committet. Für dieses Projekt haben wir dennoch den funktionierenden OpenRouteService-Key committed, um:
- Die Bewertung zu vereinfachen (kein zusätzlicher Setup-Schritt für Sie als Dozenten nötig)
- Sofortiges Testen aller Funktionen zu ermöglichen
- Den Aufwand für die Abgabe zu minimieren

In produktiven Anwendungen sollte `VITE_ORS_API_KEY` immer über `.env` lokal verwaltet und niemals committet werden.