/* eslint-disable react/no-unknown-property */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import Card from "./Card";
import { AppButton } from "./ui/app";
import { getRootTiles } from "../systems/layout/tileLayout";
import {
  clamp,
  clampGlobePitch,
  createGlobeLayoutPatch,
  getDefaultCameraDistance,
  getFibonacciSphereAngles,
  getFocusAnglesForGlobePoint,
  getRegionalClusteredAngles,
  getSoftGlobeRadius,
  sphericalToCartesian,
} from "../systems/globe/globeLayout";
import { getTileVisibility, projectWorldPoint, rotatePointByYawPitch } from "../systems/globe/globeProjection";
import {
  addOrbitImpulse,
  applyOrbitInertia,
  createOrbitInertia,
  dampMotionState,
  getCinematicFocusDistance,
} from "../systems/globe/globeCamera";
import { getGlobeLodState, getMaxReadableTilesForLod } from "../systems/globe/globeLod";
import { createWindLineGeometries, createWindLineMaterial } from "../systems/globe/globeAtmosphere";
import {
  applyIdleAutoRotation,
  createIdleRotationState,
  markIdleInteractionEnd,
  markIdleInteractionStart,
  touchIdleInteraction,
} from "../systems/globe/globeMotion";
import { STAR_LAYER_MOTION, animateStarLayer, createStarFieldGeometry } from "../systems/globe/globeStars";
import {
  BAND_MOTION,
  animateBandGroup,
  createBandTubeGeometry,
  createGuideRingGeometry,
} from "../systems/globe/globeBands";

const CAMERA_FOV = 34;
const ORBIT_SENSITIVITY = 0.0055;
const ZOOM_SENSITIVITY = 0.00115;
const TILE_WIDTH_RATIO = 0.128;
const TILE_LIFT_RATIO = 0.028;

