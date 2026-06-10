import { useState } from "react";

import {
  formatRouteDistance,
  formatRouteDuration,
} from "../services/utils";

import "./css/RoutePanel.css";

// ── Konstanten ─────────────────────────────────

const MAX_VISIBLE_TRAFFIC_INCIDENTS = 6;

// ── Icons ─────────────────────────────────

const SaveIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4zm-5 16a3 3 0 110-6 3 3 0 010 6zm3-10H5V5h10v4z" />
  </svg>
);

const CarIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
  </svg>
);

const BikeIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM5 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zm5.8-10l2.4-2.4.8.8c1.3 1.3 3 2.1 5.1 2.1V9c-1.5 0-2.7-.6-3.6-1.5l-1.9-1.9c-.5-.4-1-.6-1.6-.6s-1.1.2-1.4.6L7.8 8.4c-.4.4-.6.9-.6 1.4 0 .6.2 1.1.6 1.4L11 14v5h2v-6.2l-2.2-2.3zM19 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5z" />
  </svg>
);

const WalkIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7z" />
  </svg>
);

const CloseIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

const StartPointIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M12 2C8.14 2 5 5.14 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z" />
  </svg>
);

const TargetPointIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M5 3v18h2v-7h9l-1-4 1-4H7V3H5z" />
  </svg>
);

function ChevronIcon({ isOpen }) {
  const chevronClassName = [
    "route-panel__chevron",
    isOpen ? "route-panel__chevron--open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      className={chevronClassName}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
    </svg>
  );
}

// ── Routenoptionen ─────────────────────────────────

const ROUTE_PROFILES = [
  {
    id:    "driving",
    label: "Auto",
    Icon:  CarIcon,
  },
  {
    id:    "cycling",
    label: "Rad",
    Icon:  BikeIcon,
  },
  {
    id:    "walking",
    label: "Zu Fuß",
    Icon:  WalkIcon,
  },
];

const ROUTE_PREFERENCES = [
  {
    id:    "fastest",
    label: "Schnellste",
  },
  {
    id:    "shortest",
    label: "Kürzeste",
  },
  {
    id:    "no_motorway",
    label: "Ohne Autobahn",
  },
];

// ── Hilfsfunktionen ─────────────────────────────────

function buildClassName(classNames) {
  return classNames
    .filter(Boolean)
    .join(" ");
}

function getSelectedRoute(routeData, selectedLegIndex) {
  const isMultiStopRoute = routeData?.mode === "multi";

  if (isMultiStopRoute) {
    const selectedLeg = routeData.legs?.[selectedLegIndex] ?? routeData.legs?.[0];

    return {
      distance: routeData.totalDistance ?? 0,
      duration: routeData.totalDuration ?? 0,
      summary:  selectedLeg?.summary ?? "",
      steps:    selectedLeg?.steps ?? [],
    };
  }

  const selectedRouteIndex = routeData?.selectedIndex ?? 0;

  return routeData?.routes?.[selectedRouteIndex] ?? null;
}

function buildWeatherDetails(snapshot) {
  const details = [];

  if (snapshot.windSpeed != null) {
    details.push(`${Math.round(snapshot.windSpeed)} km/h Wind`);
  }

  if (snapshot.precipitationProbability != null) {
    details.push(`${Math.round(snapshot.precipitationProbability)} % Regen`);
  } else if (snapshot.precipitation != null && snapshot.precipitation > 0) {
    details.push(`${snapshot.precipitation} mm Niederschlag`);
  } else if (snapshot.humidity != null) {
    details.push(`${Math.round(snapshot.humidity)} % Luftfeuchtigkeit`);
  }

  return details;
}

// ── RoutePanel ─────────────────────────────────

