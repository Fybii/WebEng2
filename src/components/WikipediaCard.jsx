import { useState } from "react";

import {
  calculateHaversineDistanceInKilometers,
  formatDistance,
  formatEstimatedDrivingDuration,
  formatProximity,
} from "../services/utils";

import "./css/WikipediaCard.css";

// ── Icons ─────────────────────────────────

const WikiIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.09 2.91C10.08 2.91 8.37 3.61 6.93 5L5.16 3.23C3.65 4.87 2.49 7.11 2.09 9.67L4.05 10c.3-1.96 1.1-3.65 2.28-4.97l1.56 1.56C6.94 7.57 6.5 8.72 6.5 10a5.5 5.5 0 005.5 5.5c3.04 0 5.5-2.46 5.5-5.5S15.04 4.5 12 4.5c-.39 0-.77.04-1.14.1l-.95-1.59c.67-.15 1.37-.1 2.09-.1 4.14 0 7.5 3.36 7.5 7.5S16.14 17.5 12 17.5 4.5 14.14 4.5 10c0-.41.03-.81.08-1.2L2.6 8.5A10.08 10.08 0 002 10c0 5.52 4.48 10 10 10s10-4.48 10-10S17.52 0 12 0c-1.4 0-2.74.29-3.95.8l1.2 1.62c.88-.33 1.83-.51 2.84-.51z"/>
  </svg>
);

const RouteIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 3L3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z"/>
  </svg>
);

const CopyIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
  </svg>
);

const ExternalIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
  </svg>
);

const SaveIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4zm-5 16a3 3 0 110-6 3 3 0 010 6zm3-10H5V5h10v4z"/>
  </svg>
);

const ShareIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81a3 3 0 000-6 3 3 0 00-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9a3 3 0 000 6c.79 0 1.5-.31 2.04-.81l7.12 4.15c-.05.21-.08.43-.08.66a3 3 0 103-3z"/>
  </svg>
);

// ── Ladezustand ─────────────────────────────────

function WikiSkeleton() {
  return (
    <div className="wiki-skeleton">
      <div className="wiki-skeleton__header" />

      <div className="wiki-skeleton__body">
        <div className="wiki-skeleton__title" />

        <div className="wiki-skeleton__stat-row">
          <div className="wiki-skeleton__stat" />
          <div className="wiki-skeleton__stat" />
          <div className="wiki-skeleton__stat" />
        </div>

        <div className="wiki-skeleton__line" />
        <div className="wiki-skeleton__line wiki-skeleton__line--short" />
      </div>
    </div>
  );
}

// ── Leerer Zustand ─────────────────────────────────

function WikiEmpty() {
  return (
    <div className="wiki-empty">
      <div className="wiki-empty__icon">
        🗺️
      </div>

      <p className="wiki-empty__title">
        Ort auswählen
      </p>

      <p className="wiki-empty__hint">
        Tippe auf einen Punkt auf der Karte oder suche ein Ziel.
        Danach siehst du den Wikipedia-Artikel und kannst eine Route starten.
      </p>
    </div>
  );
}

// ── Hilfsfunktionen ─────────────────────────────────

function buildCoordinateString(location) {
  return `${location.latitude.toFixed(5)}° N, ${location.longitude.toFixed(5)}° O`;
}

