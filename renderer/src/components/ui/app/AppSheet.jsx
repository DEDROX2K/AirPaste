import * as React from "react"
import { Sheet, SheetPortal, SheetOverlay, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription } from "../sheet"
import { cn } from "@/lib/utils"

const AppSheet = Sheet
const AppSheetTrigger = SheetTrigger
const AppSheetClose = SheetClose
const AppSheetPortal = SheetPortal
const AppSheetFooter = SheetFooter

const AppSheetOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <SheetOverlay className={cn("bg-black/40 backdrop-blur-sm z-ap-overlay", className)} {...props} ref={ref} />
))
AppSheetOverlay.displayName = SheetOverlay.displayName

const AppSheetContent = React.forwardRef(({ side = "right", className, children, ...props }, ref) => (
  <AppSheetPortal>
    <AppSheetOverlay />
    <SheetContent ref={ref} side={side} className={cn("bg-ap-surface-panel border-ap-border-subtle shadow-xl z-ap-dialog", className)} {...props}>
      {children}
    </SheetContent>
  </AppSheetPortal>
))
AppSheetContent.displayName = SheetContent.displayName

const AppSheetHeader = React.forwardRef(({ className, ...props }, ref) => (
  <SheetHeader ref={ref} className={cn("", className)} {...props} />
))
AppSheetHeader.displayName = SheetHeader.displayName

const AppSheetTitle = React.forwardRef(({ className, ...props }, ref) => (
  <SheetTitle ref={ref} className={cn("text-ap-text-primary text-lg font-semibold", className)} {...props} />
))
AppSheetTitle.displayName = SheetTitle.displayName

const AppSheetDescription = React.forwardRef(({ className, ...props }, ref) => (
  <SheetDescription ref={ref} className={cn("text-ap-text-secondary text-sm", className)} {...props} />
))
AppSheetDescription.displayName = SheetDescription.displayName

export { AppSheet, AppSheetPortal, AppSheetOverlay, AppSheetTrigger, AppSheetClose, AppSheetContent, AppSheetHeader, AppSheetFooter, AppSheetTitle, AppSheetDescription }
