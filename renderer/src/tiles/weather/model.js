import { getNextCardPosition, nowIso, normalizeCard } from "../../lib/workspace";
import TILE_TYPES from "../tileTypes";

export const WEATHER_CARD_TYPE = TILE_TYPES.WEATHER;

// The design is a fixed 520 x 243 slab; the tile scales it if resized.
export const WEATHER_CARD_SIZE = Object.freeze({
  width: 520,
  height: 243,
});

export const WEATHER_FALLBACK_CITY = "London";

// The city in the computer's own timezone ("Asia/Kolkata" -> "Kolkata"), so
// a new tile shows somewhere local without a location permission prompt --
// Electron's geolocation needs a Google API key on Windows.
export function getDefaultWeatherCity(timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const segments = String(timeZone ?? "").split("/");
  const city = segments.length > 1 ? segments[segments.length - 1].replace(/_/g, " ").trim() : "";

  return city || WEATHER_FALLBACK_CITY;
}

export function normalizeWeatherCity(city) {
  return typeof city === "string" && city.trim() ? city.trim() : getDefaultWeatherCity();
}

// The geocoded place is saved so the tile doesn't geocode on every load;
// the weather itself is runtime-only and refetched.
export function normalizeWeatherLocation(location) {
  if (
    !location
    || typeof location !== "object"
    || !Number.isFinite(location.latitude)
    || !Number.isFinite(location.longitude)
  ) {
    return null;
  }

  return {
    name: typeof location.name === "string" ? location.name : "",
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    timezone: typeof location.timezone === "string" ? location.timezone : "",
  };
}

export function createWeatherCard(cards, viewport, preferredCenter = null, options = {}) {
  const position = getNextCardPosition(cards, viewport, WEATHER_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();

  return normalizeCard({
    id: crypto.randomUUID(),
    type: WEATHER_CARD_TYPE,
    city: normalizeWeatherCity(options?.city),
    location: normalizeWeatherLocation(options?.location),
    x: position.x,
    y: position.y,
    width: WEATHER_CARD_SIZE.width,
    height: WEATHER_CARD_SIZE.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
