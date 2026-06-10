import { useCallback, useEffect, useRef, useState } from "react";

import { searchAddress } from "../services/nominatim.js";

import "./css/SearchCard.css";

// ── Icons ─────────────────────────────────

function SearchIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="8" cy="6" r="1.6" />
      <circle cx="16" cy="6" r="1.6" />
      <circle cx="8" cy="12" r="1.6" />
      <circle cx="16" cy="12" r="1.6" />
      <circle cx="8" cy="18" r="1.6" />
      <circle cx="16" cy="18" r="1.6" />
    </svg>
  );
}

// ── Hilfsfunktionen ─────────────────────────────────

function buildClassName(classNames) {
  return classNames
    .filter(Boolean)
    .join(" ");
}

function focusInputAfterRender(inputElementRef, delayInMilliseconds = 30) {
  window.setTimeout(() => {
    inputElementRef.current?.focus();
  }, delayInMilliseconds);
}

function createSuggestionKey(suggestion, suggestionIndex) {
  return [
    suggestion.name,
    suggestion.city,
    suggestion.country,
    suggestion.latitude,
    suggestion.longitude,
    suggestionIndex,
  ]
    .filter(Boolean)
    .join("-");
}

function createStopKey(stop, fallbackIndex) {
  return [
    stop.latitude,
    stop.longitude,
    stop.name,
    fallbackIndex,
  ]
    .filter(Boolean)
    .join("-");
}

// ── Adresssuche-Hook ─────────────────────────────────

function useAddressSearch(locationBias = null) {
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const searchDebounceTimeoutRef = useRef(null);
  const searchRequestIdRef       = useRef(0);

  const clearSearchDebounceTimeout = useCallback(() => {
    window.clearTimeout(searchDebounceTimeoutRef.current);
  }, []);

  const clear = useCallback(() => {
    searchRequestIdRef.current += 1;

    clearSearchDebounceTimeout();
    setSearchQuery("");
    setSuggestions([]);
    setIsSearching(false);
  }, [clearSearchDebounceTimeout]);

  const search = useCallback(
    (nextSearchQuery) => {
      const trimmedSearchQuery = nextSearchQuery.trim();

      setSearchQuery(nextSearchQuery);
      clearSearchDebounceTimeout();

      if (!trimmedSearchQuery) {
        setSuggestions([]);
        setIsSearching(false);
        return;
      }

      const requestId = searchRequestIdRef.current + 1;
      searchRequestIdRef.current = requestId;

      searchDebounceTimeoutRef.current = window.setTimeout(async () => {
        setIsSearching(true);

        try {
          const nextSuggestions = await searchAddress(
            trimmedSearchQuery,
            locationBias
          );

          if (requestId !== searchRequestIdRef.current) {
            return;
          }

          setSuggestions(nextSuggestions);
        } catch {
          if (requestId !== searchRequestIdRef.current) {
            return;
          }

          setSuggestions([]);
        } finally {
          if (requestId === searchRequestIdRef.current) {
            setIsSearching(false);
          }
        }
      }, 350);
    },
    [clearSearchDebounceTimeout, locationBias]
  );

  useEffect(() => {
    return () => {
      searchRequestIdRef.current += 1;
      clearSearchDebounceTimeout();
    };
  }, [clearSearchDebounceTimeout]);

  return {
    searchQuery,
    suggestions,
    isSearching,
    search,
    clear,
  };
}

// ── Suchfeld ─────────────────────────────────

