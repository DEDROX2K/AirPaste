import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useAppContext } from "../../context/useAppContext";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import { WEATHER_CARD_SIZE } from "../../tiles/weather/model";
import {
  WEATHER_LABELS,
  WEATHER_LOOKS,
  WEATHER_REFRESH_MS,
  formatDegrees,
  geocodeCity,
  getCityCode,
  getDayName,
  getLocalNow,
  getSunEvent,
  getWeatherIcon,
  loadWeather,
} from "../../tiles/weather/weatherData";
import TileShell from "./TileShell";
import "./WeatherTile.css";

// Placeholder until the real offline artwork lands: swap this file.
const WEATHER_OFFLINE_IMAGE = `${import.meta.env.BASE_URL}weather/offline.svg`;
const FLIP_EVERY_MS = 10_000;
// Half the design reference's 1500ms.
const FLIP_DURATION_MS = 750;
const FLIP_EASE = "cubic-bezier(.33, 0, .2, 1)";

// 7 thin layers between the faces make the slab's edge read as a thick,
// bevelled rim while it turns: #2A2A2E at the outside -> #0A0A0A mid-way.
const SLAB_LAYERS = Array.from({ length: 7 }, (_, index) => {
  const depth = index + 1;
  const t = Math.abs(depth - 4) / 3;
  const [r, g, b] = [10, 10, 10].map((from, channel) => Math.round(from + ([42, 42, 46][channel] - from) * t));
  return { depth, color: `rgb(${r}, ${g}, ${b})` };
});

const CLOCK_TICKS = Array.from({ length: 60 }, (_, index) => {
  const isHour = index % 5 === 0;
  const angle = (index * 6 * Math.PI) / 180;
  const inner = isHour ? 40.5 : 44.5;
  return {
    index,
    isHour,
    x1: (Math.sin(angle) * inner).toFixed(2),
    y1: (-Math.cos(angle) * inner).toFixed(2),
    x2: (Math.sin(angle) * 47.5).toFixed(2),
    y2: (-Math.cos(angle) * 47.5).toFixed(2),
  };
});

function flipTransform(z, rx, ry, rz) {
  return `translateZ(${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`;
}

/* ---------- icons (mono + colour variants of one set) ---------- */

function CloudShape(props) {
  return (
    <g {...props}>
      <circle cx="11" cy="19" r="5" />
      <circle cx="17.5" cy="14.5" r="6.5" />
      <circle cx="24" cy="19.5" r="4.5" />
      <rect x="11" y="19" width="13" height="5" />
    </g>
  );
}

const MOON_PATH = "M22.5 19.8A8.2 8.2 0 0 1 12.2 9.5 8.2 8.2 0 1 0 22.5 19.8z";

// A dark outline under the front cloud "knocks out" the sun/moon behind it.
function KnockedOutCloud() {
  return (
    <>
      <CloudShape fill="var(--knock)" stroke="var(--knock)" strokeWidth="4" transform="translate(3 5) scale(.9)" />
      <CloudShape fill="var(--cloud)" transform="translate(3 5) scale(.9)" />
    </>
  );
}