function createSurfaceDotsGeometry(radius) {
  const dotCount = Math.max(1800, Math.round(radius * 1.7));
  const positions = new Float32Array(dotCount * 3);

  for (let index = 0; index < dotCount; index += 1) {
    const { theta, phi } = getFibonacciSphereAngles(index, dotCount);
    const point = sphericalToCartesian(radius * 1.014, theta, phi);
    const offset = index * 3;
    positions[offset] = point.x;
    positions[offset + 1] = point.y;
    positions[offset + 2] = point.z;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geometry;
}

function noop() {}

function GlobeScene({
  radius,
  minimumCameraDistance,
  maximumCameraDistance,
  motionRef,
  targetViewRef,
  orbitInertiaRef,
  idleRotationRef,
  tileEntries,
  focusedTileId,
  hoveredTileId,
  onFrameData,
}) {
  const globeGroupRef = useRef(null);
  const windMaterialRef = useRef(null);
  const primaryBandGroupRef = useRef(null);
  const secondaryBandGroupRef = useRef(null);
  const guideBandGroupRef = useRef(null);
  const farStarsRef = useRef(null);
  const midStarsRef = useRef(null);
  const nearStarsRef = useRef(null);

  const surfaceDots = useMemo(() => createSurfaceDotsGeometry(radius), [radius]);
  const primaryBandGeometries = useMemo(() => ([
    createBandTubeGeometry({ radius: radius * 1.01, latitude: Math.PI * 0.5, tubeRadius: radius * 0.0034 }),
    createBandTubeGeometry({ radius: radius * 1.012, latitude: Math.PI * 0.36, tubeRadius: radius * 0.0031 }),
    createBandTubeGeometry({ radius: radius * 1.012, latitude: Math.PI * 0.64, tubeRadius: radius * 0.0031 }),
  ]), [radius]);
  const secondaryBandGeometries = useMemo(() => ([
    createBandTubeGeometry({ radius: radius * 1.008, latitude: Math.PI * 0.28, tubeRadius: radius * 0.0018 }),
    createBandTubeGeometry({ radius: radius * 1.008, latitude: Math.PI * 0.72, tubeRadius: radius * 0.0018 }),
    createBandTubeGeometry({ radius: radius * 1.008, latitude: Math.PI * 0.42, tubeRadius: radius * 0.0015 }),
    createBandTubeGeometry({ radius: radius * 1.008, latitude: Math.PI * 0.58, tubeRadius: radius * 0.0015 }),
  ]), [radius]);
  const guideRings = useMemo(() => ([
    createGuideRingGeometry(radius * 1.006, Math.PI * 0.2),
    createGuideRingGeometry(radius * 1.006, Math.PI * 0.8),
    createGuideRingGeometry(radius * 1.006, Math.PI * 0.12),
    createGuideRingGeometry(radius * 1.006, Math.PI * 0.88),
  ]), [radius]);
  const windGeometries = useMemo(() => createWindLineGeometries(radius * 1.032, 10), [radius]);
  const farStars = useMemo(() => createStarFieldGeometry({
    count: 420,
    minRadius: radius * 3.6,
    maxRadius: radius * 5.8,
    equatorBias: 0.12,
  }), [radius]);
  const midStars = useMemo(() => createStarFieldGeometry({
    count: 300,
    minRadius: radius * 2.1,
    maxRadius: radius * 3.5,
    equatorBias: 0.2,
  }), [radius]);
  const nearParticles = useMemo(() => createStarFieldGeometry({
    count: 190,
    minRadius: radius * 1.1,
    maxRadius: radius * 1.35,
    equatorBias: 0.66,
  }), [radius]);

  useFrame(({ camera, size, clock }, deltaSeconds) => {
    applyIdleAutoRotation({
      state: idleRotationRef.current,
      targetView: targetViewRef.current,
      deltaSeconds,
      now: performance.now(),
    });
    applyOrbitInertia(targetViewRef.current, orbitInertiaRef.current, deltaSeconds);
    targetViewRef.current.pitch = clampGlobePitch(targetViewRef.current.pitch);
    targetViewRef.current.cameraDistance = clamp(targetViewRef.current.cameraDistance, minimumCameraDistance, maximumCameraDistance);
    dampMotionState(motionRef.current, targetViewRef.current, deltaSeconds);

    const motion = motionRef.current;
    const lod = getGlobeLodState(motion.cameraDistance, minimumCameraDistance, maximumCameraDistance);

    camera.fov = CAMERA_FOV;
    camera.position.set(0, 0, motion.cameraDistance);
    camera.lookAt(0, 0, 0);
    camera.far = Math.max(14000, motion.cameraDistance * 4);
    camera.updateProjectionMatrix();

    globeGroupRef.current?.rotation.set(motion.pitch, motion.yaw, 0);

    if (windMaterialRef.current) {
      windMaterialRef.current.uniforms.time.value = clock.elapsedTime;
      windMaterialRef.current.uniforms.focusBoost.value = focusedTileId ? 1 : 0;
    }
    animateBandGroup(primaryBandGroupRef.current, BAND_MOTION.primary, deltaSeconds);
    animateBandGroup(secondaryBandGroupRef.current, BAND_MOTION.secondary, deltaSeconds);
    animateBandGroup(guideBandGroupRef.current, BAND_MOTION.guide, deltaSeconds);
    animateStarLayer(farStarsRef.current, STAR_LAYER_MOTION.far, deltaSeconds);
    animateStarLayer(midStarsRef.current, STAR_LAYER_MOTION.mid, deltaSeconds);
    animateStarLayer(nearStarsRef.current, STAR_LAYER_MOTION.near, deltaSeconds);

    const ranked = tileEntries
      .map((entry) => {
        const worldPoint = rotatePointByYawPitch(entry.point, motion.yaw, motion.pitch);
        const visibility = getTileVisibility(worldPoint, motion.cameraDistance);

        return {
          entry,
          worldPoint,
          visibility,
          score: visibility.opacity * (0.6 + (visibility.facing * 0.4)),
        };
      })
      .sort((a, b) => b.score - a.score);

    const maxReadable = Math.min(getMaxReadableTilesForLod(lod), 120);
    const visibleSet = new Set(ranked.slice(0, maxReadable).map((item) => item.entry.id));
    const byId = new Map(ranked.map((item) => [item.entry.id, item]));

    const projectedTiles = [];
    const screenData = new Map();
    let focusedProjection = null;
    let nextVisibleCount = 0;

    const projectionScaleFactor = size.height / (2 * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV) * 0.5));

    tileEntries.forEach((entry) => {
      const metric = byId.get(entry.id);
      if (!metric) return;

      const isFocused = focusedTileId === entry.id;
      const isHovered = hoveredTileId === entry.id;
      const showAtLod = isFocused || (lod.tier !== "far" && visibleSet.has(entry.id));
      const lodWeight = lod.tier === "far" ? 0.2 : (lod.tier === "mid" ? 0.9 : 1);

      let opacity = metric.visibility.opacity * lodWeight;
      if (!showAtLod) opacity *= 0.22;
      if (isFocused) opacity = Math.max(opacity, 0.96);

      const normal = new THREE.Vector3(entry.normal.x, entry.normal.y, entry.normal.z);
      const hoverLift = radius * (0.004 * (isHovered ? 1 : 0));
      const focusLift = radius * (0.007 * (isFocused ? 1 : 0));
      const tilePoint = normal.multiplyScalar(radius + entry.baseLift + hoverLift + focusLift);
      const worldTilePoint = rotatePointByYawPitch(tilePoint, motion.yaw, motion.pitch);

      if (opacity > 0.08) {
        nextVisibleCount += 1;
      }

      const projected = projectWorldPoint(worldTilePoint, camera, size.width, size.height);
      if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
        return;
      }

      const toCameraX = camera.position.x - worldTilePoint.x;
      const toCameraY = camera.position.y - worldTilePoint.y;
      const toCameraZ = camera.position.z - worldTilePoint.z;
      const distanceToCamera = Math.max(1, Math.sqrt((toCameraX * toCameraX) + (toCameraY * toCameraY) + (toCameraZ * toCameraZ)));

      const screenWidth = entry.worldWidth * (projectionScaleFactor / distanceToCamera);
      const baseScale = clamp(screenWidth / Math.max(120, entry.cardWidth), 0.18, 1.06);
      const interactionScale = 1 + ((isHovered ? 0.04 : 0) + (isFocused ? 0.08 : 0));
      const scale = baseScale * interactionScale;

      screenData.set(entry.id, {
        x: projected.x,
        y: projected.y,
        opacity,
      });

      if (isFocused) {
        focusedProjection = { x: projected.x, y: projected.y, opacity, scale };
        return;
      }

      if (opacity < 0.06 || (lod.tier === "far" && !isHovered)) {
        return;
      }

      projectedTiles.push({
        id: entry.id,
        x: projected.x,
        y: projected.y - ((isHovered ? 5 : 0) + (isFocused ? 8 : 0)),
        opacity,
        scale,
        depth: projected.depth,
      });
    });

    projectedTiles.sort((a, b) => a.depth - b.depth);

    onFrameData({
      projectedTiles,
      focusedProjection,
      screenData,
      visibleCount: nextVisibleCount,
      lodTier: lod.tier,
    });
  });

  return (
    <>
      <group ref={farStarsRef} renderOrder={2}>
        <points geometry={farStars}>
          <pointsMaterial
            color="#f5eee4"
            size={radius * 0.0032}
            transparent
            opacity={0.16}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      </group>

      <group ref={midStarsRef} renderOrder={4}>
        <points geometry={midStars}>
          <pointsMaterial
            color="#f8e8d0"
            size={radius * 0.0038}
            transparent
            opacity={0.2}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      </group>

      <ambientLight intensity={0.55} color="#f3eadf" />
      <directionalLight position={[4.3, 5.8, 8.2]} intensity={1.08} color="#fff3dd" />
      <directionalLight position={[-4.4, -3.1, -5.2]} intensity={0.42} color="#bed2ff" />

      <group ref={globeGroupRef}>
        <mesh renderOrder={10}>
          <sphereGeometry args={[radius, 64, 64]} />
          <meshStandardMaterial
            color="#dbc9b4"
            roughness={0.96}
            metalness={0.03}
            polygonOffset
            polygonOffsetFactor={1}
            polygonOffsetUnits={1}
          />
        </mesh>

        <points geometry={surfaceDots} renderOrder={14}>
          <pointsMaterial
            color="#bca183"
            size={radius * 0.0066}
            transparent
            opacity={0.42}
            depthWrite={false}
          />
        </points>

        <group ref={primaryBandGroupRef}>
          {primaryBandGeometries.map((geometry, index) => (
            <mesh key={`primary-${index}`} geometry={geometry} renderOrder={18}>
              <meshBasicMaterial color="#f2d7b1" transparent opacity={0.32} depthWrite={false} />
            </mesh>
          ))}
        </group>

        <group ref={secondaryBandGroupRef}>
          {secondaryBandGeometries.map((geometry, index) => (
            <mesh key={`secondary-${index}`} geometry={geometry} renderOrder={19}>
              <meshBasicMaterial color="#efd0a8" transparent opacity={0.22} depthWrite={false} />
            </mesh>
          ))}
        </group>

        <group ref={guideBandGroupRef}>
          {guideRings.map((geometry, index) => (
            <line key={`guide-${index}`} geometry={geometry} renderOrder={20}>
              <lineBasicMaterial
                color="#f6dcc2"
                transparent
                opacity={0.13}
                depthWrite={false}
              />
            </line>
          ))}
        </group>

        {windGeometries.map((geometry, index) => (
          <mesh key={`wind-${index}`} geometry={geometry} renderOrder={24}>
            <primitive object={windMaterialRef.current ?? (windMaterialRef.current = createWindLineMaterial())} attach="material" />
          </mesh>
        ))}

        <group ref={nearStarsRef} renderOrder={26}>
          <points geometry={nearParticles}>
            <pointsMaterial
              color="#f7ddbb"
              size={radius * 0.0048}
              transparent
              opacity={0.18}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </points>
        </group>

        <mesh scale={1.074} renderOrder={30}>
          <sphereGeometry args={[radius, 40, 40]} />
          <meshBasicMaterial
            color="#ffe9ca"
            transparent
            opacity={0.095}
            side={THREE.BackSide}
            depthWrite={false}
          />
        </mesh>
      </group>
    </>
  );
}