function normalizeTagText(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function textIncludesAny(text, words) {
  const normalizedText = normalizeTagText(text);

  return words.some((word) =>
    normalizedText.includes(normalizeTagText(word))
  );
}

function addUniqueTag(tags, nextTag) {
  if (!nextTag?.label) {
    return;
  }

  const alreadyExists = tags.some((tag) => tag.label === nextTag.label);

  if (!alreadyExists) {
    tags.push(nextTag);
  }
}

function getLocationTypeTag(location) {
  const osmCategory = normalizeTagText(location?.osmCategory);
  const osmValue    = normalizeTagText(location?.osmValue);
  const addresstype = normalizeTagText(location?.addresstype);
  const name        = normalizeTagText(location?.name);

  const combinedText = [
    osmCategory,
    osmValue,
    addresstype,
    name,
    location?.fullAddress,
  ].join(" ");

  // ── Länder, Städte, Orte ─────────────────────────────

  if (addresstype === "country" || osmValue === "country") {
    return { label: "Land", color: "purple" };
  }

  if (
    addresstype === "state" ||
    addresstype === "region" ||
    osmValue === "administrative"
  ) {
    return { label: "Region", color: "purple" };
  }

  if (addresstype === "city" || osmValue === "city") {
    return { label: "Stadt", color: "purple" };
  }

  if (
    addresstype === "town" ||
    addresstype === "municipality" ||
    osmValue === "town" ||
    osmValue === "municipality"
  ) {
    return { label: "Gemeinde", color: "purple" };
  }

  if (
    addresstype === "village" ||
    addresstype === "hamlet" ||
    addresstype === "locality" ||
    osmValue === "village" ||
    osmValue === "hamlet" ||
    osmValue === "locality"
  ) {
    return { label: "Ort", color: "purple" };
  }

  if (
    addresstype === "road" ||
    addresstype === "house" ||
    addresstype === "building"
  ) {
    return { label: "Adresse", color: "slate" };
  }

  // ── Geschäfte ─────────────────────────────

  if (
    osmCategory === "shop" ||
    textIncludesAny(combinedText, [
      "edeka",
      "rewe",
      "lidl",
      "aldi",
      "norma",
      "kaufland",
      "penny",
      "netto",
      "supermarket",
    ])
  ) {
    if (
      osmValue === "supermarket" ||
      textIncludesAny(combinedText, [
        "edeka",
        "rewe",
        "lidl",
        "aldi",
        "norma",
        "kaufland",
        "penny",
        "netto",
        "supermarket",
      ])
    ) {
      return { label: "Supermarkt", color: "green" };
    }

    if (
      osmValue === "chemist" ||
      textIncludesAny(combinedText, ["dm", "rossmann", "drogerie"])
    ) {
      return { label: "Drogerie", color: "green" };
    }

    if (
      osmValue === "hardware" ||
      textIncludesAny(combinedText, ["obi", "hornbach", "baumarkt"])
    ) {
      return { label: "Baumarkt", color: "green" };
    }

    if (osmValue === "bakery") {
      return { label: "Bäckerei", color: "green" };
    }

    if (osmValue === "clothes") {
      return { label: "Kleidung", color: "green" };
    }

    return { label: "Geschäft", color: "green" };
  }

  // ── Essen & Trinken ─────────────────────────────

  if (
    osmValue === "restaurant" ||
    textIncludesAny(combinedText, ["restaurant"])
  ) {
    return { label: "Restaurant", color: "orange" };
  }

  if (
    osmValue === "fast_food" ||
    textIncludesAny(combinedText, ["mcdonald", "burger king", "kfc", "subway"])
  ) {
    return { label: "Fast Food", color: "orange" };
  }

  if (osmValue === "cafe" || textIncludesAny(combinedText, ["cafe", "café"])) {
    return { label: "Café", color: "orange" };
  }

  if (osmValue === "bar" || osmValue === "pub") {
    return { label: "Bar", color: "orange" };
  }

  // ── Verkehr & Reise ─────────────────────────────

  if (osmValue === "fuel") {
    return { label: "Tankstelle", color: "red" };
  }

  if (osmValue === "parking") {
    return { label: "Parkplatz", color: "slate" };
  }

  if (
    osmValue === "hotel" ||
    osmCategory === "tourism" && osmValue === "hotel"
  ) {
    return { label: "Hotel", color: "cyan" };
  }

  if (
    osmValue === "station" ||
    osmValue === "train_station" ||
    textIncludesAny(combinedText, ["bahnhof"])
  ) {
    return { label: "Bahnhof", color: "cyan" };
  }

  if (
    osmValue === "airport" ||
    osmValue === "aerodrome" ||
    textIncludesAny(combinedText, ["flughafen"])
  ) {
    return { label: "Flughafen", color: "cyan" };
  }

  // ── Gesundheit ─────────────────────────────

  if (osmValue === "pharmacy") {
    return { label: "Apotheke", color: "red" };
  }

  if (osmValue === "hospital") {
    return { label: "Krankenhaus", color: "red" };
  }

  if (
    osmValue === "doctors" ||
    osmValue === "dentist" ||
    osmValue === "clinic"
  ) {
    return { label: "Medizin", color: "red" };
  }

  // ── Bildung / Öffentlich ─────────────────────────────

  if (osmValue === "school") {
    return { label: "Schule", color: "yellow" };
  }

  if (osmValue === "university" || osmValue === "college") {
    return { label: "Bildung", color: "yellow" };
  }

  if (
    osmValue === "bank" ||
    osmValue === "atm"
  ) {
    return { label: "Bank", color: "slate" };
  }

  if (
    osmValue === "townhall" ||
    osmValue === "courthouse" ||
    osmValue === "police"
  ) {
    return { label: "Öffentlich", color: "slate" };
  }

  // ── Kultur, Freizeit, Natur ─────────────────────────────

  if (
    osmCategory === "tourism" ||
    osmValue === "attraction" ||
    osmValue === "viewpoint"
  ) {
    return { label: "Sehenswürdigkeit", color: "pink" };
  }

  if (osmValue === "museum") {
    return { label: "Museum", color: "pink" };
  }

  if (
    osmCategory === "historic" ||
    osmValue === "castle" ||
    osmValue === "monument" ||
    osmValue === "memorial"
  ) {
    return { label: "Historisch", color: "pink" };
  }

  if (
    osmValue === "park" ||
    osmValue === "garden" ||
    osmCategory === "leisure"
  ) {
    return { label: "Freizeit", color: "emerald" };
  }

  if (
    osmCategory === "natural" ||
    osmValue === "beach" ||
    osmValue === "wood" ||
    osmValue === "water" ||
    osmValue === "peak"
  ) {
    return { label: "Natur", color: "emerald" };
  }

  if (
    osmValue === "place_of_worship" ||
    textIncludesAny(combinedText, ["kirche", "moschee", "synagoge"])
  ) {
    return { label: "Religion", color: "purple" };
  }

  return null;
}

function getDistanceTag(distanceInKilometers) {
  if (distanceInKilometers === null) {
    return null;
  }

  if (distanceInKilometers < 1) {
    return { label: "Direkt in der Nähe", color: "green" };
  }

  if (distanceInKilometers < 5) {
    return { label: "Nahe Standort", color: "green" };
  }

  if (distanceInKilometers < 25) {
    return { label: "In der Umgebung", color: "cyan" };
  }

  if (distanceInKilometers < 150) {
    return { label: "Tagesziel", color: "orange" };
  }

  return { label: "Fernziel", color: "slate" };
}

function getWikipediaSourceTag(wikiData) {
  if (!wikiData) {
    return null;
  }

  if (wikiData.searchSource === "text") {
    return { label: "Passender Artikel", color: "blue" };
  }

  if (wikiData.searchSource === "coordinates") {
    return { label: "Artikel in der Nähe", color: "blue" };
  }

  return { label: "Wikipedia", color: "blue" };
}

function buildWikiTags({ distanceInKilometers, wikiData, location }) {
  const tags = [];

  addUniqueTag(tags, getLocationTypeTag(location));
  addUniqueTag(tags, getDistanceTag(distanceInKilometers));
  addUniqueTag(tags, getWikipediaSourceTag(wikiData));

  if (location?.country) {
    addUniqueTag(tags, {
      label: location.country,
      color: "slate",
    });
  }

  return tags;
}

function getLocationSubtitle(location, proximityLabel) {
  const locationText = location.city || location.shortAddress || "";

  if (!proximityLabel || proximityLabel === "-") {
    return locationText;
  }

  return [locationText, proximityLabel].filter(Boolean).join(" · ");
}

// ── WikipediaCard ─────────────────────────────────

function WikipediaCard({
  location,
  wikiData,
  isLoading,
  currentLocation,
  startLocation,
  onRouteRequest,
  onClose,
  isMobileSheet = false,
}) {
  const [hasCopiedCoordinates, setHasCopiedCoordinates] = useState(false);

  if (!location && !isLoading) {
    return <WikiEmpty />;
  }

  if (isLoading) {
    return <WikiSkeleton />;
  }

  const effectiveStartLocation = startLocation ?? currentLocation;

  const distanceInKilometers = effectiveStartLocation
    ? calculateHaversineDistanceInKilometers(
        effectiveStartLocation.latitude,
        effectiveStartLocation.longitude,
        location.latitude,
        location.longitude
      )
    : null;

  const distanceLabel  = distanceInKilometers !== null ? formatDistance(distanceInKilometers) : "-";
  const durationLabel  = distanceInKilometers !== null ? formatEstimatedDrivingDuration(distanceInKilometers) : "-";
  const proximityLabel = distanceInKilometers !== null ? formatProximity(distanceInKilometers) : "-";

  const tags             = buildWikiTags({ distanceInKilometers, wikiData, location });
  const coordinateString = buildCoordinateString(location);
  const cardClassName    = isMobileSheet ? "wiki-card wiki-card--sheet" : "wiki-card";

  const headerStyle = wikiData?.thumbnail
    ? {
        backgroundImage: `url(${wikiData.thumbnail})`,
      }
    : undefined;

  function handleCopyCoordinates() {
    navigator.clipboard.writeText(coordinateString).then(() => {
      setHasCopiedCoordinates(true);

      window.setTimeout(() => {
        setHasCopiedCoordinates(false);
      }, 2000);
    });
  }

  function handleShare() {
    navigator.share?.({
      title: location.name,
      text:  wikiData?.extract?.slice(0, 100),
      url:   wikiData?.url,
    });
  }

  return (
    <div className={cardClassName}>
      <div
        className="wiki-card__header"
        style={headerStyle}
      >
        <div className="wiki-card__header-overlay" />

        <div className="wiki-card__header-content">
          <h2 className="wiki-card__place-name">
            {location.name}
          </h2>

          <p className="wiki-card__place-subtitle">
            {getLocationSubtitle(location, proximityLabel)}
          </p>
        </div>
      </div>

      <div className="wiki-card__stats">
        <div className="wiki-card__stat">
          <span className="wiki-card__stat-value">
            {distanceLabel}
          </span>

          <span className="wiki-card__stat-label">
            Entfernung
          </span>
        </div>

        <div className="wiki-card__stat-divider" />

        <div className="wiki-card__stat">
          <span className="wiki-card__stat-value">
            {durationLabel}
          </span>

          <span className="wiki-card__stat-label">
            geschätzt
          </span>
        </div>
      </div>

      <div className="wiki-card__body">
        {tags.length > 0 && (
          <div className="wiki-card__tags">
            {tags.map((tag) => (
              <span
                key={tag.label}
                className={`wiki-card__tag wiki-card__tag--${tag.color}`}
              >
                {tag.label}
              </span>
            ))}
          </div>
        )}

        <div className="wiki-card__coordinates">
          <span className="wiki-card__coordinates-text">
            📍 {coordinateString}
          </span>

          <button
            className={`wiki-card__copy-button ${
              hasCopiedCoordinates ? "wiki-card__copy-button--done" : ""
            }`}
            onClick={handleCopyCoordinates}
            type="button"
          >
            {hasCopiedCoordinates ? (
              "✓ Kopiert"
            ) : (
              <>
                <CopyIcon />
                Kopieren
              </>
            )}
          </button>
        </div>

        {wikiData ? (
          <div className="wiki-card__wiki">
            <div className="wiki-card__wiki-label">
              <WikiIcon />
              Wikipedia
            </div>

            <div className="wiki-card__wiki-inner">
              {wikiData.thumbnail && (
                <img
                  src={wikiData.thumbnail}
                  alt={wikiData.title}
                  className="wiki-card__wiki-thumbnail"
                />
              )}

              <div className="wiki-card__wiki-text">
                <p className="wiki-card__wiki-title">
                  {wikiData.title}
                </p>

                <p className="wiki-card__wiki-extract">
                  {wikiData.extract}
                </p>

                <a
                  href={wikiData.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="wiki-card__wiki-link"
                >
                  Auf Wikipedia lesen
                  <ExternalIcon />
                </a>
              </div>
            </div>
          </div>
        ) : (
          <p className="wiki-card__no-wiki">
            Kein Wikipedia-Artikel für diesen Ort gefunden.
          </p>
        )}

        <button
          type="button"
          className="wiki-card__route-button"
          onClick={onRouteRequest}
          disabled={!currentLocation}
        >
          <RouteIcon />
          Route berechnen
        </button>

        <div className="wiki-card__actions">
          <button
            type="button"
            className="wiki-card__action-button"
            onClick={handleShare}
          >
            <ShareIcon />
            Teilen
          </button>
        </div>

        {isMobileSheet && (
          <button
            type="button"
            className="wiki-card__close-button"
            onClick={onClose}
          >
            Schließen
          </button>
        )}
      </div>
    </div>
  );
}

export default WikipediaCard;