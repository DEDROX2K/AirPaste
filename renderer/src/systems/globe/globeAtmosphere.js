import * as THREE from "three";
import { getFibonacciSphereAngles, sphericalToCartesian } from "./globeLayout";

export function createWindLineGeometries(radius, count = 14) {
  return Array.from({ length: count }, (_, lineIndex) => {
    const start = getFibonacciSphereAngles((lineIndex * 5) + 3, count * 7);
    const segments = 36;
    const points = [];
    const spread = 0.28 + ((lineIndex % 4) * 0.06);

    for (let step = 0; step < segments; step += 1) {
      const t = step / (segments - 1);
      const theta = start.theta + (t * spread * Math.PI * 2);
      const phi = THREE.MathUtils.clamp(start.phi + (Math.sin(t * Math.PI * 2) * 0.12), 0.16, Math.PI - 0.16);
      const offset = 1.08 + (Math.sin((t * Math.PI) + (lineIndex * 0.4)) * 0.025);
      const point = sphericalToCartesian(radius * offset, theta, phi);
      points.push(new THREE.Vector3(point.x, point.y, point.z));
    }

    const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.45);
    return new THREE.TubeGeometry(curve, 96, Math.max(1.3, radius * 0.00185), 8, false);
  });
}

export function createWindLineMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      baseOpacity: { value: 0.16 },
      focusBoost: { value: 0 },
      flowColor: { value: new THREE.Color("#f4d4a5") },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying float vFlow;

      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vFlow = uv.x;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float baseOpacity;
      uniform float focusBoost;
      uniform vec3 flowColor;
      varying vec3 vWorldPos;
      varying float vFlow;

      void main() {
        vec3 sphereNormal = normalize(vWorldPos);
        vec3 toCamera = normalize(cameraPosition - vWorldPos);
        float facing = dot(sphereNormal, toCamera);
        float frontFade = smoothstep(-0.22, 0.28, facing);
        float silhouette = pow(1.0 - abs(facing), 1.2);
        float flow = 0.45 + (0.55 * sin((vFlow * 20.0) - (time * 0.55)));
        float pulse = 0.5 + (0.5 * sin((vFlow * 10.0) + (time * 0.85)));
        float alpha = baseOpacity * frontFade * (0.55 + (silhouette * 0.85)) * (0.42 + (flow * 0.58)) * (0.6 + (pulse * 0.4));
        alpha *= (1.0 + (focusBoost * 0.45));

        gl_FragColor = vec4(flowColor, alpha);
      }
    `,
  });
}
