import { useLayoutEffect, useRef, useState } from "react";
import "./FailedLinkPreview.css";

// What a link tile shows when its preview failed: a framed sheet with a
// "Preview failed" badge, the full URL (cropped; hovering slides the rest
// into view, clicking opens it) and a short reason. The art is laid out on a
// 504 x 490 grid and scales with the tile (see FailedLinkPreview.css).

const URL_SCROLL_SPEED = 90; // art px per second

const FRAME_PATH = "M44.5871 0.672028L44.5883 0.673257L229.856 0.00244488L229.857 0.00122061L229.859 0L237.123 0.0277473C237.452 0.0290073 237.719 0.297377 237.717 0.627169L237.694 6.83988C237.692 7.16967 237.959 7.43803 238.289 7.43929L250.716 7.46352C251.046 7.46478 251.312 7.73316 251.311 8.06295L251.737 228.84C251.735 229.17 251.467 229.436 251.137 229.435L53.0498 230.08C52.72 230.079 52.4516 230.345 52.4504 230.675L52.4266 236.885C52.4254 237.215 52.157 237.481 51.8272 237.48L45.5488 237.456C45.219 237.455 44.9507 237.721 44.9494 238.051L44.9257 244.261C44.9244 244.591 44.6561 244.857 44.3263 244.856L8.03924 244.717C7.70945 244.716 7.44312 244.447 7.44438 244.118L7.46811 237.908C7.46937 237.578 7.20304 237.31 6.87324 237.308L0.594867 237.284C0.265075 237.283 -0.00125555 237.015 4.45237e-06 236.685L0.113346 201.221C0.113418 201.202 0.128681 201.187 0.147438 201.187C0.166195 201.187 0.181453 201.172 0.181525 201.153L0.235795 186.951C0.237055 186.621 0.505426 186.354 0.835219 186.356L7.04567 186.379C7.37547 186.381 7.64384 186.114 7.6451 185.785L7.66883 179.574C7.67009 179.244 7.93845 178.978 8.26825 178.979L14.4787 179.003C14.8085 179.004 15.0769 178.738 15.0781 178.408L15.1019 172.198C15.1031 171.868 15.3715 171.601 15.7013 171.603L21.9117 171.626C22.2415 171.628 22.5099 171.361 22.5112 171.032L22.5349 164.821C22.5362 164.491 22.8045 164.225 23.1343 164.226L29.3448 164.25C29.6746 164.251 29.9429 163.985 29.9442 163.655L29.3597 7.98574L29.3856 1.20987C29.3869 0.880075 29.6553 0.613745 29.9851 0.615005L44.5858 0.670793L44.5871 0.672028ZM22.9387 178.896C22.9375 179.225 22.6691 179.492 22.3393 179.491L16.1288 179.467C15.7991 179.466 15.5307 179.732 15.5294 180.062L15.5057 186.272C15.5044 186.602 15.2361 186.868 14.9063 186.867L8.69581 186.843C8.36602 186.842 8.09765 187.108 8.09639 187.438L8.04217 201.63C8.0421 201.649 8.02683 201.664 8.00807 201.664C7.98932 201.664 7.97405 201.679 7.97398 201.698L7.89328 222.821C7.89202 223.151 8.15834 223.419 8.48814 223.421L29.1184 223.499C29.4482 223.501 29.7165 223.234 29.7178 222.904L29.7416 216.694C29.7428 216.364 30.0112 216.098 30.341 216.099L36.5514 216.123C36.8812 216.124 37.1496 215.858 37.1509 215.528L37.1746 209.318C37.1758 208.988 37.4442 208.722 37.774 208.723L43.9845 208.747C44.3142 208.748 44.5826 208.482 44.5839 208.152L44.6342 194.995C44.6354 194.665 44.3691 194.396 44.0393 194.395L38.2864 194.373C37.9566 194.372 37.6883 194.638 37.687 194.968L37.6632 201.191C37.662 201.521 37.3936 201.787 37.0638 201.786L22.991 201.732C22.6612 201.731 22.3949 201.462 22.3962 201.133L22.45 187.047C22.4512 186.718 22.7196 186.451 23.0494 186.453L29.2598 186.476C29.5896 186.478 29.858 186.211 29.8593 185.881L29.9096 172.712C29.9108 172.382 29.6445 172.114 29.3147 172.112L23.5619 172.09C23.2321 172.089 22.9637 172.355 22.9624 172.685L22.9387 178.896ZM37.7216 185.911C37.7203 186.241 37.9867 186.51 38.3165 186.511L44.0693 186.533C44.3991 186.534 44.6675 186.268 44.6688 185.938L44.6925 179.728C44.6937 179.398 44.9621 179.131 45.2919 179.133L51.96 179.158C52.2898 179.159 52.5561 179.428 52.5548 179.758L52.5311 185.968C52.5299 186.298 52.7962 186.566 53.126 186.567L59.3364 186.591C59.6662 186.592 59.9325 186.861 59.9313 187.191L59.8775 201.263C59.8763 201.593 59.6079 201.859 59.2781 201.858L53.0676 201.834C52.7378 201.833 52.4694 202.099 52.4682 202.429L52.4462 208.182C52.445 208.512 52.7113 208.78 53.0411 208.782L229.712 208.078C230.042 208.079 230.31 207.813 230.312 207.483L229.825 8.46193C229.826 8.13214 229.56 7.86377 229.23 7.86251L44.1007 8.53385L44.0994 8.53262L44.0982 8.53139L37.7494 8.50713C37.4196 8.50587 37.1513 8.7722 37.15 9.10199L37.7216 185.911ZM45.166 193.345C45.1647 193.674 45.4311 193.943 45.7609 193.944L51.4458 193.966C51.7756 193.967 52.0439 193.701 52.0452 193.371L52.0672 187.618C52.0684 187.288 51.8021 187.02 51.4723 187.019L45.7874 186.997C45.4576 186.996 45.1892 187.262 45.188 187.592L45.166 193.345Z";

