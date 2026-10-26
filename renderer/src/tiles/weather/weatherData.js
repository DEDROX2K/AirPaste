// Weather for the weather tile, from Open-Meteo (free, no API key, CORS
// enabled). Open-Meteo's free tier is for non-commercial use -- swapping
// providers only means changing geocodeCity() and fetchWeather().

const REQUEST_TIMEOUT_MS = 8000;
export const WEATHER_REFRESH_MS = 15 * 60 * 1000;

export const WEATHER_LABELS = Object.freeze({
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm, hail",
  99: "Thunderstorm, hail",
});

// Left-panel background + its text/icon ink, per icon.
export const WEATHER_LOOKS = Object.freeze({
  "clear-day": { bg: "#FFD600", ink: "#111111" },
  "partly-day": { bg: "#F2DF8A", ink: "#111111" },
  cloudy: { bg: "#A7C3D1", ink: "#111111" },
  rain: { bg: "#86AECF", ink: "#111111" },
  storm: { bg: "#8F93B8", ink: "#111111" },
  snow: { bg: "#DCE8F1", ink: "#111111" },
  fog: { bg: "#CBD0D4", ink: "#111111" },
  "clear-night": { bg: "#1E2A4A", ink: "#F4F6FA" },
  "partly-night": { bg: "#2A3552", ink: "#F4F6FA" },
});

// WMO weather code -> icon name.
export function getWeatherIcon(code, isDay) {
  if (code === 0 || code === 1) return isDay ? "clear-day" : "clear-night";
  if (code === 2) return isDay ? "partly-day" : "partly-night";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return isDay ? "partly-day" : "partly-night";
}

async function getJson(url, fetchImpl) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

export async function geocodeCity(city, fetchImpl = fetch) {
  const json = await getJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
    fetchImpl,
  );
  const result = json?.results?.[0];

  if (!result || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) {
    throw new Error("City not found");
  }

  return {
    name: result.name || city,
    latitude: result.latitude,
    longitude: result.longitude,
    timezone: result.timezone || "",
  };
}

export async function fetchWeather(location, fetchImpl = fetch) {
  const json = await getJson(
    "https://api.open-meteo.com/v1/forecast"
      + `?latitude=${location.latitude}&longitude=${location.longitude}`
      + "&current=temperature_2m,weather_code,is_day,pressure_msl"
      + "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset"
      + "&timezone=auto&forecast_days=6&temperature_unit=celsius",
    fetchImpl,
  );
  const daily = json?.daily ?? {};

  return {
    city: location.name,
    timezone: json?.timezone || location.timezone,
    temperature: json?.current?.temperature_2m,
    code: json?.current?.weather_code,
    isDay: json?.current?.is_day === 1,
    pressure: json?.current?.pressure_msl,
    days: (daily.time ?? []).slice(0, 5).map((date, index) => ({
      date,
      code: daily.weather_code?.[index],
      high: daily.temperature_2m_max?.[index],
      low: daily.temperature_2m_min?.[index],
    })),
    sunrise: daily.sunrise ?? [],
    sunset: daily.sunset ?? [],
  };
}

// Several tiles for the same place share one request per refresh window.
const weatherCache = new Map();

export function loadWeather(location, { force = false, fetchImpl = fetch } = {}) {
  const key = `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}`;
  const cached = weatherCache.get(key);

  if (cached && !force && Date.now() - cached.at < WEATHER_REFRESH_MS - 1000) {
    return cached.promise;
  }

  const promise = fetchWeather(location, fetchImpl);
  weatherCache.set(key, { at: Date.now(), promise });
  // A failure must not be served from the cache for the next 15 minutes.
  promise.catch(() => {
    if (weatherCache.get(key)?.promise === promise) {
      weatherCache.delete(key);
    }
  });

  return promise;
}

/* ---------- time helpers ---------- */

// "YYYY-MM-DDTHH:MM:SS" in the given IANA timezone.
export function getLocalNow(timeZone, now = new Date()) {
  try {
    return now.toLocaleString("sv-SE", { timeZone, hourCycle: "h23" }).replace(" ", "T");
  } catch {
    const pad = (value) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }
}

export function getDayName(isoDate) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });
}

// While the sun is up: the sunset. Before sunrise or after sunset: the next
// sunrise.
export function getSunEvent(weather, localNow) {
  const stamp = localNow.slice(0, 16);
  const sunrise = weather.sunrise?.[0] || "";
  const sunset = weather.sunset?.[0] || "";

  if (!sunrise || !sunset) {
    return { kind: "sunset", time: "–" };
  }

  if (stamp < sunrise) {
    return { kind: "sunrise", time: sunrise.slice(11, 16) };
  }

  if (stamp < sunset) {
    return { kind: "sunset", time: sunset.slice(11, 16) };
  }

  return { kind: "sunrise", time: (weather.sunrise[1] || sunrise).slice(11, 16) };
}

// Rounded whole degrees, never "-0".
export function formatDegrees(value) {
  const rounded = Math.round(value);
  return Number.isFinite(rounded) ? String(rounded === 0 ? 0 : rounded) : "–";
}

// "AMS", "BOG": the first three letters of the city.
export function getCityCode(city) {
  return String(city ?? "").replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 3).toUpperCase();
}
