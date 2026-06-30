import { useCallback, useEffect, useRef, useState } from "react";

import {
  NAVIGATION_QUICK_CATEGORY_KEYS,
  POINT_OF_INTEREST_CATEGORIES,
  POINT_OF_INTEREST_CATEGORY_GROUPS,
} from "../services/poi.js";

import "./css/PoiBar.css";

// ── Konstanten ─────────────────────────────────

const MOBILE_VIEWPORT_WIDTH_IN_PIXELS       = 768;
const SHEET_SWIPE_CLOSE_DISTANCE_IN_PIXELS  = 80;
const SHEET_CLOSE_ANIMATION_DURATION_IN_MS  = 260;

// ── Hilfsfunktionen ─────────────────────────────────

function buildClassName(classNames) {
  return classNames
    .filter(Boolean)
    .join(" ");
}

function isCurrentViewportMobile() {
  return window.innerWidth < MOBILE_VIEWPORT_WIDTH_IN_PIXELS;
}

function useIsMobileViewport() {
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    return isCurrentViewportMobile();
  });

  useEffect(() => {
    function handleWindowResize() {
      setIsMobileViewport(isCurrentViewportMobile());
    }

    window.addEventListener("resize", handleWindowResize);

    return () => {
      window.removeEventListener("resize", handleWindowResize);
    };
  }, []);

  return isMobileViewport;
}

// ── PoiBar ─────────────────────────────────

