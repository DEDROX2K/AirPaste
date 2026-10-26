// The weather tile: Open-Meteo data (geocode once, then current + 5-day
// forecast), a city clock and the next sun event. Only the city and its
// geocoded location are saved on the card; the weather is runtime-only.
import { describe, expect, it, vi } from "vitest";
import { normalizeCard } from "@/lib/workspace.js";
import { createWeatherCard, getDefaultWeatherCity } from "@/tiles/weather/model.js";
import {
  fetchWeather,
  formatDegrees,
  geocodeCity,
  getCityCode,
  getLocalNow,
  getSunEvent,
  getWeatherIcon,
  loadWeather,
} from "@/tiles/weather/weatherData.js";

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const AMSTERDAM = { name: "Amsterdam", latitude: 52.374, longitude: 4.89, timezone: "Europe/Amsterdam" };

const FORECAST = {
  timezone: "Europe/Amsterdam",
  current: { temperature_2m: 23.6, weather_code: 2, is_day: 1, pressure_msl: 1013.4 },
  daily: {
    time: ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"],
    weather_code: [0, 2, 61, 3, 95, 0],
    temperature_2m_max: [24.4, 25, 22, 23, 23, 20],
    temperature_2m_min: [8, -0.4, 13, 12, 12, 9],
    sunrise: ["2026-10-26T07:20", "2026-10-27T07:22"],
    sunset: ["2026-10-26T17:12", "2026-10-27T17:10"],
  },
};

describe("weather card", () => {
  it("defaults the city to the one in the computer's timezone", () => {
    expect(getDefaultWeatherCity("Asia/Kolkata")).toBe("Kolkata");
    expect(getDefaultWeatherCity("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
    expect(getDefaultWeatherCity("UTC")).toBe("London");
  });

  it("creates a fixed 520 x 243 tile and keeps only durable fields", () => {
    const card = createWeatherCard([], { x: 0, y: 0, zoom: 1 }, null, { city: "Bogotá" });

    expect(card).toMatchObject({ type: "weather", city: "Bogotá", location: null, width: 520, height: 243 });
    expect(normalizeCard({ ...card, location: AMSTERDAM }).location).toEqual(AMSTERDAM);
    expect(normalizeCard({ ...card, location: { name: "x" } }).location).toBeNull();
  });
});

describe("Open-Meteo data", () => {
  it("geocodes a city to coordinates and a timezone", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ results: [{ name: "Amsterdam", latitude: 52.374, longitude: 4.89, timezone: "Europe/Amsterdam" }] }));

    await expect(geocodeCity("Amsterdam", fetchImpl)).resolves.toEqual(AMSTERDAM);
    await expect(geocodeCity("Nowhere", async () => jsonResponse({}))).rejects.toThrow("City not found");
  });

  it("maps the forecast onto the tile's shape", async () => {
    const weather = await fetchWeather(AMSTERDAM, async () => jsonResponse(FORECAST));

    expect(weather).toMatchObject({ city: "Amsterdam", timezone: "Europe/Amsterdam", temperature: 23.6, code: 2, isDay: true, pressure: 1013.4 });
    expect(weather.days).toHaveLength(5);
    expect(weather.days[1]).toEqual({ date: "2026-10-27", code: 2, high: 25, low: -0.4 });
  });

  it("shares one request between tiles for the same place, but never caches a failure", async () => {
    const place = { ...AMSTERDAM, latitude: 1.234 };
    const fetchImpl = vi.fn(async () => jsonResponse(FORECAST));
    await Promise.all([loadWeather(place, { fetchImpl }), loadWeather(place, { fetchImpl })]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const failingPlace = { ...AMSTERDAM, latitude: 5.678 };
    await expect(loadWeather(failingPlace, { fetchImpl: async () => jsonResponse({}, 500) })).rejects.toThrow("HTTP 500");
    await expect(loadWeather(failingPlace, { fetchImpl })).resolves.toMatchObject({ city: "Amsterdam" });
  });
});

describe("weather display helpers", () => {
  it("maps WMO codes to icons, using night variants only for clear/partly", () => {
    expect(getWeatherIcon(0, true)).toBe("clear-day");
    expect(getWeatherIcon(1, false)).toBe("clear-night");
    expect(getWeatherIcon(2, false)).toBe("partly-night");
    expect(getWeatherIcon(3, false)).toBe("cloudy");
    expect(getWeatherIcon(63, true)).toBe("rain");
    expect(getWeatherIcon(81, true)).toBe("rain");
    expect(getWeatherIcon(75, true)).toBe("snow");
    expect(getWeatherIcon(99, true)).toBe("storm");
    expect(getWeatherIcon(48, true)).toBe("fog");
  });

  it("shows the sunset while the sun is up, otherwise the next sunrise", () => {
    expect(getSunEvent(FORECAST.daily, "2026-10-26T06:00:00")).toEqual({ kind: "sunrise", time: "07:20" });
    expect(getSunEvent(FORECAST.daily, "2026-10-26T12:00:00")).toEqual({ kind: "sunset", time: "17:12" });
    expect(getSunEvent(FORECAST.daily, "2026-10-26T21:00:00")).toEqual({ kind: "sunrise", time: "07:22" });
  });

  it("formats degrees, city codes and city-local time", () => {
    expect([23.6, -0.4, 0, Number.NaN].map(formatDegrees)).toEqual(["24", "0", "0", "–"]);
    expect(getCityCode("Bogotá")).toBe("BOG");
    expect(getCityCode("New York")).toBe("NEW");
    expect(getLocalNow("Asia/Tokyo", new Date("2026-10-26T00:30:15Z"))).toBe("2026-10-26T09:30:15");
  });
});
