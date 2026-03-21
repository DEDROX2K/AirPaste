import * as React from "react"
import { Textarea } from "../textarea"
import { cn } from "@/lib/utils"

const AppTextarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <Textarea
      ref={ref}
      className={cn("rounded-ap-sm text-ap-text-primary bg-ap-surface-panel border-ap-border-strong focus-visible:ring-ap-border-strong", className)}
      {...props}
    />
  )
})
AppTextarea.displayName = "AppTextarea"

export { AppTextarea }