export default function GlobeWorkspaceView({
  allCards,
  cards,
  view,
  setWorkspaceView,
  updateExistingCards,
  openTileLink,
  updateTileFromMediaLoad,
  retryTilePreview,
  onVisibleCountChange,
  onRemoveTile,
}) {
  const containerRef = useRef(null);
  const motionRef = useRef({
    yaw: view?.yaw ?? 0,
    pitch: view?.pitch ?? 0,
    cameraDistance: view?.cameraDistance ?? getDefaultCameraDistance(getSoftGlobeRadius(cards.length)),
  });
  const targetViewRef = useRef({ ...motionRef.current });
  const orbitInertiaRef = useRef(createOrbitInertia());
  const dragStateRef = useRef(null);
  const tileScreenCacheRef = useRef(new Map());
  const idleRotationRef = useRef(createIdleRotationState());
  const wheelInteractionTimeoutRef = useRef(null);

  const [visibleCount, setVisibleCount] = useState(0);
  const [lodTier, setLodTier] = useState("mid");
  const [hoveredTileId, setHoveredTileId] = useState(null);
  const [projectedTiles, setProjectedTiles] = useState([]);
  const [focusedProjection, setFocusedProjection] = useState(null);

  const rootCards = useMemo(() => getRootTiles(cards), [cards]);
  const cardById = useMemo(() => new Map(rootCards.map((card) => [card.id, card])), [rootCards]);

  const globeRadius = useMemo(() => getSoftGlobeRadius(rootCards.length), [rootCards.length]);
  const minimumCameraDistance = useMemo(() => getDefaultCameraDistance(globeRadius), [globeRadius]);
  const maximumCameraDistance = useMemo(() => Math.max(minimumCameraDistance + 1200, globeRadius * 4.2), [globeRadius, minimumCameraDistance]);

  const focusedCard = useMemo(() => rootCards.find((card) => card.id === view?.focusedTileId) ?? null, [rootCards, view?.focusedTileId]);

  useEffect(() => {
    onVisibleCountChange?.(visibleCount);
  }, [onVisibleCountChange, visibleCount]);

  useEffect(() => () => {
    if (wheelInteractionTimeoutRef.current) {
      window.clearTimeout(wheelInteractionTimeoutRef.current);
      wheelInteractionTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    const missingLayoutPatch = createGlobeLayoutPatch(allCards);
    if (Object.keys(missingLayoutPatch).length > 0) updateExistingCards(missingLayoutPatch);
  }, [allCards, updateExistingCards]);

  useEffect(() => {
    setWorkspaceView((currentView) => {
      const nextView = currentView ?? view ?? null;
      const focusedTileStillExists = rootCards.some((card) => card.id === nextView?.focusedTileId);
      const nextCameraDistance = clamp(
        Number.isFinite(nextView?.cameraDistance) ? nextView.cameraDistance : minimumCameraDistance,
        minimumCameraDistance,
        maximumCameraDistance,
      );

      if (
        nextView?.globeRadius === globeRadius
        && nextView?.cameraDistance === nextCameraDistance
        && focusedTileStillExists === Boolean(nextView?.focusedTileId)
        && nextView?.mode === "globe"
      ) {
        return nextView;
      }

      return {
        ...(nextView ?? {}),
        mode: nextView?.mode === "globe" ? "globe" : "flat",
        globeRadius,
        cameraDistance: nextCameraDistance,
        focusedTileId: focusedTileStillExists ? nextView?.focusedTileId ?? null : null,
      };
    });
  }, [globeRadius, maximumCameraDistance, minimumCameraDistance, rootCards, setWorkspaceView, view]);

  useEffect(() => {
    targetViewRef.current = {
      yaw: view?.yaw ?? 0,
      pitch: view?.pitch ?? 0,
      cameraDistance: clamp(view?.cameraDistance ?? minimumCameraDistance, minimumCameraDistance, maximumCameraDistance),
    };
  }, [maximumCameraDistance, minimumCameraDistance, view]);

  const tileEntries = useMemo(() => {
    const clusteredAnglesById = getRegionalClusteredAngles(rootCards);

    return rootCards.map((card, index) => {
      const globe = clusteredAnglesById.get(card.id) ?? card.layout?.globe ?? getFibonacciSphereAngles(index, Math.max(1, rootCards.length));
      const point = sphericalToCartesian(globeRadius, globe.theta, globe.phi);
      const length = Math.max(1e-6, Math.sqrt((point.x * point.x) + (point.y * point.y) + (point.z * point.z)));
      const normal = { x: point.x / length, y: point.y / length, z: point.z / length };
      const worldWidth = clamp(globeRadius * TILE_WIDTH_RATIO, 88, 248);

      return {
        id: card.id,
        card,
        point,
        normal,
        worldWidth,
        baseLift: globeRadius * TILE_LIFT_RATIO,
        cardWidth: Math.max(160, Number.isFinite(card?.width) ? card.width : 320),
        cardHeight: Math.max(96, Number.isFinite(card?.height) ? card.height : 180),
      };
    });
  }, [globeRadius, rootCards]);

  const updateViewPartial = useCallback((partial, clearFocus = false) => {
    const nextTarget = { ...targetViewRef.current, ...partial };
    nextTarget.pitch = clampGlobePitch(nextTarget.pitch);
    nextTarget.cameraDistance = clamp(nextTarget.cameraDistance, minimumCameraDistance, maximumCameraDistance);
    targetViewRef.current = nextTarget;

    setWorkspaceView((currentView) => ({
      ...(currentView ?? view ?? {}),
      ...partial,
      cameraDistance: nextTarget.cameraDistance,
      pitch: nextTarget.pitch,
      focusedTileId: clearFocus ? null : (partial.focusedTileId ?? currentView?.focusedTileId ?? null),
    }));
  }, [maximumCameraDistance, minimumCameraDistance, setWorkspaceView, view]);

  const focusTileById = useCallback((tileId) => {
    const tileEntry = tileEntries.find((entry) => entry.id === tileId);
    if (!tileEntry) return;

    const focusAngles = getFocusAnglesForGlobePoint(tileEntry.point);
    updateViewPartial({
      yaw: focusAngles.yaw,
      pitch: clampGlobePitch((focusAngles.pitch * 0.88) - 0.06),
      cameraDistance: getCinematicFocusDistance(globeRadius, minimumCameraDistance, maximumCameraDistance),
      focusedTileId: tileId,
    });
  }, [globeRadius, maximumCameraDistance, minimumCameraDistance, tileEntries, updateViewPartial]);

  const pickTileAtPoint = useCallback((clientX, clientY, threshold = 94) => {
    const container = containerRef.current;
    if (!container) return null;

    const rect = container.getBoundingClientRect();
    const pointerX = clientX - rect.left;
    const pointerY = clientY - rect.top;

    let bestTile = null;
    let bestScore = Infinity;

    tileScreenCacheRef.current.forEach((data, tileId) => {
      if (data.opacity < 0.1) return;
      const dx = data.x - pointerX;
      const dy = data.y - pointerY;
      const distance = Math.sqrt((dx * dx) + (dy * dy));
      const score = distance - (data.opacity * 18);

      if (score < bestScore && distance < threshold) {
        bestScore = score;
        bestTile = tileId;
      }
    });

    return bestTile;
  }, []);

  const clearFocusedTile = useCallback(() => {
    updateViewPartial({ focusedTileId: null });
  }, [updateViewPartial]);

  const handleWheel = useCallback((event) => {
    event.preventDefault();
    markIdleInteractionStart(idleRotationRef.current);
    touchIdleInteraction(idleRotationRef.current);
    const distanceFactor = Math.exp(event.deltaY * ZOOM_SENSITIVITY);
    updateViewPartial({ cameraDistance: targetViewRef.current.cameraDistance * distanceFactor });
    if (wheelInteractionTimeoutRef.current) {
      window.clearTimeout(wheelInteractionTimeoutRef.current);
    }
    wheelInteractionTimeoutRef.current = window.setTimeout(() => {
      markIdleInteractionEnd(idleRotationRef.current);
    }, 240);
  }, [updateViewPartial]);

  const handlePointerDown = useCallback((event) => {
    if (
      event.button !== 0
      || event.target.closest?.("[data-globe-focused-overlay='true']")
      || event.target.closest?.("[data-globe-action-chip='true']")
      || event.target.closest?.("[data-globe-card='true']")
    ) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: performance.now(),
      startYaw: targetViewRef.current.yaw,
      startPitch: targetViewRef.current.pitch,
      moved: false,
    };
    markIdleInteractionStart(idleRotationRef.current);

    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback((event) => {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      const hoveredTile = pickTileAtPoint(event.clientX, event.clientY, 100);
      setHoveredTileId((current) => (current === hoveredTile ? current : hoveredTile));
      return;
    }

    const now = performance.now();
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    const moveDeltaX = event.clientX - dragState.lastX;
    const moveDeltaY = event.clientY - dragState.lastY;

    if ((Math.abs(deltaX) + Math.abs(deltaY)) > 4) {
      dragState.moved = true;
    }
    touchIdleInteraction(idleRotationRef.current);

    addOrbitImpulse(
      orbitInertiaRef.current,
      moveDeltaX * ORBIT_SENSITIVITY,
      moveDeltaY * ORBIT_SENSITIVITY,
      (now - dragState.lastTime) / 1000,
    );

    dragState.lastX = event.clientX;
    dragState.lastY = event.clientY;
    dragState.lastTime = now;

    setHoveredTileId(null);

    updateViewPartial({
      yaw: dragState.startYaw + (deltaX * ORBIT_SENSITIVITY),
      pitch: clampGlobePitch(dragState.startPitch + (deltaY * ORBIT_SENSITIVITY)),
    }, true);
  }, [pickTileAtPoint, updateViewPartial]);

  const handlePointerUp = useCallback((event) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    markIdleInteractionEnd(idleRotationRef.current);

    if (dragState.moved) {
      return;
    }

    const tileId = pickTileAtPoint(event.clientX, event.clientY, 92);
    if (tileId) {
      focusTileById(tileId);
    }
  }, [focusTileById, pickTileAtPoint]);

  const handleFrameData = useCallback(({ projectedTiles: nextProjectedTiles, focusedProjection: nextFocusedProjection, screenData, visibleCount: nextVisibleCount, lodTier: nextLodTier }) => {
    tileScreenCacheRef.current = screenData;
    setProjectedTiles(nextProjectedTiles);
    setFocusedProjection(nextFocusedProjection);
    setVisibleCount((current) => (current === nextVisibleCount ? current : nextVisibleCount));
    setLodTier((current) => (current === nextLodTier ? current : nextLodTier));
  }, []);

  const handleRemoveFocusedTile = useCallback(() => {
    if (!focusedCard) return;
    onRemoveTile?.(focusedCard.id);
    clearFocusedTile();
  }, [clearFocusedTile, focusedCard, onRemoveTile]);

  const focusedOverlayStyle = useMemo(() => {
    if (!focusedProjection || !focusedCard) {
      return {
        opacity: 0,
        visibility: "hidden",
        pointerEvents: "none",
      };
    }

    const zoomRatio = 1 - ((targetViewRef.current.cameraDistance - minimumCameraDistance) / Math.max(1, maximumCameraDistance - minimumCameraDistance));
    const scale = clamp(0.68 + (zoomRatio * 0.34), 0.72, 1.1);

    return {
      opacity: clamp(focusedProjection.opacity, 0, 1),
      visibility: "visible",
      pointerEvents: "auto",
      transform: `translate3d(${focusedProjection.x.toFixed(2)}px, ${focusedProjection.y.toFixed(2)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`,
    };
  }, [focusedCard, focusedProjection, maximumCameraDistance, minimumCameraDistance]);

  const actionChipStyle = useMemo(() => {
    if (!focusedProjection || !focusedCard) {
      return {
        opacity: 0,
        visibility: "hidden",
        pointerEvents: "none",
        transform: "translate3d(-9999px, -9999px, 0)",
      };
    }

    return {
      opacity: clamp(focusedProjection.opacity, 0, 1),
      visibility: "visible",
      pointerEvents: "auto",
      transform: `translate3d(${(focusedProjection.x + 30).toFixed(2)}px, ${(focusedProjection.y - 44).toFixed(2)}px, 0)`,
    };
  }, [focusedCard, focusedProjection]);

  return (
    <div
      ref={containerRef}
      className="globe-workspace"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => setHoveredTileId(null)}
    >
      <Canvas className="globe-workspace__scene" camera={{ fov: CAMERA_FOV, position: [0, 0, minimumCameraDistance] }}>
        <fog attach="fog" args={["#eadcc8", globeRadius * 2.2, globeRadius * 5.8]} />
        <GlobeScene
          radius={globeRadius}
          minimumCameraDistance={minimumCameraDistance}
          maximumCameraDistance={maximumCameraDistance}
          motionRef={motionRef}
          targetViewRef={targetViewRef}
          orbitInertiaRef={orbitInertiaRef}
          idleRotationRef={idleRotationRef}
          tileEntries={tileEntries}
          focusedTileId={view?.focusedTileId ?? null}
          hoveredTileId={hoveredTileId}
          onFrameData={handleFrameData}
        />
      </Canvas>

      <div className="globe-workspace__tile-layer" aria-hidden={false}>
        {projectedTiles.map((tileProjection) => {
          const card = cardById.get(tileProjection.id);
          if (!card) return null;

          const tileMeta = {
            isHovered: hoveredTileId === card.id,
            interactionState: hoveredTileId === card.id ? "hovered" : "idle",
            styleVars: {
              "--tile-width": `${Math.max(140, card.width || 320)}px`,
              "--tile-height": `${Math.max(90, card.height || 180)}px`,
              "--tile-x": "0px",
              "--tile-y": "0px",
              "--tile-z": "1",
            },
          };

          return (
            <div
              key={card.id}
              className="globe-workspace__projected-tile"
              data-globe-card="true"
              style={{
                transform: `translate3d(${tileProjection.x.toFixed(2)}px, ${tileProjection.y.toFixed(2)}px, 0) translate(-50%, -50%) scale(${tileProjection.scale.toFixed(3)})`,
                opacity: clamp(tileProjection.opacity, 0, 1),
                zIndex: Math.max(1, Math.round((1 - tileProjection.depth) * 5000)),
              }}
              onPointerEnter={() => setHoveredTileId(card.id)}
              onPointerLeave={() => setHoveredTileId((current) => (current === card.id ? null : current))}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                focusTileById(card.id);
              }}
            >
              <Card
                card={card}
                tileMeta={tileMeta}
                viewportZoom={1}
                dragVisualDelta={null}
                dragVisualTileIdSet={null}
                childTiles={[]}
                folderState={null}
                rackState={null}
                performanceMode={{ simplifyDuringMotion: false }}
                onBeginDrag={noop}
                onContextMenu={noop}
                onHoverChange={noop}
                onFocusIn={noop}
                onFocusOut={noop}
                onOpenLink={openTileLink}
                onMediaLoad={updateTileFromMediaLoad}
                onPressStart={noop}
                onRetry={retryTilePreview}
              />
              <div className="globe-workspace__tile-contact" />
            </div>
          );
        })}
      </div>

      <div
        className="globe-workspace__focused-overlay"
        data-globe-focused-overlay="true"
        style={focusedOverlayStyle}
      >
        {focusedCard ? (
          <Card
            card={focusedCard}
            tileMeta={{
              isFocused: true,
              interactionState: "focused",
              styleVars: {
                "--tile-width": `${Math.max(140, focusedCard.width || 320)}px`,
                "--tile-height": `${Math.max(90, focusedCard.height || 180)}px`,
                "--tile-x": "0px",
                "--tile-y": "0px",
                "--tile-z": "1",
              },
            }}
            viewportZoom={1}
            dragVisualDelta={null}
            dragVisualTileIdSet={null}
            childTiles={[]}
            folderState={null}
            rackState={null}
            performanceMode={{ simplifyDuringMotion: false }}
            onBeginDrag={noop}
            onContextMenu={noop}
            onHoverChange={noop}
            onFocusIn={noop}
            onFocusOut={noop}
            onOpenLink={openTileLink}
            onMediaLoad={updateTileFromMediaLoad}
            onPressStart={noop}
            onRetry={retryTilePreview}
          />
        ) : null}
      </div>

      <div
        className="globe-workspace__action-chip"
        data-globe-action-chip="true"
        style={actionChipStyle}
      >
        <AppButton tone="unstyled" type="button" className="globe-workspace__action-chip-button" onClick={handleRemoveFocusedTile}>Remove</AppButton>
        <AppButton tone="unstyled" type="button" className="globe-workspace__action-chip-button" onClick={clearFocusedTile}>Keep underneath</AppButton>
      </div>

      <div className="globe-workspace__status">
        <span>Globe View</span>
        <span>{visibleCount}/{rootCards.length} visible</span>
        <span>LOD {lodTier}</span>
      </div>
    </div>
  );
}