function stopPointer(event) {
  // The URL is a link, not a drag handle.
  event.stopPropagation();
}

export default function FailedLinkPreview({ url, reason, onOpen }) {
  const boxRef = useRef(null);
  const textRef = useRef(null);
  // How far (layout px) the URL runs past the bottom of its box.
  const [over, setOver] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text) {
      return undefined;
    }

    const measure = () => setOver(Math.max(0, text.scrollHeight - box.clientHeight));
    measure();

    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [url]);

  // The box is 315 art px wide, so this turns layout px into art px.
  const overArtPx = boxRef.current?.offsetWidth ? (over * 315) / boxRef.current.offsetWidth : over;
  const durationSeconds = Math.max(0.4, overArtPx / URL_SCROLL_SPEED);

  return (
    <div className="failed-preview" role="note" aria-label={`Preview failed: ${reason}`}>
      <div className="failed-preview__art">
        <svg className="failed-preview__frame" viewBox="0 0 252 245" preserveAspectRatio="none" aria-hidden="true">
          <path d="M36.5438 5.86348H237.529V214.742H36.5438V5.86348Z" fill="#fff" />
          <path d="M24.2198 170.283L31.0216 168.009L35.9476 189.942L49.9557 184.981L54.0991 188.48L45.3881 223.019L6.36713 227.071L4.9402 190.339L24.2198 170.283Z" fill="#989898" />
          <path fill="#39393B" fillRule="evenodd" clipRule="evenodd" d={FRAME_PATH} />
        </svg>

        <div className="failed-preview__badge">Preview failed</div>

        <div
          ref={boxRef}
          className={`failed-preview__url-box${over > 0 ? " failed-preview__url-box--cut" : ""}${isScrolling ? " failed-preview__url-box--scroll" : ""}`}
          role="link"
          tabIndex={0}
          title="Open link"
          style={{ "--failed-preview-over": `${over}px`, "--failed-preview-dur": `${durationSeconds}s` }}
          onPointerDown={stopPointer}
          onPointerEnter={() => setIsScrolling(true)}
          onPointerLeave={() => setIsScrolling(false)}
          onClick={(event) => {
            event.stopPropagation();
            onOpen?.();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.stopPropagation();
              onOpen?.();
            }
          }}
        >
          <div ref={textRef} className="failed-preview__url">{url || "No URL"}</div>
        </div>

        <div className="failed-preview__reason">{reason}</div>
      </div>
    </div>
  );
}
