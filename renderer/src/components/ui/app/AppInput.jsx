import * as React from "react"
import { Input } from "../input"
import { cn } from "@/lib/utils"

const AppInput = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <Input
      ref={ref}
      className={cn("rounded-ap-sm text-ap-text-primary bg-ap-surface-panel border-ap-border-strong", className)}
      {...props}
    />
  )
})
AppInput.displayName = "AppInput"

export { AppInput }
