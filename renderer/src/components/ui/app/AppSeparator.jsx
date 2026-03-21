import * as React from "react"
import { Separator } from "../separator"
import { cn } from "@/lib/utils"

const AppSeparator = React.forwardRef(
  ({ className, orientation = "horizontal", decorative = true, ...props }, ref) => (
    <Separator
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-ap-border-subtle",
        orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
        className
      )}
      {...props}
    />
  )
)
AppSeparator.displayName = "AppSeparator"

export { AppSeparator }