function SearchField({
  inputElementRef,
  placeholder,
  displayValue,
  isFilled,
  fieldModifierClassName,
  focusedModifierClassName,
  clearButtonModifierClassName = "",
  isFocused,
  searchQuery,
  isSearching,
  onFocusActivate,
  onClear,
  onSearchQueryChange,
  onBlur,
}) {
  const shouldShowInputDirectly = !isFilled && !displayValue;

  const inputFieldClassName = buildClassName([
    "search-card__field",
    "search-card__field--input",
    isFocused ? focusedModifierClassName : "",
  ]);

  const filledFieldClassName = buildClassName([
    "search-card__field",
    fieldModifierClassName,
  ]);

  const clearButtonClassName = buildClassName([
    "search-card__clear-button",
    clearButtonModifierClassName,
  ]);

  function handleFilledFieldClick() {
    onClear();
    onFocusActivate();
    focusInputAfterRender(inputElementRef);
  }

  function handleFilledFieldKeyDown(event) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    handleFilledFieldClick();
  }

  function handleStaticFieldClick() {
    onFocusActivate();
    focusInputAfterRender(inputElementRef);
  }

  function handleStaticFieldKeyDown(event) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    handleStaticFieldClick();
  }

  function handleInputWrapperClick() {
    onFocusActivate();
    inputElementRef.current?.focus();
  }

  if (!isFocused && isFilled) {
    return (
      <div
        className={filledFieldClassName}
        onClick={handleFilledFieldClick}
        onKeyDown={handleFilledFieldKeyDown}
        role="button"
        tabIndex={0}
      >
        <span className="search-card__field-text">
          {displayValue}
        </span>

        <button
          className={clearButtonClassName}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onClear();
          }}
          aria-label="Eingabe löschen"
        >
          ×
        </button>
      </div>
    );
  }

  if (!isFocused && !shouldShowInputDirectly) {
    return (
      <div
        className="search-card__field search-card__field--static"
        onClick={handleStaticFieldClick}
        onKeyDown={handleStaticFieldKeyDown}
        role="button"
        tabIndex={0}
      >
        <span className="search-card__field-text">
          {displayValue}
        </span>
      </div>
    );
  }

  return (
    <div
      className={inputFieldClassName}
      onClick={handleInputWrapperClick}
    >
      <span className="search-card__search-icon">
        <SearchIcon />
      </span>

      <input
        ref={inputElementRef}
        type="text"
        className="search-card__input"
        placeholder={placeholder}
        value={searchQuery}
        onChange={(event) => {
          onSearchQueryChange(event.target.value);
        }}
        onFocus={onFocusActivate}
        onBlur={onBlur}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />

      {isSearching && (
        <div className="search-card__spinner" />
      )}
    </div>
  );
}

// ── Suchvorschläge ─────────────────────────────────