function RoutePanel({
  routeData,
  isLoading,
  error,
  profile,
  preference,
  onProfileChange,
  onPreferenceChange,
  onSelectRoute,
  onClose,
  canStartNavigation,
  onStartNavigation,
  onSaveRoute,
  targetLocationName,
  destinationWeather,
  isWeatherLoading,
  weatherError,
  waypoints = [],
  onAddWaypoint,
  onRemoveWaypoint,
  selectedLegIndex = 0,
  onSelectLeg,
  trafficIncidents = [],
  areTrafficIncidentsLoading = false,
}) {
  const [areRouteStepsVisible, setAreRouteStepsVisible] = useState(false);
  const [isNamingRoute, setIsNamingRoute]               = useState(false);
  const [routeNameInput, setRouteNameInput]             = useState("");

  const isMultiStopRoute       = routeData?.mode === "multi";
  const routeLegs              = routeData?.legs ?? [];
  const routes                 = routeData?.routes ?? [];
  const selectedRouteIndex     = routeData?.selectedIndex ?? 0;
  const selectedRoute          = getSelectedRoute(routeData, selectedLegIndex);
  const hasWaypoints           = waypoints.length > 0;
  const hasRouteAlternatives   = !isMultiStopRoute && routes.length > 1;
  const hasSelectedRoute       = Boolean(selectedRoute);
  const shouldShowContent      = hasSelectedRoute && !isLoading && !error;
  const shouldShowPreferences  = profile === "driving";
  const shouldShowWeather      = isWeatherLoading || destinationWeather || weatherError;
  const shouldShowTraffic      = profile === "driving" && shouldShowContent;

  const visibleTrafficIncidents = trafficIncidents.slice(
    0,
    MAX_VISIBLE_TRAFFIC_INCIDENTS
  );

  const hiddenTrafficIncidentCount =
    trafficIncidents.length - visibleTrafficIncidents.length;

  // ── Event-Handler ─────────────────────────────────

  function toggleRouteSteps() {
    setAreRouteStepsVisible((currentVisibility) => {
      return !currentVisibility;
    });
  }

  function handleSaveButtonClick() {
    setRouteNameInput(targetLocationName ?? "");
    setIsNamingRoute(true);
  }

  function handleSaveConfirm() {
    onSaveRoute(routeNameInput.trim() || targetLocationName);
    setIsNamingRoute(false);
    setRouteNameInput("");
  }

  function handleSaveCancel() {
    setIsNamingRoute(false);
    setRouteNameInput("");
  }

  function handleRouteNameInputKeyDown(event) {
    if (event.key === "Enter") {
      handleSaveConfirm();
    }

    if (event.key === "Escape") {
      handleSaveCancel();
    }
  }

  // ── Render-Hilfsfunktionen ─────────────────────────────────

  function renderProfileButton({ id, label, Icon }) {
    const buttonClassName = buildClassName([
      "route-panel__profile-button",
      profile === id ? "is-active" : "",
    ]);

    return (
      <button
        key={id}
        className={buttonClassName}
        onClick={() => {
          onProfileChange(id);
        }}
        type="button"
      >
        <Icon />

        <span>
          {label}
        </span>
      </button>
    );
  }

  function renderPreferenceButton({ id, label }) {
    const buttonClassName = buildClassName([
      "route-panel__preference-button",
      preference === id ? "is-active" : "",
    ]);

    return (
      <button
        key={id}
        type="button"
        className={buttonClassName}
        onClick={() => {
          onPreferenceChange(id);
        }}
      >
        {label}
      </button>
    );
  }

  function renderWeatherSnapshot(snapshot) {
    if (!snapshot) {
      return null;
    }

    const details = buildWeatherDetails(snapshot);

    return (
      <div className="rp-weather-row">
        <span className="rp-weather-icon">
          {snapshot.icon}
        </span>

        <div className="rp-weather-copy">
          <span className="rp-weather-main">
            {snapshot.temperatureText} · {snapshot.description}
          </span>

          <span className="rp-weather-sub">
            {snapshot.label}
            {snapshot.timeLabel ? ` (${snapshot.timeLabel})` : ""}
            {details.length > 0 ? ` ${details.join(" · ")}` : ""}
          </span>
        </div>
      </div>
    );
  }

  function renderRouteStopBadge(stopIndex) {
    const waypointCount = waypoints.length;

    if (stopIndex === 0) {
      return (
        <span className="route-panel__leg-badge route-panel__leg-badge--start">
          <StartPointIcon />
        </span>
      );
    }

    if (stopIndex <= waypointCount) {
      return (
        <span className="route-panel__leg-badge">
          {stopIndex}
        </span>
      );
    }

    return (
      <span className="route-panel__leg-badge route-panel__leg-badge--target">
        <TargetPointIcon />
      </span>
    );
  }

  function renderRouteAlternativeButton(route, routeIndex) {
    const buttonClassName = buildClassName([
      "route-panel__alternative-button",
      routeIndex === selectedRouteIndex ? "is-active" : "",
    ]);

    return (
      <button
        key={`${route.duration}-${route.distance}-${routeIndex}`}
        className={buttonClassName}
        onClick={() => {
          onSelectRoute(routeIndex);
        }}
        type="button"
      >
        <span className="route-panel__alternative-duration">
          {formatRouteDuration(route.duration)}
        </span>

        <span className="route-panel__alternative-distance">
          {formatRouteDistance(route.distance)}
        </span>
      </button>
    );
  }

  function renderRouteLegButton(leg, legIndex) {
    const buttonClassName = buildClassName([
      "route-panel__leg",
      legIndex === selectedLegIndex ? "is-active" : "",
    ]);

    return (
      <button
        key={legIndex}
        type="button"
        className={buttonClassName}
        onClick={() => {
          onSelectLeg(legIndex);
        }}
      >
        <span className="route-panel__leg-route">
          {renderRouteStopBadge(legIndex)}

          <span className="route-panel__leg-arrow">
            →
          </span>

          {renderRouteStopBadge(legIndex + 1)}
        </span>

        <span className="route-panel__leg-meta">
          {formatRouteDuration(leg.duration)} · {formatRouteDistance(leg.distance)}
        </span>
      </button>
    );
  }

  function renderTrafficIncident(incident) {
    return (
      <li
        key={incident.identifier}
        className="route-panel__traffic-item"
      >
        <span className="route-panel__traffic-icon">
          {incident.icon}
        </span>

        <span className="route-panel__traffic-text">
          <span className="route-panel__traffic-name">
            {incident.title}
          </span>

          {incident.subtitle && (
            <span className="route-panel__traffic-subtitle">
              {incident.subtitle}
            </span>
          )}
        </span>
      </li>
    );
  }

  function renderRouteStep(step, stepIndex) {
    return (
      <li
        key={step.index ?? stepIndex}
        className="route-panel__step"
      >
        <span className="route-panel__step-icon">
          {step.icon}
        </span>

        <div className="route-panel__step-text">
          <span className="route-panel__step-instruction">
            {step.instruction}
          </span>

          {step.distance > 0 && (
            <span className="route-panel__step-distance">
              {formatRouteDistance(step.distance)}
            </span>
          )}
        </div>
      </li>
    );
  }

  function renderWaypoint(waypoint, waypointIndex) {
    const waypointNumber = waypointIndex + 1;

    return (
      <li
        key={`${waypoint.latitude}-${waypoint.longitude}-${waypointIndex}`}
        className="route-panel__waypoint-item"
      >
        <span className="route-panel__waypoint-badge">
          {waypointNumber}
        </span>

        <span className="route-panel__waypoint-name">
          {waypoint.name}
        </span>

        <button
          type="button"
          className="route-panel__waypoint-remove"
          onClick={() => {
            onRemoveWaypoint(waypointIndex);
          }}
          aria-label="Zwischenstopp entfernen"
        >
          ×
        </button>
      </li>
    );
  }

  return (
    <div className="route-panel">
      <div className="route-panel__header">
        <div className="route-panel__profiles">
          {ROUTE_PROFILES.map(renderProfileButton)}
        </div>

        <button
          className="route-panel__close-button"
          onClick={onClose}
          type="button"
          aria-label="Route schließen"
        >
          <CloseIcon />
        </button>
      </div>

      {shouldShowPreferences && (
        <div className="route-panel__preferences">
          {ROUTE_PREFERENCES.map(renderPreferenceButton)}
        </div>
      )}

      {isLoading && (
        <div className="route-panel__loading">
          <div className="route-panel__spinner" />

          <span>
            Route wird berechnet...
          </span>
        </div>
      )}

      {error && !isLoading && (
        <div className="route-panel__error">
          {error}
        </div>
      )}

      {shouldShowContent && (
        <>
          <div className="route-panel__summary">
            <div className="route-panel__primary-values">
              <span className="route-panel__duration">
                {formatRouteDuration(selectedRoute.duration)}
              </span>

              <span className="route-panel__distance">
                {formatRouteDistance(selectedRoute.distance)}
              </span>
            </div>

            {selectedRoute.summary && (
              <span className="route-panel__via">
                über {selectedRoute.summary}
              </span>
            )}
          </div>

          {hasRouteAlternatives && (
            <div className="route-panel__alternatives">
              {routes.map(renderRouteAlternativeButton)}
            </div>
          )}

          {isMultiStopRoute && routeLegs.length > 0 && (
            <div className="route-panel__legs">
              {routeLegs.map(renderRouteLegButton)}
            </div>
          )}

          {shouldShowWeather && (
            <div className="rp-weather-section">
              {isWeatherLoading && (
                <div className="rp-weather-loading">
                  <div className="rp-weather-spinner" />

                  <span>
                    Wetter wird geladen...
                  </span>
                </div>
              )}

              {!isWeatherLoading && weatherError && (
                <p className="rp-weather-error">
                  {weatherError}
                </p>
              )}

              {!isWeatherLoading && destinationWeather && (
                <div className="rp-weather-card">
                  {renderWeatherSnapshot(destinationWeather.atArrival)}

                  {destinationWeather.now && (
                    <>
                      <div className="rp-weather-divider" />

                      {renderWeatherSnapshot(destinationWeather.now)}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {shouldShowTraffic && (
            <div className="route-panel__traffic">
              <p className="route-panel__traffic-title">
                Verkehrslage

                {trafficIncidents.length > 0 && (
                  <span className="route-panel__traffic-count">
                    {trafficIncidents.length}
                  </span>
                )}
              </p>

              {areTrafficIncidentsLoading ? (
                <p className="route-panel__traffic-loading">
                  Meldungen werden geladen…
                </p>
              ) : trafficIncidents.length > 0 ? (
                <ul className="route-panel__traffic-list">
                  {visibleTrafficIncidents.map(renderTrafficIncident)}

                  {hiddenTrafficIncidentCount > 0 && (
                    <li className="route-panel__traffic-more">
                      +{hiddenTrafficIncidentCount} weitere relevante Meldungen
                    </li>
                  )}
                </ul>
              ) : (
                <p className="route-panel__traffic-empty">
                  Keine aktuellen deutschen Autobahnmeldungen auf dieser Route gefunden.
                </p>
              )}
            </div>
          )}

          {selectedRoute.steps?.length > 0 && (
            <div className="route-panel__steps-section">
              <button
                className="route-panel__steps-toggle"
                onClick={toggleRouteSteps}
                type="button"
              >
                <span>
                  {areRouteStepsVisible
                    ? "Wegbeschreibung ausblenden"
                    : `${selectedRoute.steps.length} Schritte anzeigen`}
                </span>

                <ChevronIcon isOpen={areRouteStepsVisible} />
              </button>

              {areRouteStepsVisible && (
                <ul className="route-panel__steps">
                  {selectedRoute.steps.map(renderRouteStep)}
                </ul>
              )}
            </div>
          )}

          <div className="route-panel__waypoints">
            {hasWaypoints && (
              <ul className="route-panel__waypoint-list">
                {waypoints.map(renderWaypoint)}
              </ul>
            )}

            {onAddWaypoint && (
              <button
                type="button"
                className="route-panel__add-waypoint"
                onClick={onAddWaypoint}
              >
                + Zwischenstopp hinzufügen
              </button>
            )}
          </div>

          <div className="route-panel__actions">
            <button
              type="button"
              className="route-panel__start-navigation-button"
              onClick={onStartNavigation}
              disabled={!canStartNavigation}
              title={!canStartNavigation ? "Nur mit GPS-Standort möglich" : undefined}
            >
              ▶ Navigation starten
            </button>

            <button
              type="button"
              className="route-panel__save-button"
              onClick={handleSaveButtonClick}
            >
              <SaveIcon />
              Speichern
            </button>
          </div>

          {isNamingRoute && (
            <div className="route-panel__naming">
              <input
                className="route-panel__name-input"
                type="text"
                value={routeNameInput}
                onChange={(event) => {
                  setRouteNameInput(event.target.value);
                }}
                onKeyDown={handleRouteNameInputKeyDown}
                placeholder="Routenname..."
                autoFocus
              />

              <div className="route-panel__naming-actions">
                <button
                  type="button"
                  className="route-panel__name-confirm-button"
                  onClick={handleSaveConfirm}
                >
                  ✓ Speichern
                </button>

                <button
                  type="button"
                  className="route-panel__name-cancel-button"
                  onClick={handleSaveCancel}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default RoutePanel;