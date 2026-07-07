# Navix – Navigation & Explore

Navix ist eine kartenbasierte Progressive Web App (PWA) mit Geocoding, Wikipedia-Integration, Points of Interest und Routing.

## Voraussetzungen

- [Node.js](https://nodejs.org/) ≥ 18
- npm (wird mit Node.js mitgeliefert)
- Einen kostenlosen API-Key von [OpenRouteService](https://openrouteservice.org/dev/#/signup) (für die Routing-Funktion)

---

## Setup

```bash
# 1. Repository klonen
git clone <repo-url>
cd navix

# 2. Abhängigkeiten installieren
npm install

# 3. Umgebungsvariablen anlegen
cp .env.example .env
# .env öffnen und VITE_ORS_API_KEY mit dem eigenen Key befüllen
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

Die Datei `.env` wird **nicht** ins Repository eingecheckt (steht in `.gitignore`).  
Die Vorlage `.env.example` zeigt alle benötigten Variablen ohne Werte.

| Variable | Beschreibung |
|---|---|
| `VITE_ORS_API_KEY` | API-Key für [OpenRouteService](https://openrouteservice.org/) (Routing) |
