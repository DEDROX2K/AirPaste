import { useLayoutEffect, useRef } from "react";
import { getCanvasGridSpacing } from "../../systems/canvas/canvasMath";
import { CURVE, createWarp, worldBoxTransform } from "../../systems/canvas/curvedWarp";
import "./CurvedCanvas.css";

// Curved view (the toggle next to Home): the board bends like a shallow
// dome. Mounted only while it's on.
// - dots: a WebGL canvas behind the tiles runs the inverse warp for every
//   pixel, so the grid bends continuously (the CSS grid is hidden)
// - tiles and stacks: every [data-warp-item] in .canvas__content is pinned to
//   its 4 warped corners with a projective matrix3d (curvedWarp.js)
// - strokes: the drawing engine warps its own tiles (DrawingCanvas `curved`)
// - pointer: canvas.setPointUnwarp maps clicks back onto the flat board
// - rim: a faint vignette (WebGL, on top) and three soft backdrop-blur rings
// All of it is redrawn in the viewport listener, the same frame the content
// transform moves, never on a timer.
const VERT = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const COMMON = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uDpr;
uniform float uR0, uK;
out vec4 o;
vec2 screenPx() { return vec2(gl_FragCoord.x, uRes.y * uDpr - gl_FragCoord.y) / uDpr; }
float radial(vec2 p) { vec2 c = uRes * .5; return length(p - c) / length(c); }
vec2 unwarp(vec2 p) {
  vec2 c = uRes * .5; vec2 d = p - c; float rp = length(d) / length(c);
  if (rp <= uR0) return p;
  float t = rp - uR0; float r = rp + uK * t * t * t / ((1. - uR0) * (1. - uR0));
  return c + d * (r / rp);
}
`;

const FRAG_DOTS = `${COMMON}
uniform vec2 uOffset; uniform float uStep, uDotR; uniform vec4 uDot;
void main() {
  vec2 lp = unwarp(screenPx());
  vec2 g = mod(lp - uOffset - .5 * uStep, uStep) - .5 * uStep;
  float dd = length(g);
  float aa = max(fwidth(dd) * .8, .35);
  float a = (1. - smoothstep(uDotR - aa, uDotR + aa, dd)) * uDot.a;
  o = vec4(uDot.rgb * a, a);
}`;

const FRAG_VIGNETTE = `${COMMON}
uniform vec3 uShadow; uniform float uVig;
void main() {
  float r = radial(screenPx());
  float a = smoothstep(uR0 + .1, 1.08, r); a = a * a * uVig;
  o = vec4(uShadow * a, a);
}`;

function makeGL(canvas, frag) {
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) return null;
  const compile = (type, src) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link");
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uniforms = {};
  const u = (name) => (name in uniforms ? uniforms[name] : (uniforms[name] = gl.getUniformLocation(program, name)));
  return { gl, u, canvas };
}

function parseColor(value) {
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillStyle = value || "#000";
  const out = ctx.fillStyle;
  if (out.startsWith("#")) return [1, 3, 5].map((i) => parseInt(out.slice(i, i + 2), 16) / 255).concat(1);
  const m = out.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1];
  return [m[0] / 255, m[1] / 255, m[2] / 255, m[3] ?? 1];
}

function boardBackground(node) {
  for (let el = node; el; el = el.parentElement) {
    const color = parseColor(getComputedStyle(el).backgroundColor);
    if (color[3] > 0.5) return color;
  }
  return [1, 1, 1, 1];
}

export default function CurvedCanvas({
  containerRef,
  gridRef,
  getViewportSnapshot,
  subscribeViewportTransform,
  setPointUnwarp,
  dragMotion = null,
}) {
  const rootRef = useRef(null);
  const dotsRef = useRef(null);
  const vignetteRef = useRef(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    // The board is this component's parent. Its ref can't be used here: on
    // a fresh mount (opening or switching to a canvas) a child's layout
    // effect runs before the parent's ref is attached.
    const board = root?.parentElement ?? containerRef.current;
    if (!root || !board) return undefined;

    let dotsGL = null;
    let vignetteGL = null;
    try {
      dotsGL = makeGL(dotsRef.current, FRAG_DOTS);
      vignetteGL = makeGL(vignetteRef.current, FRAG_VIGNETTE);
    } catch (error) {
      console.warn("[curved view] WebGL unavailable", error);
    }
    if (!dotsGL) board.classList.add("canvas--curved-no-gl");

    let width = 1;
    let height = 1;
    let dpr = 1;
    let field = createWarp(1, 1);
    const theme = { dot: [0, 0, 0, 0.15], shadow: [0.14, 0.1, 0.06], vignette: 0.14 };
    let items = [];
    let itemsDirty = true;
    let frame = 0;
    // While tiles are dragged (and for a moment after the drop), each tile's
    // live offset is read from its card (--tile-drag-x/y, written by
    // TileShell), so a dragged tile bends with the board as it moves.
    let followDrag = false;

    const readTheme = () => {
      const grid = gridRef.current ?? board.querySelector(".canvas__grid");
      theme.dot = parseColor(grid ? getComputedStyle(grid).getPropertyValue("--grid-line").trim() : "");
      const [r, g, b] = boardBackground(board);
      const dark = (0.2126 * r + 0.7152 * g + 0.0722 * b) < 0.4;
      theme.shadow = dark ? [0, 0, 0] : [35 / 255, 25 / 255, 15 / 255];
      theme.vignette = dark ? 0.55 : 0.14;
    };

    const commonUniforms = ({ gl, u }) => {
      gl.uniform2f(u("uRes"), width, height);
      gl.uniform1f(u("uDpr"), dpr);
      gl.uniform1f(u("uR0"), CURVE.r0);
      gl.uniform1f(u("uK"), CURVE.k);
    };

    const drawGL = (viewport) => {
      if (dotsGL) {
        const { gl, u } = dotsGL;
        commonUniforms(dotsGL);
        const zoom = viewport.zoom || 1;
        const dotR = 1.3 + 0.7 * Math.min(1, Math.max(0, (zoom - 0.3) / 1.7));
        gl.uniform2f(u("uOffset"), viewport.x, viewport.y);
        gl.uniform1f(u("uStep"), getCanvasGridSpacing(zoom));
        gl.uniform1f(u("uDotR"), dotR);
        gl.uniform4f(u("uDot"), theme.dot[0], theme.dot[1], theme.dot[2], theme.dot[3]);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      if (vignetteGL) {
        const { gl, u } = vignetteGL;
        commonUniforms(vignetteGL);
        gl.uniform3f(u("uShadow"), theme.shadow[0], theme.shadow[1], theme.shadow[2]);
        gl.uniform1f(u("uVig"), theme.vignette);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    };

    const warpItems = (viewport) => {
      if (itemsDirty) {
        items = [...board.querySelectorAll(".canvas__content [data-warp-item]")];
        itemsDirty = false;
      }
      for (const el of items) {
        const d = el.dataset;
        const x = Number(d.warpX);
        const y = Number(d.warpY);
        const w = Number(d.warpW);
        const h = Number(d.warpH);
        let dx = 0;
        let dy = 0;
        if (followDrag && d.tetherTile) {
          const cardStyle = el.firstElementChild?.style;
          dx = parseFloat(cardStyle?.getPropertyValue("--tile-drag-x")) || 0;
          dy = parseFloat(cardStyle?.getPropertyValue("--tile-drag-y")) || 0;
        }
        let next = "";
        if (Number.isFinite(x) && Number.isFinite(y) && w > 0 && h > 0) {
          next = worldBoxTransform(field, viewport, x + dx, y + dy, w, h) ?? "";
        }
        if (el.__apWarp !== next) {
          el.style.transform = next;
          el.__apWarp = next;
        }
      }
    };

    const render = (viewport = getViewportSnapshot()) => {
      if (!viewport) return;
      warpItems(viewport);
      drawGL(viewport);
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        render();
      });
    };

    const resize = () => {
      width = Math.max(1, board.clientWidth);
      height = Math.max(1, board.clientHeight);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      field = createWarp(width, height);
      setPointUnwarp?.(field.unwarp);
      for (const G of [dotsGL, vignetteGL]) {
        if (!G) continue;
        G.canvas.width = Math.round(width * dpr);
        G.canvas.height = Math.round(height * dpr);
        G.gl.viewport(0, 0, G.canvas.width, G.canvas.height);
      }
      render();
    };

    readTheme();
    board.classList.add("canvas--curved");
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(board);
    resize();

    const unsubscribe = subscribeViewportTransform((viewport) => render(viewport));

    // Tiles added, removed or moved: pick them up next frame.
    const mutations = new MutationObserver(() => {
      itemsDirty = true;
      schedule();
    });
    mutations.observe(board, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-warp-x", "data-warp-y", "data-warp-w", "data-warp-h"],
    });

    // Tile drags: re-pin the dragged tiles every drag frame, then a few more
    // times after the drop until the committed position has landed.
    let dragSettleTimer = 0;
    const unsubscribeDrag = dragMotion?.subscribe((drag) => {
      window.clearTimeout(dragSettleTimer);
      if (drag) {
        followDrag = true;
        const viewport = getViewportSnapshot();
        if (viewport) warpItems(viewport);
        return;
      }
      schedule();
      dragSettleTimer = window.setTimeout(() => {
        followDrag = false;
        schedule();
      }, 400);
    }) ?? null;

    // Theme switched: re-read the dot and vignette colours.
    const themeObserver = new MutationObserver(() => {
      readTheme();
      schedule();
    });
    themeObserver.observe(document.documentElement, { attributes: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.clearTimeout(dragSettleTimer);
      unsubscribeDrag?.();
      unsubscribe();
      mutations.disconnect();
      themeObserver.disconnect();
      resizeObserver.disconnect();
      setPointUnwarp?.(null);
      board.classList.remove("canvas--curved", "canvas--curved-no-gl");
      board.querySelectorAll(".canvas__content [data-warp-item]").forEach((el) => {
        el.style.transform = "";
        el.__apWarp = "";
      });
    };
  }, [containerRef, dragMotion, getViewportSnapshot, gridRef, setPointUnwarp, subscribeViewportTransform]);

  return (
    <div ref={rootRef} className="canvas-curve" aria-hidden="true">
      <canvas ref={dotsRef} className="canvas-curve__dots" />
      <div className="canvas-curve__blur canvas-curve__blur--1" />
      <div className="canvas-curve__blur canvas-curve__blur--2" />
      <div className="canvas-curve__blur canvas-curve__blur--3" />
      <canvas ref={vignetteRef} className="canvas-curve__vignette" />
    </div>
  );
}
