import "./css/Splash.css";

// ── Logo ─────────────────────────────────

const SplashLogo = () => (
  <svg
    viewBox="0 0 40 52"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fill="#fff"
      d="M20 0C8.96 0 0 8.96 0 20C0 34.82 20 52 20 52S40 34.82 40 20C40 8.96 31.04 0 20 0Z"
    />

    <circle
      cx="20"
      cy="20"
      r="13"
      fill="rgba(147,197,253,.2)"
    />

    <path
      stroke="#fff"
      fill="none"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M13 14V26M13 14L27 26M27 14V26"
    />
  </svg>
);

// ── GPS-Icon ─────────────────────────────────

const GpsPinIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
  >
    <path
      fill="rgba(147,197,253,.85)"
      d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"
    />
  </svg>
);

// ── Splash-Screen ─────────────────────────────────

function Splash({
  statusText = "Standort wird ermittelt...",
  visible    = true,
}) {
  const splashClassName = [
    "splash",
    !visible ? "splash--hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={splashClassName}>
      <div className="splash__logo-wrapper">
        <SplashLogo />
      </div>

      <div className="splash__brand">
        Na<span className="splash__brand-accent">vix</span>
      </div>

      <div className="splash__tagline">
        Navigate · Explore · Discover
      </div>

      <div className="splash__status">
        <div className="splash__gps-ring">
          <GpsPinIcon />
        </div>

        <span className="splash__status-text">
          {statusText}
        </span>
      </div>

      <div className="splash__progress-bar">
        <div className="splash__progress-fill" />
      </div>
    </div>
  );
}

export default Splash;