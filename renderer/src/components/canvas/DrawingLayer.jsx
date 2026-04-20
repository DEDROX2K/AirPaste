import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Group, Layer, Line, Stage } from "react-konva";
import {
  DRAWING_OBJECT_TYPE_LINE,
  DRAWING_TOOL_MODE_LINE,
  normalizeDrawingStyle,
} from "../../systems/drawing/drawingTypes";
import { getWorldToScreenTransform } from "../../systems/canvas/canvasMath";

const DEFAULT_STAGE_SIZE = Object.freeze({
  width: 1,
  height: 1,
});

export default function DrawingLayer({
  drawings,
  draftLine,
  selectedObjectId,
  activeTool,
  isSpacePanning = false,
  getViewportSnapshot,
  subscribeViewportTransform,
  onSelectObject,
  onStagePointerDown,
  onStagePointerMove,
  onStagePointerUp,
  onStagePointerCancel,
  onStageContextMenu,
}) {
  const shellRef = useRef(null);
  const worldGroupRef = useRef(null);
  const transformRef = useRef(getWorldToScreenTransform(getViewportSnapshot?.()));
  const [stageSize, setStageSize] = useState(DEFAULT_STAGE_SIZE);
  const isInteractive = activeTool === DRAWING_TOOL_MODE_LINE;

  const applyWorldTransform = useCallback((nextViewport) => {
    const worldGroup = worldGroupRef.current;
    const nextTransform = getWorldToScreenTransform(nextViewport);
    const previousTransform = transformRef.current;

    if (!worldGroup) {
      transformRef.current = nextTransform;
      return;
    }

    if (
      previousTransform.x === nextTransform.x
      && previousTransform.y === nextTransform.y
      && previousTransform.zoom === nextTransform.zoom
    ) {
      return;
    }

    worldGroup.x(nextTransform.x);
    worldGroup.y(nextTransform.y);
    worldGroup.scaleX(nextTransform.zoom);
    worldGroup.scaleY(nextTransform.zoom);
    worldGroup.getLayer()?.batchDraw();
    transformRef.current = nextTransform;
  }, []);

  useLayoutEffect(() => {
    applyWorldTransform(getViewportSnapshot?.());
  }, [applyWorldTransform, getViewportSnapshot]);

  useLayoutEffect(() => {
    if (typeof subscribeViewportTransform !== "function") {
      return undefined;
    }

    return subscribeViewportTransform((nextViewport) => {
      applyWorldTransform(nextViewport);
    });
  }, [applyWorldTransform, subscribeViewportTransform]);

  useLayoutEffect(() => {
    const shellElement = shellRef.current;

    if (!shellElement) {
      return undefined;
    }

    const updateStageSize = () => {
      const rect = shellElement.getBoundingClientRect();
      setStageSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      });
    };

    updateStageSize();

    let observer = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(updateStageSize);
      observer.observe(shellElement);
    }

    window.addEventListener("resize", updateStageSize);

    return () => {
      observer?.disconnect?.();
      window.removeEventListener("resize", updateStageSize);
    };
  }, []);

  return (
    <div
      ref={shellRef}
      className={`canvas__drawing-layer${isInteractive ? " canvas__drawing-layer--interactive" : ""}`}
    >
      <Stage
        className="canvas__drawing-stage"
        width={stageSize.width}
        height={stageSize.height}
        style={{
          pointerEvents: isInteractive ? "auto" : "none",
          cursor: isInteractive
            ? (isSpacePanning ? "grab" : "crosshair")
            : "default",
        }}
        onMouseDown={onStagePointerDown}
        onMouseMove={onStagePointerMove}
        onMouseUp={onStagePointerUp}
        onTouchStart={onStagePointerDown}
        onTouchMove={onStagePointerMove}
        onTouchEnd={onStagePointerUp}
        onTouchCancel={onStagePointerCancel}
        onContextMenu={onStageContextMenu}
      >
        <Layer>
          <Group
            ref={worldGroupRef}
            x={transformRef.current.x}
            y={transformRef.current.y}
            scaleX={transformRef.current.zoom}
            scaleY={transformRef.current.zoom}
          >
            {drawings.objects.map((drawingObject) => {
              if (drawingObject.type !== DRAWING_OBJECT_TYPE_LINE) {
                return null;
              }

              const style = normalizeDrawingStyle(drawingObject.style);
              const isSelected = drawingObject.id === selectedObjectId;

              return (
                <Group key={drawingObject.id}>
                  {isSelected ? (
                    <Line
                      points={drawingObject.points}
                      stroke="rgba(76, 132, 232, 0.45)"
                      strokeWidth={style.strokeWidth + 6}
                      opacity={Math.min(1, style.opacity + 0.2)}
                      lineCap="round"
                      lineJoin="round"
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  ) : null}
                  <Line
                    points={drawingObject.points}
                    stroke={style.stroke}
                    strokeWidth={style.strokeWidth}
                    opacity={style.opacity}
                    lineCap="round"
                    lineJoin="round"
                    hitStrokeWidth={Math.max(style.strokeWidth + 10, 12)}
                    perfectDrawEnabled={false}
                    listening={isInteractive}
                    onMouseDown={(event) => {
                      event.cancelBubble = true;
                      onSelectObject?.(drawingObject.id, event);
                    }}
                    onTouchStart={(event) => {
                      event.cancelBubble = true;
                      onSelectObject?.(drawingObject.id, event);
                    }}
                  />
                </Group>
              );
            })}
            {draftLine ? (
              <Line
                points={draftLine.points}
                stroke={normalizeDrawingStyle(draftLine.style).stroke}
                strokeWidth={normalizeDrawingStyle(draftLine.style).strokeWidth}
                opacity={0.82}
                lineCap="round"
                lineJoin="round"
                dash={[10, 8]}
                listening={false}
                perfectDrawEnabled={false}
              />
            ) : null}
          </Group>
        </Layer>
      </Stage>
    </div>
  );
}
