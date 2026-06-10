import { useEffect, useRef } from "react";

import {
  formatRouteDistance,
  formatRouteDuration,
} from "../services/utils";

import "./css/NavigationPanel.css";

// ── NavigationPanel ─────────────────────────────────

function NavigationPanel({
  steps,
  currentStepIndex,
  remainingDistance,
  remainingDuration,
  eta,
  targetLetter,
  onStop,
}) {
  const activeStepElementRef = useRef(null);

  const hasEstimatedArrival = Boolean(eta);

  const navigationTitle = targetLetter
    ? `Navigation läuft · nach ${targetLetter}`
    : "Navigation läuft";

  // ── Aktiven Navigationsschritt sichtbar halten ─────────────────────────────────

  useEffect(() => {
    activeStepElementRef.current?.scrollIntoView({
      behavior: "smooth",
      block:    "nearest",
    });
  }, [currentStepIndex]);

  return (
    <div className="nav-panel">
      <div className="nav-panel__header">
        <div className="nav-panel__live-dot" />

        <span className="nav-panel__title">
          {navigationTitle}
        </span>

        <div className="nav-panel__stats">
          {formatRouteDistance(remainingDistance)} ·{" "}
          {formatRouteDuration(remainingDuration)}

          {hasEstimatedArrival && (
            <span className="nav-panel__eta">
              {" "}· Ankunft {eta}
            </span>
          )}
        </div>
      </div>

      <ul className="nav-panel__steps">
        {steps.map((step, stepIndex) => {
          const isCompletedStep = stepIndex < currentStepIndex;
          const isCurrentStep   = stepIndex === currentStepIndex;

          const stepClassName = [
            "nav-panel__step",
            isCurrentStep ? "nav-panel__step--active" : "",
            isCompletedStep ? "nav-panel__step--done" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <li
              key={step.index ?? stepIndex}
              ref={isCurrentStep ? activeStepElementRef : null}
              className={stepClassName}
            >
              <div className="nav-panel__step-icon">
                {isCompletedStep ? "✓" : step.icon}
              </div>

              <div className="nav-panel__step-body">
                <span className="nav-panel__step-text">
                  {step.instruction}
                </span>

                {step.distance > 0 && (
                  <span className="nav-panel__step-distance">
                    {formatRouteDistance(step.distance)}
                  </span>
                )}
              </div>

              {isCurrentStep && (
                <div className="nav-panel__step-cursor" />
              )}
            </li>
          );
        })}
      </ul>

      <div className="nav-panel__footer">
        <button
          type="button"
          className="nav-panel__stop-button"
          onClick={onStop}
        >
          ■ Navigation beenden
        </button>
      </div>
    </div>
  );
}

export default NavigationPanel;