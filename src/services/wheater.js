/**
 * wheater.js
 *
 * Lädt aktuelle Wetterdaten und eine Ankunftsprognose
 * für einen Zielpunkt über die Open-Meteo API.
 *
 * Hinweis:
 * Der Dateiname heißt aktuell "wheater.js", damit bestehende Imports
 * nicht kaputtgehen. Inhaltlich geht es natürlich um "weather".
 */

// ── API-Endpunkt ─────────────────────────────────

const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

// ── Wettercodes ─────────────────────────────────

const WEATHER_CODE_INFO = {
  0:  { label: "Klar",                       icon: "☀️" },
  1:  { label: "Überwiegend klar",           icon: "🌤️" },
  2:  { label: "Teilweise bewölkt",          icon: "⛅" },
  3:  { label: "Bewölkt",                    icon: "☁️" },
  45: { label: "Nebel",                      icon: "🌫️" },
  48: { label: "Nebel mit Reif",             icon: "🌫️" },
  51: { label: "Leichter Nieselregen",       icon: "🌦️" },
  53: { label: "Nieselregen",                icon: "🌦️" },
  55: { label: "Starker Nieselregen",        icon: "🌧️" },
  61: { label: "Leichter Regen",             icon: "🌦️" },
  63: { label: "Regen",                      icon: "🌧️" },
  65: { label: "Starker Regen",              icon: "🌧️" },
  71: { label: "Leichter Schneefall",        icon: "🌨️" },
  73: { label: "Schneefall",                 icon: "❄️" },
  75: { label: "Starker Schneefall",         icon: "❄️" },
  80: { label: "Leichte Regenschauer",       icon: "🌦️" },
  81: { label: "Regenschauer",               icon: "🌧️" },
  82: { label: "Starke Regenschauer",        icon: "🌧️" },
  95: { label: "Gewitter",                   icon: "⛈️" },
  96: { label: "Gewitter mit Hagel",         icon: "⛈️" },
  99: { label: "Starkes Gewitter mit Hagel", icon: "⛈️" },
};

const UNKNOWN_WEATHER_INFO = {
  label: "Unbekannt",
  icon:  "🌡️",
};

// ── Wettercode beschreiben ─────────────────────────────────

function describeWeatherCode(weatherCode) {
  return WEATHER_CODE_INFO[weatherCode] ?? UNKNOWN_WEATHER_INFO;
}

// ── Temperatur formatieren ─────────────────────────────────

function formatTemperature(value) {
  if (value == null || Number.isNaN(value)) {
    return "-";
  }

  return `${Math.round(value)} °C`;
}

// ── Stundenzeit formatieren ─────────────────────────────────

function formatHourlyTime(isoString) {
  if (!isoString) {
    return "";
  }

  const timePart = isoString.split("T")[1];

  return timePart ? timePart.slice(0, 5) : "";
}

// ── Nächsten Stundenwert finden ─────────────────────────────────

function findClosestHourlyIndex(hourlyTimes, targetTimestampInMs) {
  if (!hourlyTimes?.length) {
    return 0;
  }

  let closestIndex          = 0;
  let closestDifferenceInMs = Number.POSITIVE_INFINITY;

  for (let index = 0; index < hourlyTimes.length; index += 1) {
    const hourlyTimestampInMs = new Date(hourlyTimes[index]).getTime();

    if (!Number.isFinite(hourlyTimestampInMs)) {
      continue;
    }

    const differenceInMs = Math.abs(hourlyTimestampInMs - targetTimestampInMs);

    if (differenceInMs < closestDifferenceInMs) {
      closestDifferenceInMs = differenceInMs;
      closestIndex          = index;
    }
  }

  return closestIndex;
}

// ── Wetter-Snapshot bauen ─────────────────────────────────

function buildWeatherSnapshot(hourlyData, index, label, timeLabel) {
  const weatherCode = hourlyData?.weather_code?.[index];
  const weatherInfo = describeWeatherCode(weatherCode);

  const temperature = hourlyData?.temperature_2m?.[index];

  return {
    label,
    timeLabel,
    temperature,
    temperatureText:          formatTemperature(temperature),
    description:              weatherInfo.label,
    icon:                     weatherInfo.icon,
    precipitationProbability: hourlyData?.precipitation_probability?.[index] ?? null,
    windSpeed:                hourlyData?.wind_speed_10m?.[index] ?? null,
  };
}

// ── Anfrage-Parameter bauen ─────────────────────────────────

function buildWeatherRequestParams(latitude, longitude) {
  return new URLSearchParams({
    latitude:      String(latitude),
    longitude:     String(longitude),
    current:       "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation",
    hourly:        "temperature_2m,weather_code,precipitation_probability,wind_speed_10m",
    timezone:      "auto",
    forecast_days: "3",
  });
}

// ── Koordinaten prüfen ─────────────────────────────────

function validateTargetPoint(targetPoint) {
  const hasValidLatitude =
    typeof targetPoint?.latitude === "number" &&
    Number.isFinite(targetPoint.latitude);

  const hasValidLongitude =
    typeof targetPoint?.longitude === "number" &&
    Number.isFinite(targetPoint.longitude);

  if (!hasValidLatitude || !hasValidLongitude) {
    throw new Error("Ungültige Koordinaten für Wetterdaten.");
  }
}

// ── Wetterdaten abrufen ─────────────────────────────────

export async function fetchDestinationWeather(targetPoint, options = {}) {
  validateTargetPoint(targetPoint);

  const {
    signal,
    routeDurationInSeconds = null,
  } = options;

  const weatherRequestParams = buildWeatherRequestParams(
    targetPoint.latitude,
    targetPoint.longitude
  );

  const response = await fetch(`${OPEN_METEO_FORECAST_URL}?${weatherRequestParams}`, {
    signal,
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Wetterdaten konnten nicht geladen werden.");
  }

  const weatherData = await response.json();
  const hourlyData  = weatherData.hourly ?? {};

  const nowTimestampInMs = Date.now();

  const arrivalTimestampInMs =
    routeDurationInSeconds != null
      ? nowTimestampInMs + routeDurationInSeconds * 1000
      : nowTimestampInMs;

  const nowIndex = findClosestHourlyIndex(
    hourlyData.time,
    nowTimestampInMs
  );

  const arrivalIndex = findClosestHourlyIndex(
    hourlyData.time,
    arrivalTimestampInMs
  );

  const currentWeatherInfo = describeWeatherCode(
    weatherData.current?.weather_code
  );

  return {
    now: {
      label:           "Jetzt am Ziel",
      timeLabel:       formatHourlyTime(hourlyData.time?.[nowIndex]),
      temperature:     weatherData.current?.temperature_2m,
      temperatureText: formatTemperature(weatherData.current?.temperature_2m),
      description:     currentWeatherInfo.label,
      icon:            currentWeatherInfo.icon,
      humidity:        weatherData.current?.relative_humidity_2m ?? null,
      windSpeed:       weatherData.current?.wind_speed_10m ?? null,
      precipitation:   weatherData.current?.precipitation ?? null,
    },

    atArrival: buildWeatherSnapshot(
      hourlyData,
      arrivalIndex,
      routeDurationInSeconds != null ? "bei Ankunft" : "Prognose am Ziel",
      formatHourlyTime(hourlyData.time?.[arrivalIndex])
    ),
  };
}