import * as React from "react"
import { ScrollArea, ScrollBar } from "../scroll-area"
import { cn } from "@/lib/utils"

const AppScrollArea = React.forwardRef(({ className, children, ...props }, ref) => (
  <ScrollArea ref={ref} className={cn("", className)} {...props}>
    {children}
  </ScrollArea>
))
AppScrollArea.displayName = ScrollArea.displayName

const AppScrollBar = React.forwardRef(({ className, ...props }, ref) => (
  <ScrollBar
    ref={ref}
    className={cn(
      "flex touch-none select-none transition-colors",
      className
    )}
    {...props}
  />
))
AppScrollBar.displayName = ScrollBar.displayName

export { AppScrollArea, AppScrollBar }