function SuggestionList({
  suggestions,
  badgeModifierClassName = "",
  onSuggestionSelect,
}) {
  return (
    <div className="search-card__suggestions">
      {suggestions.map((suggestion, suggestionIndex) => (
        <button
          key={createSuggestionKey(suggestion, suggestionIndex)}
          type="button"
          className="search-card__suggestion"
          onMouseDown={(event) => {
            event.preventDefault();
            onSuggestionSelect(suggestion);
          }}
        >
          <div className={`search-card__suggestion-dot ${badgeModifierClassName}`} />

          <div className="search-card__suggestion-text">
            <span className="search-card__suggestion-name">
              {suggestion.name || suggestion.displayName || "Unbekannter Ort"}
            </span>

            {(suggestion.city || suggestion.country) && (
              <span className="search-card__suggestion-subtitle">
                {[suggestion.city, suggestion.country]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

// ── SearchCard ─────────────────────────────────

function SearchCard({
  currentLocation,
  startLocation,
  targetLocation,
  waypoints = [],
  mapClickMode,
  onMapClickModeChange,
  onTargetSelect,
  onTargetClear,
  onBoundaryClear,
  onStartSelect,
  onStartClear,
  onWaypointSelect,
  onWaypointRemove,
  onRouteStopsReorder,
}) {
  const [isStartFieldFocused, setIsStartFieldFocused]       = useState(false);
  const [isTargetFieldFocused, setIsTargetFieldFocused]     = useState(false);
  const [isWaypointFieldFocused, setIsWaypointFieldFocused] = useState(false);

  const [draggedStopIndex, setDraggedStopIndex] = useState(null);
  const [dragOverStopIndex, setDragOverStopIndex] = useState(null);

  const startAddressSearch    = useAddressSearch(currentLocation);
  const targetAddressSearch   = useAddressSearch(currentLocation);
  const waypointAddressSearch = useAddressSearch(currentLocation);

  const startInputElementRef    = useRef(null);
  const targetInputElementRef   = useRef(null);
  const waypointInputElementRef = useRef(null);

  const startDisplayValue =
    startLocation?.name ??
    currentLocation?.name ??
    (currentLocation ? "Mein Standort" : "GPS wird gesucht...");

  const targetDisplayValue = targetLocation?.name ?? "";

  const targetStopIndex = waypoints.length + 1;

  const searchCardClassName = buildClassName([
    "search-card",
    targetLocation ? "search-card--sortable" : "",
  ]);

  // ── Fokus zurücksetzen ─────────────────────────────────

  function closeStartSearchAfterBlur() {
    window.setTimeout(() => {
      setIsStartFieldFocused(false);
      startAddressSearch.clear();
    }, 200);
  }

  function closeTargetSearchAfterBlur() {
    window.setTimeout(() => {
      setIsTargetFieldFocused(false);
      targetAddressSearch.clear();
    }, 200);
  }

  function closeWaypointSearchAfterBlur() {
    window.setTimeout(() => {
      setIsWaypointFieldFocused(false);
      waypointAddressSearch.clear();
    }, 200);
  }

  function closeAllSearchFields() {
    setIsStartFieldFocused(false);
    setIsTargetFieldFocused(false);
    setIsWaypointFieldFocused(false);
  }

  // ── Startpunkt ─────────────────────────────────

  function activateStartSearch() {
    closeAllSearchFields();

    setIsStartFieldFocused(true);
    onMapClickModeChange("start");
  }

  function selectStartSuggestion(suggestion) {
    startAddressSearch.clear();
    setIsStartFieldFocused(false);

    onStartSelect({
      latitude:  suggestion.latitude,
      longitude: suggestion.longitude,
      name:      suggestion.name || suggestion.displayName,
      city:      suggestion.city,
      country:   suggestion.country,
      osmId:     suggestion.osmId,
      osmType:   suggestion.osmType,
    });
  }

  function toggleStartMapClickMode() {
    const nextMapClickMode = mapClickMode === "start" ? "target" : "start";

    onMapClickModeChange(nextMapClickMode);

    if (nextMapClickMode === "start") {
      closeAllSearchFields();
      setIsStartFieldFocused(true);
      focusInputAfterRender(startInputElementRef, 50);
    }
  }

  // ── Zielpunkt ─────────────────────────────────

  function activateTargetSearch() {
    closeAllSearchFields();

    setIsTargetFieldFocused(true);
    onMapClickModeChange("target");
    onBoundaryClear?.();
  }

  function selectTargetSuggestion(suggestion) {
    const wikiSearchText =
      suggestion.name ||
      suggestion.displayName ||
      targetAddressSearch.searchQuery ||
      "";

    targetAddressSearch.clear();
    setIsTargetFieldFocused(false);

    onTargetSelect({
      latitude:       suggestion.latitude,
      longitude:      suggestion.longitude,
      name:           suggestion.name || suggestion.displayName,
      city:           suggestion.city,
      country:        suggestion.country,
      osmId:          suggestion.osmId,
      osmType:        suggestion.osmType,
      osmCategory:    suggestion.osmCategory,
      wikiSearchText,
    });
  }

  function activateTargetMapClickMode() {
    closeAllSearchFields();

    onMapClickModeChange("target");
    setIsTargetFieldFocused(true);
    focusInputAfterRender(targetInputElementRef, 50);
  }

  // ── Zwischenziel ─────────────────────────────────

  function activateWaypointSearch() {
    if (!targetLocation) {
      return;
    }

    closeAllSearchFields();

    setIsWaypointFieldFocused(true);
    onMapClickModeChange("waypoint");
    focusInputAfterRender(waypointInputElementRef, 50);
  }

  function activateWaypointSearchOnly() {
    if (!targetLocation) {
      return;
    }

    closeAllSearchFields();

    setIsWaypointFieldFocused(true);
    onMapClickModeChange("waypoint");
  }

  function clearWaypointSearch() {
    waypointAddressSearch.clear();
    setIsWaypointFieldFocused(false);
    onMapClickModeChange("target");
  }

  function selectWaypointSuggestion(suggestion) {
    waypointAddressSearch.clear();
    setIsWaypointFieldFocused(false);
    onMapClickModeChange("target");

    onWaypointSelect({
      latitude:  suggestion.latitude,
      longitude: suggestion.longitude,
      name:      suggestion.name || suggestion.displayName,
      city:      suggestion.city,
      country:   suggestion.country,
      osmId:     suggestion.osmId,
      osmType:   suggestion.osmType,
    });
  }

  // ── Drag-and-drop ─────────────────────────────────

  function handleStopDragStart(event, stopIndex) {
    setDraggedStopIndex(stopIndex);

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(stopIndex));
  }

  function handleStopDragOver(event, stopIndex) {
    if (draggedStopIndex === null) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    setDragOverStopIndex(stopIndex);
  }

  function handleStopDrop(event, targetDropIndex) {
    event.preventDefault();

    const sourceStopIndex = Number(
      event.dataTransfer.getData("text/plain")
    );

    setDraggedStopIndex(null);
    setDragOverStopIndex(null);

    if (
      Number.isNaN(sourceStopIndex) ||
      sourceStopIndex === targetDropIndex
    ) {
      return;
    }

    onRouteStopsReorder?.(sourceStopIndex, targetDropIndex);
  }

  function handleStopDragEnd() {
    setDraggedStopIndex(null);
    setDragOverStopIndex(null);
  }

  function getStopBlockClassName(stopIndex) {
    return buildClassName([
      "search-card__stop-block",
      draggedStopIndex === stopIndex ? "is-dragging" : "",
      dragOverStopIndex === stopIndex ? "is-drag-over" : "",
    ]);
  }

  function renderStopDragHandle(stopIndex, label) {
    if (!targetLocation || !onRouteStopsReorder) {
      return null;
    }

    return (
      <button
        className="search-card__drag-handle"
        type="button"
        draggable
        onDragStart={(event) => {
          handleStopDragStart(event, stopIndex);
        }}
        onDragEnd={handleStopDragEnd}
        aria-label={`${label} verschieben`}
        title="Ziehen zum Verschieben"
      >
        <GripIcon />
      </button>
    );
  }

  // ── Render-Hilfsfunktionen ─────────────────────────────────

  function renderStartField() {
    return (
      <>
        <div
          className={getStopBlockClassName(0)}
          onDragOver={(event) => {
            handleStopDragOver(event, 0);
          }}
          onDrop={(event) => {
            handleStopDrop(event, 0);
          }}
        >
          <div className="search-card__row">
            {renderStopDragHandle(0, "Startpunkt")}

            <div className="search-card__badge search-card__badge--start">
              A
            </div>

            <SearchField
              inputElementRef={startInputElementRef}
              placeholder="Startpunkt suchen oder Karte tippen…"
              displayValue={startDisplayValue}
              isFilled={Boolean(startLocation)}
              fieldModifierClassName="search-card__field--filled-start"
              focusedModifierClassName="search-card__field--focused-start"
              clearButtonModifierClassName="search-card__clear-button--start"
              isFocused={isStartFieldFocused}
              searchQuery={startAddressSearch.searchQuery}
              isSearching={startAddressSearch.isSearching}
              onFocusActivate={activateStartSearch}
              onClear={onStartClear}
              onSearchQueryChange={startAddressSearch.search}
              onBlur={closeStartSearchAfterBlur}
            />
          </div>
        </div>

        {startAddressSearch.suggestions.length > 0 && isStartFieldFocused && (
          <SuggestionList
            suggestions={startAddressSearch.suggestions}
            badgeModifierClassName="search-card__suggestion-dot--start"
            onSuggestionSelect={selectStartSuggestion}
          />
        )}
      </>
    );
  }

  function renderConnector() {
    return (
      <div className="search-card__connector">
        <div className="search-card__connector-line" />
      </div>
    );
  }

  function renderWaypoint(waypoint, waypointIndex) {
    const waypointNumber = waypointIndex + 1;
    const stopIndex      = waypointIndex + 1;

    return (
      <div
        key={createStopKey(waypoint, waypointIndex)}
        className={getStopBlockClassName(stopIndex)}
        onDragOver={(event) => {
          handleStopDragOver(event, stopIndex);
        }}
        onDrop={(event) => {
          handleStopDrop(event, stopIndex);
        }}
      >
        <div className="search-card__row search-card__row--waypoint">
          {renderStopDragHandle(stopIndex, `Zwischenziel ${waypointNumber}`)}

          <div className="search-card__badge search-card__badge--waypoint">
            {waypointNumber}
          </div>

          <div className="search-card__field search-card__field--filled-waypoint">
            <span className="search-card__field-text">
              {waypoint.name || `Zwischenziel ${waypointNumber}`}
            </span>

            <button
              className="search-card__clear-button search-card__clear-button--waypoint"
              type="button"
              onClick={() => {
                onWaypointRemove(waypointIndex);
              }}
              aria-label="Zwischenziel löschen"
            >
              ×
            </button>
          </div>
        </div>

        {renderConnector()}
      </div>
    );
  }

  function renderWaypointInput() {
    if (!targetLocation || !isWaypointFieldFocused) {
      return null;
    }

    return (
      <>
        <div className="search-card__row search-card__row--waypoint-input">
          <div className="search-card__drag-handle-placeholder" />

          <div className="search-card__badge search-card__badge--waypoint">
            {waypoints.length + 1}
          </div>

          <SearchField
            inputElementRef={waypointInputElementRef}
            placeholder="Zwischenziel suchen oder Karte tippen…"
            displayValue=""
            isFilled={false}
            fieldModifierClassName="search-card__field--filled-waypoint"
            focusedModifierClassName="search-card__field--focused-waypoint"
            clearButtonModifierClassName="search-card__clear-button--waypoint"
            isFocused={isWaypointFieldFocused}
            searchQuery={waypointAddressSearch.searchQuery}
            isSearching={waypointAddressSearch.isSearching}
            onFocusActivate={activateWaypointSearchOnly}
            onClear={clearWaypointSearch}
            onSearchQueryChange={waypointAddressSearch.search}
            onBlur={closeWaypointSearchAfterBlur}
          />
        </div>

        {waypointAddressSearch.suggestions.length > 0 && isWaypointFieldFocused && (
          <SuggestionList
            suggestions={waypointAddressSearch.suggestions}
            badgeModifierClassName="search-card__suggestion-dot--waypoint"
            onSuggestionSelect={selectWaypointSuggestion}
          />
        )}

        {renderConnector()}
      </>
    );
  }

  function renderAddWaypointButton() {
    if (!targetLocation || isWaypointFieldFocused) {
      return null;
    }

    return (
      <>
        <button
          type="button"
          className="search-card__add-waypoint-button"
          onClick={activateWaypointSearch}
        >
          <span className="search-card__add-waypoint-icon">
            +
          </span>

          <span>
            Zwischenziel hinzufügen
          </span>
        </button>

        {renderConnector()}
      </>
    );
  }

  function renderTargetField() {
    return (
      <>
        <div
          className={getStopBlockClassName(targetStopIndex)}
          onDragOver={(event) => {
            handleStopDragOver(event, targetStopIndex);
          }}
          onDrop={(event) => {
            handleStopDrop(event, targetStopIndex);
          }}
        >
          <div className="search-card__row">
            {renderStopDragHandle(targetStopIndex, "Zielpunkt")}

            <div className="search-card__badge search-card__badge--target">
              B
            </div>

            <SearchField
              inputElementRef={targetInputElementRef}
              placeholder="Ziel suchen oder Karte tippen…"
              displayValue={targetDisplayValue}
              isFilled={Boolean(targetLocation)}
              fieldModifierClassName="search-card__field--filled-target"
              focusedModifierClassName="search-card__field--focused-target"
              isFocused={isTargetFieldFocused}
              searchQuery={targetAddressSearch.searchQuery}
              isSearching={targetAddressSearch.isSearching}
              onFocusActivate={activateTargetSearch}
              onClear={onTargetClear}
              onSearchQueryChange={targetAddressSearch.search}
              onBlur={closeTargetSearchAfterBlur}
            />
          </div>
        </div>

        {targetAddressSearch.suggestions.length > 0 && isTargetFieldFocused && (
          <SuggestionList
            suggestions={targetAddressSearch.suggestions}
            badgeModifierClassName="search-card__suggestion-dot--target"
            onSuggestionSelect={selectTargetSuggestion}
          />
        )}
      </>
    );
  }

  function renderModeButtons() {
    const startButtonClassName = buildClassName([
      "search-card__mode-button",
      "search-card__mode-button--start",
      mapClickMode === "start" ? "is-active" : "",
    ]);

    const targetButtonClassName = buildClassName([
      "search-card__mode-button",
      "search-card__mode-button--target",
      mapClickMode === "target" ? "is-active" : "",
    ]);

    return (
      <div className="search-card__mode-row">
        <button
          type="button"
          className={startButtonClassName}
          onClick={toggleStartMapClickMode}
        >
          Start setzen
        </button>

        <button
          type="button"
          className={targetButtonClassName}
          onClick={activateTargetMapClickMode}
        >
          Ziel setzen
        </button>
      </div>
    );
  }

  return (
    <div className={searchCardClassName}>
      {renderStartField()}

      {renderConnector()}

      {targetLocation && waypoints.map(renderWaypoint)}

      {renderWaypointInput()}

      {renderAddWaypointButton()}

      {renderTargetField()}

      {renderModeButtons()}
    </div>
  );
}

export default SearchCard;