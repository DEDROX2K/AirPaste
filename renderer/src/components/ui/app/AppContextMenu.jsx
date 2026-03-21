import * as React from "react"
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuGroup, ContextMenuPortal, ContextMenuSub, ContextMenuRadioGroup } from "../context-menu"
import { cn } from "@/lib/utils"

const AppContextMenu = ContextMenu
const AppContextMenuTrigger = ContextMenuTrigger
const AppContextMenuGroup = ContextMenuGroup
const AppContextMenuPortal = ContextMenuPortal
const AppContextMenuSub = ContextMenuSub
const AppContextMenuRadioGroup = ContextMenuRadioGroup

const AppContextMenuContent = React.forwardRef(({ className, ...props }, ref) => (
  <ContextMenuContent ref={ref} className={cn("bg-ap-surface-menu border-ap-border-subtle rounded-ap-md shadow-md z-ap-menu", className)} {...props} />
))
AppContextMenuContent.displayName = ContextMenuContent.displayName

const AppContextMenuItem = React.forwardRef(({ className, inset, ...props }, ref) => (
  <ContextMenuItem ref={ref} className={cn("focus:bg-ap-surface-muted focus:text-ap-text-primary transition-all duration-ap-fast rounded-ap-sm text-ap-text-primary", inset && "pl-8", className)} {...props} />
))
AppContextMenuItem.displayName = ContextMenuItem.displayName

export { AppContextMenu, AppContextMenuTrigger, AppContextMenuContent, AppContextMenuItem, AppContextMenuGroup, AppContextMenuPortal, AppContextMenuSub, AppContextMenuRadioGroup }
