import * as React from "react"
import { Dialog, DialogPortal, DialogOverlay, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "../dialog"
import { cn } from "@/lib/utils"

const AppDialog = Dialog
const AppDialogTrigger = DialogTrigger
const AppDialogPortal = DialogPortal
const AppDialogClose = DialogClose

const AppDialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogOverlay ref={ref} className={cn("bg-black/40 backdrop-blur-sm z-ap-overlay", className)} {...props} />
))
AppDialogOverlay.displayName = DialogOverlay.displayName

const AppDialogContent = React.forwardRef(({ className, children, ...props }, ref) => (
  <AppDialogPortal>
    <AppDialogOverlay />
    <DialogContent ref={ref} className={cn("bg-ap-surface-dialog border-ap-border-subtle rounded-ap-lg shadow-lg z-ap-dialog", className)} {...props}>
      {children}
    </DialogContent>
  </AppDialogPortal>
))
AppDialogContent.displayName = DialogContent.displayName

const AppDialogHeader = React.forwardRef(({ className, ...props }, ref) => (
  <DialogHeader ref={ref} className={cn("", className)} {...props} />
))
AppDialogHeader.displayName = DialogHeader.displayName

const AppDialogFooter = React.forwardRef(({ className, ...props }, ref) => (
  <DialogFooter ref={ref} className={cn("", className)} {...props} />
))
AppDialogFooter.displayName = DialogFooter.displayName

const AppDialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogTitle ref={ref} className={cn("text-ap-text-primary text-lg font-semibold", className)} {...props} />
))
AppDialogTitle.displayName = DialogTitle.displayName

const AppDialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogDescription ref={ref} className={cn("text-ap-text-secondary text-sm", className)} {...props} />
))
AppDialogDescription.displayName = DialogDescription.displayName

export {
  AppDialog,
  AppDialogPortal,
  AppDialogOverlay,
  AppDialogClose,
  AppDialogTrigger,
  AppDialogContent,
  AppDialogHeader,
  AppDialogFooter,
  AppDialogTitle,
  AppDialogDescription,
}
