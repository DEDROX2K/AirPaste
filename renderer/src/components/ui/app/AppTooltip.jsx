import * as React from "react"
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../tooltip"
import { cn } from "@/lib/utils"

const AppTooltipProvider = TooltipProvider
const AppTooltip = Tooltip
const AppTooltipTrigger = TooltipTrigger

const AppTooltipContent = React.forwardRef(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipContent
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-ap-overlay overflow-hidden rounded-ap-sm bg-ap-text-primary px-3 py-1.5 text-xs text-ap-surface-shell animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    )}
    {...props}
  />
))
AppTooltipContent.displayName = TooltipContent.displayName

export { AppTooltip, AppTooltipTrigger, AppTooltipContent, AppTooltipProvider }
