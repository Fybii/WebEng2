import {
  formatRouteDistance,
  formatRouteDuration,
} from "../services/utils";

import "./css/NavigationBar.css";

// ── NavigationBar ─────────────────────────────────

function NavigationBar({
  currentStep,
  nextStep,
  remainingDistance,
  remainingDuration,
  eta,
  targetLetter,
  onStop,
  onCenter,
}) {
  const currentInstruction = currentStep?.instruction ?? "Navigation läuft...";
  const currentIcon        = currentStep?.icon ?? "▶";

  const hasCurrentStepDistance = currentStep?.distance > 0;
  const hasNextStep            = Boolean(nextStep);
  const hasTargetLetter        = Boolean(targetLetter);
  const hasEstimatedArrival    = Boolean(eta);

  return (
    <>
      <div className="nav-bar">
        <div className="nav-bar__current">
          <div className="nav-bar__icon">
            {currentIcon}
          </div>

          {hasTargetLetter && (
            <span className="nav-bar__target-letter">
              {targetLetter}
            </span>
          )}

          <div className="nav-bar__instruction">
            <span className="nav-bar__text">
              {currentInstruction}
            </span>

            {hasCurrentStepDistance && (
              <span className="nav-bar__distance">
                in {formatRouteDistance(currentStep.distance)}
              </span>
            )}
          </div>
        </div>

        {hasNextStep && (
          <div className="nav-bar__next">
            <span className="nav-bar__next-label">
              Dann:
            </span>

            <span className="nav-bar__next-icon">
              {nextStep.icon}
            </span>

            <span className="nav-bar__next-text">
              {nextStep.instruction}
            </span>
          </div>
        )}
      </div>

      <div className="nav-footer">
        <button
          className="nav-footer__stop-button"
          onClick={onStop}
          type="button"
        >
          ■ Stopp
        </button>

        <div className="nav-footer__stats">
          <span className="nav-footer__value">
            {formatRouteDistance(remainingDistance)}
          </span>

          <span className="nav-footer__separator">
            ·
          </span>

          <span className="nav-footer__value">
            {formatRouteDuration(remainingDuration)}
          </span>

          {hasEstimatedArrival && (
            <>
              <span className="nav-footer__separator">
                ·
              </span>

              <span className="nav-footer__eta">
                Ankunft {eta}
              </span>
            </>
          )}
        </div>

        <button
          className="nav-footer__center-button"
          onClick={onCenter}
          type="button"
          aria-label="Karte auf aktuellen Standort zentrieren"
        >
          ⊕
        </button>
      </div>
    </>
  );
}

export default NavigationBar;