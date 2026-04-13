import * as React from "react"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"
import "./AppPrimitives.css"

const appSurfaceVariants = cva("ap-ui-surface", {
  variants: {
    variant: {
      panel: "",
      elevated: "ap-ui-surface--elevated",
    },
    interactive: {
      true: "ap-ui-surface--interactive",
      false: "",
    },
  },
  defaultVariants: {
    variant: "panel",
    interactive: false,
  },
})

const AppSurface = React.forwardRef(
  ({ as: Comp = "div", className, variant, interactive, ...props }, ref) => (
    <Comp
      ref={ref}
      className={cn(appSurfaceVariants({ variant, interactive }), className)}
      {...props}
    />
  ),
)
AppSurface.displayName = "AppSurface"

export { AppSurface }