function WeatherIcon({ name, mono = false }) {
  let content;

  switch (name) {
    case "clear-day":
      content = (
        <>
          <circle cx="16" cy="16" r="5.5" fill="var(--sun)" />
          <g stroke="var(--sun)" strokeWidth="2.2" strokeLinecap="round" fill="none">
            <line x1="25.5" y1="16" x2="28.5" y2="16" /><line x1="22.72" y1="22.72" x2="24.84" y2="24.84" />
            <line x1="16" y1="25.5" x2="16" y2="28.5" /><line x1="9.28" y1="22.72" x2="7.16" y2="24.84" />
            <line x1="6.5" y1="16" x2="3.5" y2="16" /><line x1="9.28" y1="9.28" x2="7.16" y2="7.16" />
            <line x1="16" y1="6.5" x2="16" y2="3.5" /><line x1="22.72" y1="9.28" x2="24.84" y2="7.16" />
          </g>
        </>
      );
      break;
    case "clear-night":
      content = <path d={MOON_PATH} fill="var(--moon)" transform="translate(1.5 2)" />;
      break;
    case "partly-day":
      content = (
        <>
          <circle cx="11" cy="11" r="4.6" fill="var(--sun)" />
          <g stroke="var(--sun)" strokeWidth="2" strokeLinecap="round" fill="none">
            <line x1="4" y1="11" x2="1.6" y2="11" /><line x1="6.05" y1="6.05" x2="4.3" y2="4.3" />
            <line x1="11" y1="4" x2="11" y2="1.6" /><line x1="15.95" y1="6.05" x2="17.7" y2="4.3" />
            <line x1="6.05" y1="15.95" x2="4.3" y2="17.7" />
          </g>
          <KnockedOutCloud />
        </>
      );
      break;
    case "partly-night":
      content = (
        <>
          <path d={MOON_PATH} fill="var(--moon)" transform="translate(-3 -4) scale(.8)" />
          <KnockedOutCloud />
        </>
      );
      break;
    case "cloudy":
      content = <CloudShape fill="var(--cloud)" transform="translate(-2 -2.5) scale(1.14)" />;
      break;
    case "rain":
      content = (
        <>
          <CloudShape fill="var(--rain-cloud)" transform="translate(0 -4)" />
          <g stroke="var(--drop)" strokeWidth="2" strokeLinecap="round" fill="none">
            <line x1="12" y1="23.5" x2="10.8" y2="28" /><line x1="17.5" y1="23.5" x2="16.3" y2="28" /><line x1="23" y1="23.5" x2="21.8" y2="28" />
          </g>
        </>
      );
      break;
    case "snow":
      content = (
        <>
          <CloudShape fill="var(--rain-cloud)" transform="translate(0 -4)" />
          <g fill="var(--snow)"><circle cx="12" cy="26" r="1.6" /><circle cx="17.5" cy="28.2" r="1.6" /><circle cx="23" cy="26" r="1.6" /></g>
        </>
      );
      break;
    case "storm":
      content = (
        <>
          <CloudShape fill="var(--rain-cloud)" transform="translate(0 -4)" />
          <polygon points="17.8,19 12.6,26.2 16.4,26.2 14.8,31 21.2,23.2 17.4,23.2 19.6,19" fill="var(--bolt)" />
        </>
      );
      break;
    default:
      content = (
        <>
          <CloudShape fill="var(--rain-cloud)" transform="translate(0 -4)" />
          <g stroke="var(--fog)" strokeWidth="2" strokeLinecap="round" fill="none">
            <line x1="8" y1="25.5" x2="24" y2="25.5" /><line x1="11" y1="29" x2="21" y2="29" />
          </g>
        </>
      );
  }

  return (
    <svg className={`weather-tile__icon${mono ? " weather-tile__icon--mono" : ""}`} viewBox="0 0 32 32" aria-hidden="true">
      {content}
    </svg>
  );
}

/* ---------- panels ---------- */

function MainPanel({ weather, icon }) {
  return (
    <section className="weather-tile__panel weather-tile__panel--main">
      <div className="weather-tile__cond">
        <WeatherIcon name={icon} mono />
        <span>{WEATHER_LABELS[weather.code] || "Weather"}</span>
      </div>
      <div className="weather-tile__temp">{formatDegrees(weather.temperature)}°</div>
      <div className="weather-tile__city">{weather.city}</div>
    </section>
  );
}

function ForecastPanel({ days }) {
  return (
    <section className="weather-tile__panel weather-tile__panel--forecast">
      {days.map((day) => (
        <div key={day.date} className="weather-tile__forecast-row">
          <span>{getDayName(day.date)}</span>
          <WeatherIcon name={getWeatherIcon(day.code, true)} />
          <span className="weather-tile__low">{formatDegrees(day.low)}</span>
          <span className="weather-tile__high">{formatDegrees(day.high)}</span>
        </div>
      ))}
    </section>
  );
}