function PoiBar({
  activeCategoryKey,
  arePointsOfInterestLoading,
  onCategorySelect,
}) {
  const isMobileViewport = useIsMobileViewport();

  // ── Desktop-Dropdown ─────────────────────────────────

  const [isDesktopDropdownVisible, setIsDesktopDropdownVisible] = useState(false);

  const desktopDropdownRef = useRef(null);

  useEffect(() => {
    if (!isDesktopDropdownVisible) {
      return;
    }

    function handleClickOutside(pointerEvent) {
      const clickedInsideDropdown =
        desktopDropdownRef.current?.contains(pointerEvent.target);

      if (!clickedInsideDropdown) {
        setIsDesktopDropdownVisible(false);
      }
    }

    document.addEventListener("pointerdown", handleClickOutside);

    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
    };
  }, [isDesktopDropdownVisible]);

  // ── Mobile-Sheet ─────────────────────────────────

  const [isMobileSheetMounted, setIsMobileSheetMounted]         = useState(false);
  const [isMobileSheetOpen, setIsMobileSheetOpen]               = useState(false);
  const [isMobileSheetClosing, setIsMobileSheetClosing]         = useState(false);
  const [isMobileSheetDragging, setIsMobileSheetDragging]       = useState(false);
  const [mobileSheetDragYPosition, setMobileSheetDragYPosition] = useState(0);

  const sheetCloseAnimationTimerRef = useRef(null);
  const sheetDragStartYRef          = useRef(0);
  const sheetCurrentDragYRef        = useRef(0);
  const isSheetDraggingRef          = useRef(false);

  const openMobileSheet = useCallback(() => {
    window.clearTimeout(sheetCloseAnimationTimerRef.current);

    sheetCurrentDragYRef.current = 0;

    setMobileSheetDragYPosition(0);
    setIsMobileSheetClosing(false);
    setIsMobileSheetMounted(true);
    setIsMobileSheetOpen(false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsMobileSheetOpen(true);
      });
    });
  }, []);

  const closeMobileSheet = useCallback(() => {
    if (!isMobileSheetOpen && !isMobileSheetClosing) {
      return;
    }

    window.clearTimeout(sheetCloseAnimationTimerRef.current);

    isSheetDraggingRef.current = false;

    setIsMobileSheetOpen(false);
    setIsMobileSheetClosing(true);
    setIsMobileSheetDragging(false);

    sheetCloseAnimationTimerRef.current = window.setTimeout(() => {
      sheetCurrentDragYRef.current = 0;

      setMobileSheetDragYPosition(0);
      setIsMobileSheetMounted(false);
      setIsMobileSheetClosing(false);
    }, SHEET_CLOSE_ANIMATION_DURATION_IN_MS);
  }, [isMobileSheetOpen, isMobileSheetClosing]);

  useEffect(() => {
    return () => {
      window.clearTimeout(sheetCloseAnimationTimerRef.current);
    };
  }, []);

  function handleSheetPointerDown(pointerEvent) {
    sheetDragStartYRef.current    = pointerEvent.clientY;
    sheetCurrentDragYRef.current  = 0;
    isSheetDraggingRef.current    = true;

    setMobileSheetDragYPosition(0);
    setIsMobileSheetDragging(true);

    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
  }

  function handleSheetPointerMove(pointerEvent) {
    if (!isSheetDraggingRef.current) {
      return;
    }

    const dragDistanceInPixels = Math.max(
      pointerEvent.clientY - sheetDragStartYRef.current,
      0
    );

    sheetCurrentDragYRef.current = dragDistanceInPixels;

    setMobileSheetDragYPosition(dragDistanceInPixels);
  }

  function handleSheetPointerUp() {
    if (!isSheetDraggingRef.current) {
      return;
    }

    isSheetDraggingRef.current = false;

    setIsMobileSheetDragging(false);

    if (sheetCurrentDragYRef.current >= SHEET_SWIPE_CLOSE_DISTANCE_IN_PIXELS) {
      closeMobileSheet();
      return;
    }

    sheetCurrentDragYRef.current = 0;

    setMobileSheetDragYPosition(0);
  }

  // ── Event-Handler ─────────────────────────────────

  function handleCategoryButtonClick(categoryKey) {
    const isAlreadyActive = categoryKey === activeCategoryKey;

    onCategorySelect(isAlreadyActive ? null : categoryKey);

    setIsDesktopDropdownVisible(false);
    closeMobileSheet();
  }

  function handleMoreButtonClick() {
    if (isMobileViewport) {
      openMobileSheet();
      return;
    }

    setIsDesktopDropdownVisible((currentVisibility) => {
      return !currentVisibility;
    });
  }

  // ── Render-Hilfsfunktionen ─────────────────────────────────

  function renderQuickCategoryButton(categoryKey) {
    const categoryDefinition = POINT_OF_INTEREST_CATEGORIES[categoryKey];

    if (!categoryDefinition) {
      return null;
    }

    const isActive           = categoryKey === activeCategoryKey;
    const isCurrentlyLoading = isActive && arePointsOfInterestLoading;

    const buttonClassName = buildClassName([
      "poi-bar__category-button",
      isActive ? "is-active" : "",
    ]);

    return (
      <button
        key={categoryKey}
        type="button"
        className={buttonClassName}
        onClick={() => {
          handleCategoryButtonClick(categoryKey);
        }}
        aria-pressed={isActive}
      >
        <span className="poi-bar__category-icon">
          {isCurrentlyLoading ? (
            <span className="poi-bar__category-spinner" />
          ) : (
            categoryDefinition.icon
          )}
        </span>

        <span className="poi-bar__category-label">
          {categoryDefinition.label}
        </span>
      </button>
    );
  }

  function renderCategoryGroupButton(categoryKey) {
    const categoryDefinition = POINT_OF_INTEREST_CATEGORIES[categoryKey];

    if (!categoryDefinition) {
      return null;
    }

    const isActive = categoryKey === activeCategoryKey;

    const buttonClassName = buildClassName([
      "poi-bar__all-category-button",
      isActive ? "is-active" : "",
    ]);

    return (
      <button
        key={categoryKey}
        type="button"
        className={buttonClassName}
        onClick={() => {
          handleCategoryButtonClick(categoryKey);
        }}
        aria-pressed={isActive}
      >
        <span className="poi-bar__all-category-icon">
          {categoryDefinition.icon}
        </span>

        <span className="poi-bar__all-category-label">
          {categoryDefinition.label}
        </span>
      </button>
    );
  }

  function renderAllCategoriesContent() {
    return (
      <div className="poi-bar__all-categories">
        {POINT_OF_INTEREST_CATEGORY_GROUPS.map((group) => (
          <div
            key={group.groupKey}
            className="poi-bar__category-group"
          >
            <p className="poi-bar__group-title">
              {group.label}
            </p>

            <div className="poi-bar__group-items">
              {group.categoryKeys.map(renderCategoryGroupButton)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const moreButtonClassName = buildClassName([
    "poi-bar__more-button",
    isDesktopDropdownVisible ? "is-active" : "",
  ]);

  const sheetOverlayClassName = buildClassName([
    "poi-bar__sheet-overlay",
    isMobileSheetOpen ? "poi-bar__sheet-overlay--open" : "",
    isMobileSheetClosing ? "poi-bar__sheet-overlay--closing" : "",
  ]);

  const sheetClassName = buildClassName([
    "poi-bar__sheet",
    isMobileSheetOpen ? "poi-bar__sheet--open" : "",
    isMobileSheetClosing ? "poi-bar__sheet--closing" : "",
    isMobileSheetDragging ? "poi-bar__sheet--dragging" : "",
  ]);

  return (
    <>
      <div className="poi-bar">
        {arePointsOfInterestLoading && (
          <div className="poi-bar__loading-bar" />
        )}

        <div className="poi-bar__scroll-container">
          {NAVIGATION_QUICK_CATEGORY_KEYS.map(renderQuickCategoryButton)}
        </div>

        <div
          ref={desktopDropdownRef}
          className="poi-bar__more-wrapper"
        >
          <button
            type="button"
            className={moreButtonClassName}
            onClick={handleMoreButtonClick}
            aria-expanded={isDesktopDropdownVisible || isMobileSheetOpen}
            aria-label="Alle Kategorien anzeigen"
          >
            Mehr

            <span className="poi-bar__more-chevron">
              {isDesktopDropdownVisible ? "▲" : "▼"}
            </span>
          </button>

          {!isMobileViewport && isDesktopDropdownVisible && (
            <div className="poi-bar__desktop-dropdown">
              {renderAllCategoriesContent()}
            </div>
          )}
        </div>
      </div>

      {isMobileViewport && isMobileSheetMounted && (
        <>
          <div
            className={sheetOverlayClassName}
            onClick={closeMobileSheet}
          />

          <div
            className={sheetClassName}
            style={{
              "--sheet-drag-y": `${mobileSheetDragYPosition}px`,
            }}
          >
            <div
              className="poi-bar__sheet-drag-area"
              onPointerDown={handleSheetPointerDown}
              onPointerMove={handleSheetPointerMove}
              onPointerUp={handleSheetPointerUp}
              onPointerCancel={handleSheetPointerUp}
            >
              <div className="poi-bar__sheet-handle-bar" />

              <p className="poi-bar__sheet-title">
                Alle Kategorien
              </p>
            </div>

            <div className="poi-bar__sheet-content">
              {renderAllCategoriesContent()}
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default PoiBar;