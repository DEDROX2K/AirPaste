import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppContext } from "../../context/useAppContext";
import { desktop } from "../../lib/desktop";
import { getCanvasThumbnailVersion } from "../../lib/canvasThumbnail";
import { renderCanvasThumbnail } from "../../lib/canvasThumbnailRender";
import { getDetachZone } from "../../systems/canvas/splitView";
import { Canvas, SplitColumns } from "../ui/icons";
import "./TabDetachOverlay.css";

const PREVIEW_OFFSET = { x: 14, y: 12 };

// The area the drop boxes cover: the canvas (split) area, or the whole view
// under the tab bar.
function measureDropArea() {
  const node = document.querySelector(".canvas-split") ?? document.querySelector(".app-shell__view-container");
  const rect = node?.getBoundingClientRect();
  if (!rect || rect.width < 1 || rect.height < 1) {
    return { left: 0, top: 48, width: window.innerWidth, height: Math.max(1, window.innerHeight - 48) };
  }
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

// The file's picture for the drag preview: the current tab is drawn fresh
// from its tiles; another tab uses its saved Home thumbnail.
function useTabPreviewImage(tab, isCurrent) {
  const { folderPath, homeData, workspace } = useAppContext();
  const [src, setSrc] = useState("");
  const cardsRef = useRef(workspace?.cards ?? []);
  cardsRef.current = workspace?.cards ?? [];

  useEffect(() => {
    let cancelled = false;
    const item = (homeData?.allFiles ?? []).find((entry) => entry.filePath === tab.entityId);
    if (folderPath && item?.thumbnailPath) {
      void Promise.resolve(desktop.workspace.resolveAssetUrl(folderPath, item.thumbnailPath, { previewTier: "original" }))
        .then((resolved) => {
          if (cancelled || !resolved) return;
          const version = getCanvasThumbnailVersion(tab.entityId);
          setSrc((current) => current || (version ? `${resolved}?v=${version}` : resolved));
        })
        .catch(() => {});
    }
    if (isCurrent && folderPath) {
      void renderCanvasThumbnail(cardsRef.current, folderPath)
        .then((dataUrl) => {
          if (!cancelled && dataUrl) setSrc(dataUrl);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [folderPath, homeData, isCurrent, tab.entityId]);

  return src;
}

// Shown while a tab is dragged below the tab bar: a small preview of the
// file following the pointer, and the drop boxes -- left / right (split
// screen with `partnerName`) and middle (floating view). The drag itself
// lives in TopTabBar, which moves this through the ref (no re-renders).
const TabDetachOverlay = forwardRef(function TabDetachOverlay({ tab, isCurrent, partnerName }, ref) {
  const previewRef = useRef(null);
  const zoneRefs = useRef({});
  const [area, setArea] = useState(measureDropArea);
  const areaRef = useRef(area);
  areaRef.current = area;
  const zoneRef = useRef(null);
  const canSplit = Boolean(partnerName);
  const src = useTabPreviewImage(tab, isCurrent);

  useLayoutEffect(() => {
    const handleResize = () => setArea(measureDropArea());
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useImperativeHandle(ref, () => ({
    // Follows the pointer; returns the drop box under it ("left" | "right"
    // | "float" | null).
    move(clientX, clientY) {
      const node = previewRef.current;
      if (node) {
        node.style.transform = `translate3d(${Math.round(clientX + PREVIEW_OFFSET.x)}px, ${Math.round(clientY + PREVIEW_OFFSET.y)}px, 0)`;
        node.style.opacity = "1";
      }
      const zone = getDetachZone(areaRef.current, clientX, clientY, canSplit);
      if (zone !== zoneRef.current) {
        zoneRef.current = zone;
        for (const [id, zoneNode] of Object.entries(zoneRefs.current)) {
          if (!zoneNode) continue;
          if (id === zone) zoneNode.setAttribute("data-hot", "");
          else zoneNode.removeAttribute("data-hot");
        }
        previewRef.current?.setAttribute("data-zone", zone ?? "");
      }
      return zone;
    },
    getZone: () => zoneRef.current,
  }), [canSplit]);

  const style = {
    left: `${area.left}px`,
    top: `${area.top}px`,
    width: `${area.width}px`,
    height: `${area.height}px`,
  };

  return createPortal(
    <div className="tab-detach" aria-hidden="true">
      <div className="tab-detach__area" style={style}>
        {canSplit ? (
          <div className="tab-detach__zone tab-detach__zone--left" ref={(node) => { zoneRefs.current.left = node; }}>
            <span className="tab-detach__zone-label">
              <SplitColumns size={14} />
              Split left
            </span>
          </div>
        ) : null}
        <div className="tab-detach__zone tab-detach__zone--float" ref={(node) => { zoneRefs.current.float = node; }}>
          <span className="tab-detach__phone" />
          <span className="tab-detach__zone-label">Float</span>
        </div>
        {canSplit ? (
          <div className="tab-detach__zone tab-detach__zone--right" ref={(node) => { zoneRefs.current.right = node; }}>
            <span className="tab-detach__zone-label">
              <SplitColumns size={14} />
              Split right
            </span>
          </div>
        ) : null}
      </div>
      <div className="tab-detach__preview" ref={previewRef}>
        <div className="tab-detach__preview-image">
          {src ? <img src={src} alt="" draggable={false} /> : <Canvas size={22} />}
        </div>
        <div className="tab-detach__preview-name">{tab.title}</div>
        {partnerName ? <div className="tab-detach__preview-hint">with {partnerName}</div> : null}
      </div>
    </div>,
    document.body,
  );
});

export default TabDetachOverlay;
