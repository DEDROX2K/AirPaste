import * as React from "react"
import { cn } from "@/lib/utils"
import "./AppPrimitives.css"

const AppButton = React.forwardRef(
  ({ className, tone = "default", block = false, variant, size, ...props }, ref) => {
    if (tone === "unstyled") {
      return (
        <button
          ref={ref}
          className={cn(className)}
          {...props}
        />
      )
    }

    const sizeClassName = size === "sm"
      ? "ap-ui-button--sm"
      : size === "lg"
        ? "ap-ui-button--lg"
        : size === "icon"
          ? "ap-ui-button--icon"
          : "";

    if (tone === "surface") {
      return (
        <button
          ref={ref}
          className={cn(
            "ap-ui-button ap-ui-button--surface ap-type-label",
            block ? "ap-ui-button--block" : "",
            sizeClassName,
            className,
          )}
          {...props}
        />
      )
    }

    if (tone === "accent") {
      return (
        <button
          ref={ref}
          className={cn(
            "ap-ui-button ap-ui-button--accent ap-type-label",
            block ? "ap-ui-button--block" : "",
            sizeClassName,
            className,
          )}
          {...props}
        />
      )
    }

    if (tone === "danger") {
      return (
        <button
          ref={ref}
          className={cn(
            "ap-ui-button ap-ui-button--danger ap-type-label",
            block ? "ap-ui-button--block" : "",
            sizeClassName,
            className,
          )}
          {...props}
        />
      )
    }

    const variantClassName = variant === "destructive"
      ? "ap-ui-button--danger"
      : variant === "secondary" || variant === "outline"
        ? "ap-ui-button--surface"
        : variant === "ghost" || variant === "link"
          ? "ap-ui-button--ghost"
          : "";

    return (
      <button
        ref={ref}
        className={cn(
          "ap-ui-button ap-type-label",
          variantClassName,
          block ? "ap-ui-button--block" : "",
          sizeClassName,
          className,
        )}
        {...props}
      />
    )
  },
)
AppButton.displayName = "AppButton"

export { AppButton }
