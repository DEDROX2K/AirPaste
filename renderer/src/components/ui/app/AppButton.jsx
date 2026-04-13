import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "../button"
import "./AppPrimitives.css"

const AppButton = React.forwardRef(
  ({ className, tone = "default", block = false, variant, ...props }, ref) => {
    if (tone === "unstyled") {
      return (
        <button
          ref={ref}
          className={cn(className)}
          {...props}
        />
      )
    }

    if (tone === "surface") {
      return (
        <button
          ref={ref}
          className={cn(
            "ap-ui-button ap-ui-button--surface ap-type-label",
            block ? "ap-ui-button--block" : "",
            className,
          )}
          {...props}
        />
      )
    }

    return (
      <Button
        ref={ref}
        variant={variant}
        className={cn("rounded-ap-md transition-all duration-ap-fast ease-ap-smooth", className)}
        {...props}
      />
    )
  },
)
AppButton.displayName = "AppButton"

export { AppButton }
