import * as React from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../tabs"
import { cn } from "@/lib/utils"

const AppTabs = Tabs

const AppTabsList = React.forwardRef(({ className, ...props }, ref) => (
  <TabsList
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-ap-md bg-ap-surface-muted p-1 text-ap-text-secondary",
      className
    )}
    {...props}
  />
))
AppTabsList.displayName = TabsList.displayName

const AppTabsTrigger = React.forwardRef(({ className, ...props }, ref) => (
  <TabsTrigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-ap-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-ap-surface-shell data-[state=active]:text-ap-text-primary data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
))
AppTabsTrigger.displayName = TabsTrigger.displayName

const AppTabsContent = React.forwardRef(({ className, ...props }, ref) => (
  <TabsContent
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
AppTabsContent.displayName = TabsContent.displayName

export { AppTabs, AppTabsList, AppTabsTrigger, AppTabsContent }
