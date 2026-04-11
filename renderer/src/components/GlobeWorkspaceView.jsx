import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import Card from "./Card";
import { getRootTiles } from "../systems/layout/tileLayout";
import {
  clamp,
  clampGlobePitch,
  createGlobeLayoutPatch,
  getDefaultCameraDistance,
  getFibonacciSphereAngles,
  getFocusAnglesForGlobePoint,
  getSoftGlobeRadius,
  sphericalToCartesian,
} from "../systems/globe/globeLayout";
import {
  getTileVisibility,
  projectWorldPoint,
  rotatePointByYawPitch,
} from "../systems/globe/globeProjection";

const CAMERA_FOV = 34;
const ORBIT_SENSITIVITY = 0.0055;
const ZOOM_SENSITIVITY = 0.00115;
const GLOBE_STYLE = {
  surfaceColor: "#f7f1e7",
  dotColor: "#f7f1e7",
  auraRimColor: "#f4d3a3",
  edgeBlurColor: "#fbf0de",
  edgeBlurStrength: 0.22,
  edgeBlurPower: 2.35,
};
const DOT_SPRITE = (() => {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext("2d");

  if (context) {
    const gradient = context.createRadialGradient(16, 16, 1, 16, 16, 15);
    gradient.addColorStop(0, "rgba(118, 100, 80, 0.95)");
    gradient.addColorStop(0.55, "rgba(118, 100, 80, 0.62)");
    gradient.addColorStop(1, "rgba(118, 100, 80, 0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(16, 16, 15, 0, Math.PI * 2);
    context.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
})();

function GlobeScene({ motionRef, radius }) {
  const globeGroupRef = useRef(null);
  const dottedGeometry = useMemo(() => {
    const dotCount = Math.max(1800, Math.round(radius * 1.9));
    const positions = new Float32Array(dotCount * 3);

    for (let index = 0; index < dotCount; index += 1) {
      const { theta, phi } = getFibonacciSphereAngles(index, dotCount);
      const point = sphericalToCartesian(radius * 1.006, theta, phi);
      const offset = index * 3;
      positions[offset] = point.x;
      positions[offset + 1] = point.y;
      positions[offset + 2] = point.z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, [radius]);
  const haloGeometry = useMemo(() => new THREE.SphereGeometry(radius * 1.038, 36, 36), [radius]);
  const rimMaterial = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: {
      rimColor: { value: new THREE.Color(GLOBE_STYLE.edgeBlurColor) },
      strength: { value: GLOBE_STYLE.edgeBlurStrength },
      power: { value: GLOBE_STYLE.edgeBlurPower },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vec4 mvPosition = viewMatrix * worldPosition;
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 rimColor;
      uniform float strength;
      uniform float power;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), power);
        float alpha = fresnel * strength;
        gl_FragColor = vec4(rimColor, alpha);
      }
    `,
  }), []);

  useFrame(({ camera }) => {
    const motion = motionRef.current;

    if (globeGroupRef.current) {
      globeGroupRef.current.rotation.set(motion.pitch, motion.yaw, 0);
    }

    camera.fov = CAMERA_FOV;
    camera.position.set(0, 0, motion.cameraDistance);
    camera.lookAt(0, 0, 0);
    camera.far = Math.max(12000, motion.cameraDistance * 3.4);
    camera.updateProjectionMatrix();

    globeGroupRef.current?.children?.forEach((child) => {
      if (child.userData?.isPulse) {
        child.material.opacity = 0.15 + (Math.sin(performance.now() * 0.0013) * 0.05);
      }
    });
  });

  return (
    <>
      <ambientLight intensity={1.15} />
      <directionalLight position={[4, 3, 7]} intensity={1.2} color="#fff5dc" />
      <directionalLight position={[-5, -4, -6]} intensity={0.5} color="#d0dfff" />
      <group ref={globeGroupRef}>
        <mesh>
          <sphereGeometry args={[radius, 48, 48]} />
          <meshStandardMaterial
            color={GLOBE_STYLE.surfaceColor}
            transparent
            opacity={0.96}
            roughness={0.96}
            metalness={0.02}
          />
        </mesh>
        <points geometry={dottedGeometry}>
          <pointsMaterial
            map={DOT_SPRITE}
            color={GLOBE_STYLE.dotColor}
            size={radius * 0.012}
            sizeAttenuation
            transparent
            opacity={0.56}
            alphaTest={0.08}
            depthWrite={false}
          />
        </points>
        <mesh userData={{ isPulse: true }} geometry={haloGeometry}>
          <meshBasicMaterial color={GLOBE_STYLE.auraRimColor} transparent opacity={0.12} side={THREE.BackSide} />
        </mesh>
        <mesh scale={1.06} material={rimMaterial}>
          <sphereGeometry args={[radius, 40, 40]} />
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
  toggleFolder,
  onVisibleCountChange,
}) {
  const containerRef = useRef(null);
  const overlayRef = useRef(null);
  const wrapperRefs = useRef(new Map());
  const cameraRef = useRef(new THREE.PerspectiveCamera(CAMERA_FOV, 1, 1, 12000));
  const motionRef = useRef({
    yaw: view?.yaw ?? 0,
    pitch: view?.pitch ?? 0,
    cameraDistance: view?.cameraDistance ?? getDefaultCameraDistance(getSoftGlobeRadius(cards.length)),
  });
  const targetViewRef = useRef(motionRef.current);
  const dragStateRef = useRef(null);
  const visibleCountRef = useRef(0);
  const [visibleCount, setVisibleCount] = useState(0);
  const performanceMode = useMemo(() => ({
    simplifyDuringMotion: false,
  }), []);

  const rootCards = useMemo(() => getRootTiles(cards), [cards]);
  const globeRadius = useMemo(() => getSoftGlobeRadius(rootCards.length), [rootCards.length]);
  const minimumCameraDistance = useMemo(() => getDefaultCameraDistance(globeRadius), [globeRadius]);
  const maximumCameraDistance = useMemo(() => Math.max(minimumCameraDistance + 1200, globeRadius * 4.2), [globeRadius, minimumCameraDistance]);

  useEffect(() => {
    onVisibleCountChange?.(visibleCount);
  }, [onVisibleCountChange, visibleCount]);

  useEffect(() => {
    const missingLayoutPatch = createGlobeLayoutPatch(allCards);

    if (Object.keys(missingLayoutPatch).length > 0) {
      updateExistingCards(missingLayoutPatch);
    }
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
        && nextCameraDistance === nextView?.cameraDistance
        && focusedTileStillExists === Boolean(nextView?.focusedTileId)
      ) {
        return nextView;
      }

      return {
        ...(nextView ?? {}),
        mode: nextView?.mode === "globe" ? "globe" : "flat",
        globeRadius,
        cameraDistance: nextCameraDistance,
        focusedTileId: focusedTileStillExists ? nextView.focusedTileId : null,
      };
    });
  }, [globeRadius, maximumCameraDistance, minimumCameraDistance, rootCards, setWorkspaceView, view]);

  useEffect(() => {
    targetViewRef.current = {
      yaw: view?.yaw ?? 0,
      pitch: view?.pitch ?? 0,
      cameraDistance: clamp(
        view?.cameraDistance ?? minimumCameraDistance,
        minimumCameraDistance,
        maximumCameraDistance,
      ),
    };
  }, [globeRadius, maximumCameraDistance, minimumCameraDistance, view]);

  const getTileGlobePoint = useCallback((card, index) => {
    const globe = card.layout?.globe ?? getFibonacciSphereAngles(index, rootCards.length);

    return sphericalToCartesian(globeRadius, globe.theta, globe.phi);
  }, [globeRadius, rootCards.length]);

  const updateOverlay = useCallback(() => {
    const container = containerRef.current;
    const overlay = overlayRef.current;

    if (!container || !overlay) {
      return;
    }

    const { width, height } = container.getBoundingClientRect();

    if (!width || !height) {
      return;
    }

    const camera = cameraRef.current;
    const motion = motionRef.current;
    let nextVisibleCount = 0;

    camera.aspect = width / height;
    camera.position.set(0, 0, motion.cameraDistance);
    camera.lookAt(0, 0, 0);
    camera.fov = CAMERA_FOV;
    camera.far = Math.max(12000, motion.cameraDistance * 3.4);
    camera.updateProjectionMatrix();

    overlay.style.setProperty("--globe-overlay-perspective", `${Math.round(motion.cameraDistance)}px`);

    rootCards.forEach((card, index) => {
      const wrapper = wrapperRefs.current.get(card.id);

      if (!wrapper) {
        return;
      }

      const localPoint = getTileGlobePoint(card, index);
      const worldPoint = rotatePointByYawPitch(localPoint, motion.yaw, motion.pitch);
      const visibility = getTileVisibility(worldPoint, motion.cameraDistance);

      if (!visibility.isVisible) {
        wrapper.style.opacity = "0";
        wrapper.style.visibility = "hidden";
        wrapper.style.pointerEvents = "none";
        return;
      }

      nextVisibleCount += 1;

      const projectedPoint = projectWorldPoint(worldPoint, camera, width, height);
      // Front tiles keep a small sphere-driven tilt so they read flatter without losing the globe cue.
      const perspectiveScale = motion.cameraDistance / Math.max(220, motion.cameraDistance - worldPoint.z);
      const scale = clamp(((globeRadius / motion.cameraDistance) * 0.9) * perspectiveScale, 0.28, 0.92);
      const opacity = clamp((visibility.facing - 0.06) / 0.84, 0.22, 1);
      const rotateY = clamp((-worldPoint.x / globeRadius) * 18, -18, 18);
      const rotateX = clamp((worldPoint.y / globeRadius) * 12, -12, 12);
      const zIndex = 2000 + Math.round(((worldPoint.z / globeRadius) + 1) * 1000);

      wrapper.style.visibility = "visible";
      wrapper.style.pointerEvents = "auto";
      wrapper.style.opacity = opacity.toFixed(3);
      wrapper.style.zIndex = String(zIndex);
      wrapper.style.transform = [
        `translate3d(${projectedPoint.x.toFixed(2)}px, ${projectedPoint.y.toFixed(2)}px, 0)`,
        "translate(-50%, -50%)",
        `scale(${scale.toFixed(4)})`,
        `rotateX(${rotateX.toFixed(2)}deg)`,
        `rotateY(${rotateY.toFixed(2)}deg)`,
      ].join(" ");
    });

    if (visibleCountRef.current !== nextVisibleCount) {
      visibleCountRef.current = nextVisibleCount;
      setVisibleCount(nextVisibleCount);
    }
  }, [getTileGlobePoint, globeRadius, rootCards]);

  useEffect(() => {
    let animationFrameId = 0;
    let lastFrameTime = performance.now();

    function tick(now) {
      const deltaSeconds = Math.max(1 / 240, (now - lastFrameTime) / 1000);
      lastFrameTime = now;

      motionRef.current = {
        yaw: THREE.MathUtils.damp(motionRef.current.yaw, targetViewRef.current.yaw, 7.5, deltaSeconds),
        pitch: THREE.MathUtils.damp(motionRef.current.pitch, targetViewRef.current.pitch, 7.5, deltaSeconds),
        cameraDistance: THREE.MathUtils.damp(
          motionRef.current.cameraDistance,
          targetViewRef.current.cameraDistance,
          6.5,
          deltaSeconds,
        ),
      };

      updateOverlay();
      animationFrameId = window.requestAnimationFrame(tick);
    }

    animationFrameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [updateOverlay]);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      updateOverlay();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [updateOverlay]);

  const updateViewPartial = useCallback((partial) => {
    targetViewRef.current = {
      ...targetViewRef.current,
      ...partial,
    };

    setWorkspaceView((currentView) => ({
      ...(currentView ?? view ?? {}),
      ...partial,
    }));
  }, [setWorkspaceView, view]);

  const focusTile = useCallback((card, index) => {
    const point = getTileGlobePoint(card, index);
    const focusAngles = getFocusAnglesForGlobePoint(point);

    updateViewPartial({
      yaw: focusAngles.yaw,
      pitch: focusAngles.pitch,
      cameraDistance: clamp(globeRadius * 2.05, minimumCameraDistance, maximumCameraDistance),
      focusedTileId: card.id,
    });
  }, [getTileGlobePoint, globeRadius, maximumCameraDistance, minimumCameraDistance, updateViewPartial]);

  const handleWheel = useCallback((event) => {
    event.preventDefault();

    const distanceFactor = Math.exp(event.deltaY * ZOOM_SENSITIVITY);

    updateViewPartial({
      cameraDistance: clamp(
        targetViewRef.current.cameraDistance * distanceFactor,
        minimumCameraDistance,
        maximumCameraDistance,
      ),
    });
  }, [maximumCameraDistance, minimumCameraDistance, updateViewPartial]);

  const handlePointerDown = useCallback((event) => {
    if (event.button !== 0 || event.target.closest?.("[data-globe-tile='true']")) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startYaw: targetViewRef.current.yaw,
      startPitch: targetViewRef.current.pitch,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback((event) => {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;

    updateViewPartial({
      yaw: dragState.startYaw + (deltaX * ORBIT_SENSITIVITY),
      pitch: clampGlobePitch(dragState.startPitch + (deltaY * ORBIT_SENSITIVITY)),
      focusedTileId: null,
    });
  }, [updateViewPartial]);

  const handlePointerUp = useCallback((event) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const noop = useCallback(() => { }, []);

  const tileMetaById = useMemo(() => Object.fromEntries(
    rootCards.map((card) => [
      card.id,
      {
        isFocused: view?.focusedTileId === card.id,
        interactionState: view?.focusedTileId === card.id ? "focused" : "idle",
        styleVars: {
          "--tile-width": `${card.width}px`,
          "--tile-height": `${card.height}px`,
          "--tile-x": "0px",
          "--tile-y": "0px",
          "--tile-z": "1",
        },
      },
    ]),
  ), [rootCards, view?.focusedTileId]);

  return (
    <div
      ref={containerRef}
      className="globe-workspace"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <Canvas className="globe-workspace__scene" camera={{ fov: CAMERA_FOV, position: [0, 0, minimumCameraDistance] }}>
        <color attach="background" args={["#f5efe5"]} />
        <fog attach="fog" args={["#f5efe5", globeRadius * 1.9, globeRadius * 5.8]} />
        <GlobeScene motionRef={motionRef} radius={globeRadius} />
      </Canvas>

      <div className="globe-workspace__overlay" ref={overlayRef}>
        {rootCards.map((card, index) => (
          <div
            key={card.id}
            ref={(node) => {
              if (node) {
                wrapperRefs.current.set(card.id, node);
              } else {
                wrapperRefs.current.delete(card.id);
              }
            }}
            className="globe-workspace__tile"
            data-globe-tile="true"
            onClick={(event) => {
              event.stopPropagation();
              focusTile(card, index);
            }}
          >
            <Card
              card={card}
              tileMeta={tileMetaById[card.id]}
              viewportZoom={1}
              dragVisualDelta={null}
              dragVisualTileIdSet={null}
              childTiles={[]}
              folderState={null}
              rackState={null}
              performanceMode={performanceMode}
              onBeginDrag={noop}
              onContextMenu={noop}
              onHoverChange={noop}
              onFocusIn={noop}
              onFocusOut={noop}
              onOpenLink={openTileLink}
              onMediaLoad={updateTileFromMediaLoad}
              onPressStart={noop}
              onRetry={retryTilePreview}
              onToggleFolderOpen={toggleFolder}
            />
          </div>
        ))}
      </div>

      <div className="globe-workspace__status">
        <span>Globe View</span>
        <span>{visibleCount}/{rootCards.length} visible</span>
      </div>
    </div>
  );
}