function ClockPanel({ localNow, city }) {
  const hours = Number(localNow.slice(11, 13));
  const minutes = Number(localNow.slice(14, 16));
  const seconds = Number(localNow.slice(17, 19));

  return (
    <section className="weather-tile__panel weather-tile__panel--clock">
      <svg viewBox="-50 -50 100 100" aria-hidden="true">
        <circle r="49" fill="#000" />
        <g>
          {CLOCK_TICKS.map((tick) => (
            <line
              key={tick.index}
              x1={tick.x1}
              y1={tick.y1}
              x2={tick.x2}
              y2={tick.y2}
              stroke={tick.isHour ? "#EDEDED" : "#8A8A8A"}
              strokeWidth={tick.isHour ? 1.5 : 0.7}
              strokeLinecap="round"
            />
          ))}
        </g>
        <text x="0" y="19" textAnchor="middle" fontSize="8" fontWeight="500" letterSpacing=".8" fill="#8A8A8A">
          {getCityCode(city)}
        </text>
        <g className="weather-tile__hands">
          <g transform={`rotate(${(((hours % 12) + minutes / 60) * 30).toFixed(2)})`}>
            <rect x="-2.4" y="-25" width="4.8" height="31" rx="2.4" fill="#34E56F" />
          </g>
          <g transform={`rotate(${((minutes + seconds / 60) * 6).toFixed(2)})`}>
            <rect x="-1.8" y="-40" width="3.6" height="48" rx="1.8" fill="#34E56F" />
          </g>
        </g>
        <circle r="3.2" fill="#D9D9D9" />
      </svg>
    </section>
  );
}

function SunPanel({ sunEvent }) {
  return (
    <section className="weather-tile__panel weather-tile__panel--sun">
      <svg viewBox="0 0 48 40" aria-hidden="true">
        <g
          stroke="#FF9F1C"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          transform={sunEvent.kind === "sunrise" ? "rotate(180 24 7)" : undefined}
        >
          <line x1="24" y1="2" x2="24" y2="12" />
          <path d="M19.8 8.2L24 12.4l4.2-4.2" />
        </g>
        <path d="M15 30a9 9 0 0 1 18 0z" fill="#FF9F1C" />
        <g stroke="#FF9F1C" strokeWidth="2.2" strokeLinecap="round" fill="none">
          <line x1="8" y1="26" x2="5" y2="24.6" /><line x1="40" y1="26" x2="43" y2="24.6" />
          <line x1="12" y1="19.6" x2="9.6" y2="17.6" /><line x1="36" y1="19.6" x2="38.4" y2="17.6" />
          <line x1="4" y1="33.6" x2="44" y2="33.6" />
        </g>
      </svg>
      <div className="weather-tile__sun-time">{sunEvent.time}</div>
    </section>
  );
}

/* ---------- tile ---------- */

