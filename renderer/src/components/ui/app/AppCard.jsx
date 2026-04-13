import * as React from "react"
import { cn } from "@/lib/utils"
import { AppSurface } from "./AppSurface"
import "./AppPrimitives.css"

const AppCard = React.forwardRef(({ className, ...props }, ref) => (
  <AppSurface ref={ref} className={cn(className)} variant="panel" {...props} />
))
AppCard.displayName = "AppCard"

const AppCardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("ap-ui-card-header", className)} {...props} />
))
AppCardHeader.displayName = "AppCardHeader"

const AppCardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("ap-type-heading-3 ap-text-primary", className)}
    {...props}
  />
))
AppCardTitle.displayName = "AppCardTitle"

const AppCardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("ap-type-body-sm ap-text-secondary w-full", className)}
    {...props}
  />
))
AppCardDescription.displayName = "AppCardDescription"

const AppCardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("ap-ui-card-content", className)} {...props} />
))
AppCardContent.displayName = "AppCardContent"

const AppCardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("ap-ui-card-footer", className)} {...props} />
))
AppCardFooter.displayName = "AppCardFooter"

export { AppCard, AppCardHeader, AppCardFooter, AppCardTitle, AppCardDescription, AppCardContent }
