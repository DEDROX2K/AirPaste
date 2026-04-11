import {
  AppButton,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuLabel,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
} from "./ui/app";

export default function CanvasAddMenu({
  commands,
  disabled,
}) {
  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <AppButton
          variant="default"
          size="sm"
          className="canvas-add-menu__trigger gap-2 px-3 font-medium"
          disabled={disabled}
          title={disabled ? "Open a folder to start adding" : "Create something new"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span>Add</span>
        </AppButton>
      </AppDropdownMenuTrigger>

      <AppDropdownMenuContent className="w-52" align="end" sideOffset={8}>
        <AppDropdownMenuLabel className="text-ap-text-secondary text-xs uppercase tracking-wider font-semibold pb-1">
          Structure
        </AppDropdownMenuLabel>
        <AppDropdownMenuItem
          disabled={disabled}
          onSelect={() => commands.createFolderTile()}
        >
          <FolderIcon />
          Folder
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          disabled={disabled}
          onSelect={() => commands.createRack()}
        >
          <RackIcon />
          Rack
        </AppDropdownMenuItem>

        <AppDropdownMenuSeparator />
        <AppDropdownMenuLabel className="text-ap-text-secondary text-xs uppercase tracking-wider font-semibold pb-1">
          Import
        </AppDropdownMenuLabel>
        <AppDropdownMenuItem disabled className="opacity-50 cursor-not-allowed gap-2">
          <LinkIcon />
          <span>Link</span>
          <span className="ml-auto text-[10px] text-ap-text-secondary bg-ap-surface-muted px-1.5 py-0.5 rounded-ap-sm">Paste</span>
        </AppDropdownMenuItem>
        <AppDropdownMenuItem disabled className="opacity-50 cursor-not-allowed gap-2">
          <ImageIcon />
          <span>Image</span>
          <span className="ml-auto text-[10px] text-ap-text-secondary bg-ap-surface-muted px-1.5 py-0.5 rounded-ap-sm">Paste</span>
        </AppDropdownMenuItem>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mr-2 shrink-0">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function RackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mr-2 shrink-0">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}
