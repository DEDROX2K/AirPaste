import * as React from "react"

const DEFAULT_STEP_MS = 14
const DEFAULT_PLACEHOLDER = ">"

function buildScrambleFrame(originalText, iteration, placeholder) {
  const length = originalText.length

  return originalText
    .split("")
    .map((char, index) => {
      if (iteration < length) {
        return index <= iteration ? placeholder : char
      }

      const restorePoint = iteration - length
      return index <= restorePoint ? originalText[index] : placeholder
    })
    .join("")
}

const AppScrambleText = React.forwardRef(
  (
    {
      as: Comp = "span",
      children,
      className,
      stepMs = DEFAULT_STEP_MS,
      placeholder = DEFAULT_PLACEHOLDER,
      trigger = "parent",
      style,
      ...props
    },
    forwardedRef,
  ) => {
    const text = typeof children === "string" ? children : String(children ?? "")
    const hostRef = React.useRef(null)
    const intervalRef = React.useRef(null)

    const [displayText, setDisplayText] = React.useState(text)

    React.useEffect(() => {
      setDisplayText(text)
    }, [text])

    const clearAnimation = React.useCallback(() => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }, [])

    const startAnimation = React.useCallback(() => {
      if (!text || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setDisplayText(text)
        return
      }

      clearAnimation()
      let iteration = 0
      const finalIteration = text.length * 2

      intervalRef.current = window.setInterval(() => {
        setDisplayText(buildScrambleFrame(text, iteration, placeholder))

        if (iteration >= finalIteration) {
          clearAnimation()
          setDisplayText(text)
        }

        iteration += 1
      }, stepMs)
    }, [clearAnimation, placeholder, stepMs, text])

    React.useEffect(() => {
      const node = hostRef.current
      if (!node) return undefined

      const target = trigger === "self"
        ? node
        : node.closest("button, a, [role='button']")

      if (!target) return undefined

      target.addEventListener("pointerenter", startAnimation)
      target.addEventListener("focus", startAnimation)

      return () => {
        target.removeEventListener("pointerenter", startAnimation)
        target.removeEventListener("focus", startAnimation)
      }
    }, [startAnimation, trigger])

    React.useEffect(() => clearAnimation, [clearAnimation])

    return (
      <Comp
        ref={(node) => {
          hostRef.current = node
          if (typeof forwardedRef === "function") {
            forwardedRef(node)
          } else if (forwardedRef) {
            forwardedRef.current = node
          }
        }}
        className={className}
        aria-label={text}
        style={{
          position: "relative",
          display: "inline-grid",
          placeItems: "center start",
          whiteSpace: "pre",
          ...style,
        }}
        {...props}
      >
        <span
          aria-hidden="true"
          style={{
            visibility: "hidden",
            pointerEvents: "none",
          }}
        >
          {text}
        </span>
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            display: "inline-flex",
            alignItems: "inherit",
            justifyContent: "inherit",
            whiteSpace: "inherit",
            pointerEvents: "none",
          }}
        >
          {displayText}
        </span>
      </Comp>
    )
  },
)

AppScrambleText.displayName = "AppScrambleText"

export { AppScrambleText }
