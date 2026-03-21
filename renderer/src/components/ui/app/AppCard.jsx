import * as React from "react"
import { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from "../card"
import { cn } from "@/lib/utils"

const AppCard = React.forwardRef(({ className, ...props }, ref) => (
  <Card ref={ref} className={cn("rounded-ap-lg bg-ap-surface-panel shadow-md border-ap-border-subtle", className)} {...props} />
))
AppCard.displayName = "AppCard"

const AppCardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <CardHeader ref={ref} className={cn("", className)} {...props} />
))
AppCardHeader.displayName = "AppCardHeader"

const AppCardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <CardTitle ref={ref} className={cn("text-ap-text-primary", className)} {...props} />
))
AppCardTitle.displayName = "AppCardTitle"

const AppCardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <CardDescription ref={ref} className={cn("text-ap-text-secondary w-full", className)} {...props} />
))
AppCardDescription.displayName = "AppCardDescription"

const AppCardContent = React.forwardRef(({ className, ...props }, ref) => (
  <CardContent ref={ref} className={cn("", className)} {...props} />
))
AppCardContent.displayName = "AppCardContent"

const AppCardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <CardFooter ref={ref} className={cn("", className)} {...props} />
))
AppCardFooter.displayName = "AppCardFooter"

export { AppCard, AppCardHeader, AppCardFooter, AppCardTitle, AppCardDescription, AppCardContent }
