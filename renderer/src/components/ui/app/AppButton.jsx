import * as React from "react"
import { Button } from "../button"
import { cn } from "@/lib/utils"

const AppButton = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <Button
      ref={ref}
      className={cn("rounded-ap-md transition-all duration-ap-fast ease-ap-smooth", className)}
      {...props}
    />
  )
})
AppButton.displayName = "AppButton"

export { AppButton }
