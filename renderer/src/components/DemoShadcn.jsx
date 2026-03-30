import { useState } from "react";
import {
  AppButton,
  AppInput,
  AppTextarea,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
  AppDialogTrigger,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuLabel,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
  AppContextMenu,
  AppContextMenuContent,
  AppContextMenuItem,
  AppContextMenuTrigger,
  AppTooltip,
  AppTooltipContent,
  AppTooltipProvider,
  AppTooltipTrigger,
  AppSheet,
  AppSheetContent,
  AppSheetDescription,
  AppSheetHeader,
  AppSheetTitle,
  AppSheetTrigger,
  AppTabs,
  AppTabsContent,
  AppTabsList,
  AppTabsTrigger,
  AppSeparator,
  AppScrollArea,
  AppCard,
  AppCardContent,
  AppCardDescription,
  AppCardHeader,
  AppCardTitle
} from "./ui/app";
import { Copy, MoreHorizontal, Settings } from "lucide-react";

export function DemoShadcn() {
  const [open, setOpen] = useState(false);

  return (
    <AppSheet open={open} onOpenChange={setOpen}>
      <AppSheetTrigger asChild>
        <AppButton 
          variant="outline" 
          size="icon"
          className="fixed bottom-4 right-4 z-ap-max rounded-full shadow-md h-12 w-12"
          title="Shadcn UI Demo"
        >
          <Settings className="h-6 w-6" />
        </AppButton>
      </AppSheetTrigger>
      
      <AppSheetContent side="right" className="w-[400px] sm:w-[540px] z-[10000]">
        <AppSheetHeader>
          <AppSheetTitle>AirPaste UI Demo</AppSheetTitle>
          <AppSheetDescription>
            A preview of the installed shadcn/ui primitives wrapped in AirPaste UI design limits.
          </AppSheetDescription>
        </AppSheetHeader>
        
        <AppScrollArea className="h-[calc(100vh-8rem)] mt-6 pr-4">
          <div className="space-y-8">
            
            {/* Buttons */}
            <section className="space-y-4">
              <h3 className="text-lg font-medium text-ap-text-primary">Buttons</h3>
              <div className="flex flex-wrap gap-2">
                <AppButton variant="default">Default</AppButton>
                <AppButton variant="secondary">Secondary</AppButton>
                <AppButton variant="destructive">Destructive</AppButton>
                <AppButton variant="outline">Outline</AppButton>
                <AppButton variant="ghost">Ghost</AppButton>
                <AppButton variant="link">Link</AppButton>
              </div>
            </section>
            
            <AppSeparator />

            {/* Inputs & Textarea */}
            <section className="space-y-4">
              <h3 className="text-lg font-medium text-ap-text-primary">Forms</h3>
              <div className="grid w-full items-center gap-1.5">
                <AppInput type="email" placeholder="Email" />
              </div>
              <div className="grid w-full items-center gap-1.5">
                <AppTextarea placeholder="Type your message here." />
              </div>
            </section>
            
            <AppSeparator />

            {/* Overlays / Dialogs */}
            <section className="space-y-4">
              <h3 className="text-lg font-medium text-ap-text-primary">Dialog & Overlays</h3>
              <div className="flex flex-wrap gap-4">
                <AppDialog>
                  <AppDialogTrigger asChild>
                    <AppButton variant="outline">Open Dialog</AppButton>
                  </AppDialogTrigger>
                  <AppDialogContent className="z-[10001]">
                    <AppDialogHeader>
                      <AppDialogTitle>Are you absolutely sure?</AppDialogTitle>
                      <AppDialogDescription>
                        This action cannot be undone. This will permanently delete your account
                        and remove your data from our servers.
                      </AppDialogDescription>
                    </AppDialogHeader>
                  </AppDialogContent>
                </AppDialog>

                <AppDropdownMenu>
                  <AppDropdownMenuTrigger asChild>
                    <AppButton variant="outline">Open Menu <MoreHorizontal className="ml-2 h-4 w-4" /></AppButton>
                  </AppDropdownMenuTrigger>
                  <AppDropdownMenuContent className="z-[10001]">
                    <AppDropdownMenuLabel>My Account</AppDropdownMenuLabel>
                    <AppDropdownMenuSeparator />
                    <AppDropdownMenuItem>Profile</AppDropdownMenuItem>
                    <AppDropdownMenuItem>Billing</AppDropdownMenuItem>
                    <AppDropdownMenuItem>Team</AppDropdownMenuItem>
                    <AppDropdownMenuItem>Subscription</AppDropdownMenuItem>
                  </AppDropdownMenuContent>
                </AppDropdownMenu>

                <AppTooltipProvider>
                  <AppTooltip>
                    <AppTooltipTrigger asChild>
                      <AppButton variant="outline" size="icon">
                        <Copy className="h-4 w-4" />
                      </AppButton>
                    </AppTooltipTrigger>
                    <AppTooltipContent className="z-[10001]">
                      <p>Copy to clipboard</p>
                    </AppTooltipContent>
                  </AppTooltip>
                </AppTooltipProvider>
              </div>
            </section>

            <AppSeparator />

            {/* Context Menu */}
            <section className="space-y-4">
              <h3 className="text-lg font-medium text-ap-text-primary">Context Menu</h3>
              <AppContextMenu>
                <AppContextMenuTrigger className="flex h-[150px] w-full items-center justify-center rounded-ap-md border border-dashed border-ap-border-strong text-sm text-ap-text-secondary">
                  Right click here
                </AppContextMenuTrigger>
                <AppContextMenuContent className="z-[10001]">
                  <AppContextMenuItem>Back</AppContextMenuItem>
                  <AppContextMenuItem>Forward</AppContextMenuItem>
                  <AppContextMenuItem>Reload</AppContextMenuItem>
                  <AppContextMenuItem>Save As...</AppContextMenuItem>
                </AppContextMenuContent>
              </AppContextMenu>
            </section>

            <AppSeparator />

            {/* Data Display / Card */}
            <section className="space-y-4">
              <h3 className="text-lg font-medium text-ap-text-primary">Cards & Tabs</h3>
              <AppTabs defaultValue="account" className="w-[400px]">
                <AppTabsList>
                  <AppTabsTrigger value="account">Account</AppTabsTrigger>
                  <AppTabsTrigger value="password">Password</AppTabsTrigger>
                </AppTabsList>
                <AppTabsContent value="account">
                  <AppCard>
                    <AppCardHeader>
                      <AppCardTitle>Account</AppCardTitle>
                      <AppCardDescription>
                        Make changes to your account here. Click save when you&apos;re done.
                      </AppCardDescription>
                    </AppCardHeader>
                    <AppCardContent className="space-y-2">
                      <div className="space-y-1">
                        <AppInput id="name" defaultValue="Pedro Duarte" />
                      </div>
                      <div className="space-y-1">
                        <AppInput id="username" defaultValue="@peduarte" />
                      </div>
                      <AppButton>Save changes</AppButton>
                    </AppCardContent>
                  </AppCard>
                </AppTabsContent>
                <AppTabsContent value="password">
                  <AppCard>
                    <AppCardHeader>
                      <AppCardTitle>Password</AppCardTitle>
                      <AppCardDescription>
                        Change your password here. After saving, you&apos;ll be logged out.
                      </AppCardDescription>
                    </AppCardHeader>
                    <AppCardContent className="space-y-2">
                      <div className="space-y-1">
                        <AppInput id="current" type="password" />
                      </div>
                      <div className="space-y-1">
                        <AppInput id="new" type="password" />
                      </div>
                      <AppButton>Save password</AppButton>
                    </AppCardContent>
                  </AppCard>
                </AppTabsContent>
              </AppTabs>
            </section>

          </div>
        </AppScrollArea>
      </AppSheetContent>
    </AppSheet>
  );
}