function WeatherTile({
  card,
  tileMeta,
  dragVisualDelta,
  dragVisualTileIdSet,
  onBeginDrag,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onPressStart,
  renderHint,
}) {
  const { updateExistingCard } = useAppContext();
  // loading (black, nothing on it) -> live -> offline (the offline image).
  const [status, setStatus] = useState("loading");
  const [weather, setWeather] = useState(null);
  const [localNow, setLocalNow] = useState("");
  const [isOnScreen, setIsOnScreen] = useState(true);
  const [isPageVisible, setIsPageVisible] = useState(() => !document.hidden);
  const rootRef = useRef(null);
  const flipperRef = useRef(null);
  const shadowRef = useRef(null);
  const rotationRef = useRef(0);
  const animationsRef = useRef([]);
  const isDraggingRef = useRef(false);
  isDraggingRef.current = tileMeta?.isDragging === true;

  const surfaceGesture = useTileGesture({
    card,
    onDragStart: onBeginDrag,
    onPressStart,
  });

  /* ----- data: geocode once (saved on the card), then weather ----- */

  const cityRef = useRef(card.city);
  cityRef.current = card.city;
  const locationRef = useRef(card.location);
  locationRef.current = card.location;
  const hasWeatherRef = useRef(false);
  hasWeatherRef.current = weather !== null;

  const refresh = useCallback(async ({ force = false } = {}) => {
    if (navigator.onLine === false) {
      setStatus("offline");
      return;
    }

    try {
      let location = locationRef.current;

      if (!location) {
        location = await geocodeCity(cityRef.current);
        updateExistingCard(card.id, { location });
      }

      const nextWeather = await loadWeather(location, { force });
      setWeather(nextWeather);
      setLocalNow(getLocalNow(nextWeather.timezone));
      setStatus("live");
    } catch {
      // Stale beats blank: a failed refresh keeps showing the last weather.
      if (!hasWeatherRef.current) {
        setStatus("offline");
      }
    }
  }, [card.id, updateExistingCard]);

  useEffect(() => {
    void refresh();
  }, [refresh, card.city, card.location?.latitude, card.location?.longitude]);

  useEffect(() => {
    const handleOnline = () => void refresh({ force: true });
    const handleOffline = () => setStatus("offline");
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refresh]);

  /* ----- only animate what can be seen ----- */

  useEffect(() => {
    const root = rootRef.current;

    if (!root || typeof IntersectionObserver === "undefined") {
      return undefined;
    }

    const observer = new IntersectionObserver(([entry]) => setIsOnScreen(entry.isIntersecting));
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleVisibility = () => setIsPageVisible(!document.hidden);
    // Re-read on subscribe: visibility can change between render and here.
    handleVisibility();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const isLive = status === "live" && weather !== null;
  const isActive = isLive && isOnScreen && isPageVisible;
  // Zoomed out (or mid-pan) the tile is too small for the flip to read; as
  // a static preview (a rack's card) it shouldn't move at all.
  const canFlip = isActive
    && renderHint?.renderState !== "compact"
    && renderHint?.simplify !== true
    && renderHint?.isStaticPreview !== true;

  /* ----- timers: clock every second, refresh every 15 minutes ----- */

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }

    const timeZone = weather.timezone;
    setLocalNow(getLocalNow(timeZone));
    const clock = setInterval(() => setLocalNow(getLocalNow(timeZone)), 1000);
    const refreshTimer = setInterval(() => void refresh(), WEATHER_REFRESH_MS);

    return () => {
      clearInterval(clock);
      clearInterval(refreshTimer);
    };
  }, [isActive, refresh, weather?.timezone]);

  /* ----- the 3D flip: lift, turn, overshoot, settle ----- */

  const finishAnimations = useCallback(() => {
    animationsRef.current.forEach((animation) => {
      try {
        animation.finish();
      } catch {
        // Already finished or cancelled.
      }
    });
    animationsRef.current = [];
  }, []);

  const flip = useCallback(() => {
    const flipper = flipperRef.current;
    const root = rootRef.current;

    if (!flipper || !root || isDraggingRef.current) {
      return;
    }

    const from = rotationRef.current;
    const to = from + 180;
    rotationRef.current = to;
    // Resting pose once the animation ends; always the same direction.
    flipper.style.transform = `rotateX(${to}deg)`;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || !flipper.animate) {
      return;
    }

    finishAnimations();
    // Lift above neighbouring tiles while it turns. A data attribute, not a
    // class: TileShell owns the card's className and re-renders it.
    const cardElement = root.closest(".card");
    if (cardElement) {
      cardElement.dataset.weatherFlipping = "true";
    }

    const main = flipper.animate([
      { offset: 0, transform: flipTransform(0, from, 0, 0), easing: FLIP_EASE },
      { offset: 0.3, transform: flipTransform(90, from + 40, 5, -1.2), easing: FLIP_EASE },
      { offset: 0.62, transform: flipTransform(110, from + 150, 7, -1.6), easing: FLIP_EASE },
      { offset: 0.84, transform: flipTransform(30, from + 186, -3, 0.6), easing: FLIP_EASE },
      { offset: 1, transform: flipTransform(0, to, 0, 0) },
    ], { duration: FLIP_DURATION_MS });
    const animations = [main];

    if (shadowRef.current) {
      animations.push(shadowRef.current.animate([
        { offset: 0, opacity: 0.5, transform: "translateY(0) scale(1, 1)" },
        { offset: 0.3, opacity: 0.24, transform: "translateY(12px) scale(.8, .8)" },
        { offset: 0.62, opacity: 0.2, transform: "translateY(16px) scale(.74, .76)" },
        { offset: 0.84, opacity: 0.55, transform: "translateY(0) scale(1.05, 1)" },
        { offset: 1, opacity: 0.5, transform: "translateY(0) scale(1, 1)" },
      ], { duration: FLIP_DURATION_MS, easing: FLIP_EASE }));
    }

    root.querySelectorAll(".weather-tile__sheen").forEach((sheen) => {
      animations.push(sheen.animate([
        { offset: 0, opacity: 0, transform: "translateX(-115%)" },
        { offset: 0.25, opacity: 1 },
        { offset: 0.85, opacity: 1 },
        { offset: 1, opacity: 0, transform: "translateX(115%)" },
      ], { duration: FLIP_DURATION_MS, easing: "ease-in-out" }));
    });

    animationsRef.current = animations;
    main.onfinish = () => {
      if (cardElement) {
        delete cardElement.dataset.weatherFlipping;
      }
    };
  }, [finishAnimations]);

  useEffect(() => {
    if (!canFlip) {
      return undefined;
    }

    const timer = setInterval(flip, FLIP_EVERY_MS);
    return () => clearInterval(timer);
  }, [canFlip, flip]);

  // Leaving the live state (offline, unmount) lands any flip in progress.
  useEffect(() => {
    if (isLive) {
      return undefined;
    }

    finishAnimations();
    return undefined;
  }, [finishAnimations, isLive]);

  useEffect(() => () => {
    finishAnimations();
    const cardElement = rootRef.current?.closest(".card");
    if (cardElement) {
      delete cardElement.dataset.weatherFlipping;
    }
  }, [finishAnimations]);

  /* ----- render ----- */

  const icon = isLive ? getWeatherIcon(weather.code, weather.isDay) : "clear-day";
  const look = WEATHER_LOOKS[icon];
  const label = isLive ? WEATHER_LABELS[weather.code] || "Weather" : "";
  const scale = (Number.isFinite(card.width) ? card.width : WEATHER_CARD_SIZE.width) / WEATHER_CARD_SIZE.width;
  const timeNow = localNow || (isLive ? getLocalNow(weather.timezone) : "");

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
      className="card--weather"
      renderHint={renderHint}
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      {/* The whole tile is a drag handle: nothing inside it is interactive. */}
      <div
        ref={rootRef}
        className="weather-tile"
        role="img"
        aria-label={isLive
          ? `${weather.city}, ${label}, ${formatDegrees(weather.temperature)}°`
          : status === "offline" ? "Weather unavailable, you are offline" : "Loading weather"}
        {...surfaceGesture}
      >
        <div
          className="weather-tile__scene"
          data-state={isLive ? "live" : status}
          style={{
            "--weather-panel": look.bg,
            "--weather-ink": look.ink,
            transform: scale === 1 ? undefined : `scale(${scale})`,
          }}
        >
          <div ref={shadowRef} className="weather-tile__ground-shadow" />
          <div ref={flipperRef} className="weather-tile__flipper">
            {SLAB_LAYERS.map((layer) => (
              <div
                key={layer.depth}
                className="weather-tile__slab-layer"
                style={{ background: layer.color, transform: `translateZ(-${layer.depth}px)` }}
              />
            ))}

            {isLive ? (
              <>
                <div className="weather-tile__face weather-tile__face--front">
                  <div className="weather-tile__sheen" />
                  <MainPanel weather={weather} icon={icon} />
                  <ForecastPanel days={weather.days} />
                </div>
                <div className="weather-tile__face weather-tile__face--back">
                  <div className="weather-tile__sheen" />
                  <MainPanel weather={weather} icon={icon} />
                  <div className="weather-tile__side">
                    <ClockPanel localNow={timeNow} city={weather.city} />
                    <SunPanel sunEvent={getSunEvent(weather, timeNow)} />
                    <section className="weather-tile__panel weather-tile__panel--metric">
                      <span className="weather-tile__metric-number">{formatDegrees(weather.pressure)}</span>
                      <span className="weather-tile__metric-unit">hPa</span>
                    </section>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <div className="weather-tile__offline">
            <img src={WEATHER_OFFLINE_IMAGE} alt="" draggable={false} />
          </div>
        </div>
      </div>
    </TileShell>
  );
}

export default memo(WeatherTile);
