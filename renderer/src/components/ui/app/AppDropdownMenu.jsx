import * as React from "react"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuGroup, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuRadioGroup } from "../dropdown-menu"
import { cn } from "@/lib/utils"

const AppDropdownMenu = DropdownMenu
const AppDropdownMenuTrigger = DropdownMenuTrigger
const AppDropdownMenuGroup = DropdownMenuGroup
const AppDropdownMenuPortal = DropdownMenuPortal
const AppDropdownMenuSub = DropdownMenuSub
const AppDropdownMenuRadioGroup = DropdownMenuRadioGroup

const AppDropdownMenuContent = React.forwardRef(({ className, ...props }, ref) => (
  <DropdownMenuContent ref={ref} className={cn("bg-ap-surface-menu border-ap-border-subtle rounded-ap-md shadow-md z-ap-menu", className)} {...props} />
))
AppDropdownMenuContent.displayName = DropdownMenuContent.displayName

const AppDropdownMenuItem = React.forwardRef(({ className, inset, ...props }, ref) => (
  <DropdownMenuItem ref={ref} className={cn("focus:bg-ap-surface-muted focus:text-ap-text-primary transition-all duration-ap-fast rounded-ap-sm text-ap-text-primary", inset && "pl-8", className)} {...props} />
))
AppDropdownMenuItem.displayName = DropdownMenuItem.displayName

const AppDropdownMenuLabel = React.forwardRef(({ className, inset, ...props }, ref) => (
  <DropdownMenuLabel ref={ref} className={cn("text-ap-text-secondary font-semibold", inset && "pl-8", className)} {...props} />
))
AppDropdownMenuLabel.displayName = DropdownMenuLabel.displayName

const AppDropdownMenuSeparator = React.forwardRef(({ className, ...props }, ref) => (
  <DropdownMenuSeparator ref={ref} className={cn("bg-ap-border-subtle", className)} {...props} />
))
AppDropdownMenuSeparator.displayName = DropdownMenuSeparator.displayName

export {
  AppDropdownMenu,
  AppDropdownMenuTrigger,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuLabel,
  AppDropdownMenuSeparator,
  AppDropdownMenuGroup,
  AppDropdownMenuPortal,
  AppDropdownMenuSub,
  AppDropdownMenuRadioGroup,
}
