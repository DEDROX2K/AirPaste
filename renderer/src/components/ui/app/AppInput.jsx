import * as React from "react"
import { cn } from "@/lib/utils"
import "./AppPrimitives.css"

const AppInput = React.forwardRef(({ className, type = "text", ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn("ap-ui-input ap-type-body-sm", className)}
    {...props}
  />
))
AppInput.displayName = "AppInput"

export { AppInput }
