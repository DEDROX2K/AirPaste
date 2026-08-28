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
  <ContextMenuContent ref={ref} className={cn("ap-context-menu-surface z-ap-menu", className)} {...props} />
))
AppContextMenuContent.displayName = ContextMenuContent.displayName

const AppContextMenuItem = React.forwardRef(({ className, inset, ...props }, ref) => (
  <ContextMenuItem ref={ref} className={cn("ap-context-menu-item", inset && "pl-8", className)} {...props} />
))
AppContextMenuItem.displayName = ContextMenuItem.displayName

export { AppContextMenu, AppContextMenuTrigger, AppContextMenuContent, AppContextMenuItem, AppContextMenuGroup, AppContextMenuPortal, AppContextMenuSub, AppContextMenuRadioGroup }
