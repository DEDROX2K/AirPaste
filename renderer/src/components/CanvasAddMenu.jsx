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
  side = "bottom",
}) {
  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <AppButton
          variant="default"
          size="sm"
          className="canvas-add-menu__trigger gap-2 px-3 font-medium"
          disabled={disabled}
          aria-label={disabled ? "Open a folder to start adding tiles" : "Open add menu"}
          title={disabled ? "Open a folder to start adding" : "Create something new"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span>Add</span>
        </AppButton>
      </AppDropdownMenuTrigger>

      <AppDropdownMenuContent className="w-52" align="end" side={side} sideOffset={8}>
        <AppDropdownMenuLabel className="text-ap-text-secondary text-xs uppercase tracking-wider font-semibold pb-1">
          Structure
        </AppDropdownMenuLabel>
        <AppDropdownMenuItem
          disabled={disabled}
          onSelect={() => commands.createChecklist()}
        >
          <ChecklistIcon />
          Checklist
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          disabled={disabled}
          onSelect={() => commands.createCode()}
        >
          <CodeIcon />
          Code Snippet
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          disabled={disabled}
          onSelect={() => commands.createCounter()}
        >
          <CounterIcon />
          Counter
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          disabled={disabled}
          onSelect={() => commands.createDeadline()}
        >
          <DeadlineIcon />
          Deadline Countdown
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          disabled={disabled}
          onSelect={() => commands.createNote()}
        >
          <NoteIcon />
          Note
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          disabled={disabled}
          onSelect={() => commands.createTextBox()}
        >
          <TextBoxIcon />
          Text Box
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          disabled={disabled}
          onSelect={() => commands.createTable()}
        >
          <TableIcon />
          Table
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          disabled={disabled}
          onSelect={() => commands.createProgress()}
        >
          <ProgressIcon />
          Progress Bar
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

function RackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mr-2 shrink-0">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  );
}

function ChecklistIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mr-2 shrink-0">
      <rect x="3" y="4" width="4" height="4" rx="1" />
      <path d="M11 6h10" />
      <rect x="3" y="10" width="4" height="4" rx="1" />
      <path d="M11 12h10" />
      <rect x="3" y="16" width="4" height="4" rx="1" />
      <path d="M11 18h10" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mr-2 shrink-0">
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M15 3v4h4" />
      <path d="M9 11h6" />
      <path d="M9 15h6" />
      <path d="M9 19h4" />
    </svg>
  );
}

function TextBoxIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mr-2 shrink-0">
      <path d="M4 6h16" />
      <path d="M9 6v12" />
      <path d="M15 6v12" />
      <path d="M6 18h12" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mr-2 shrink-0">
      <path d="m8 9-4 3 4 3" />
      <path d="m16 9 4 3-4 3" />
      <path d="m14 4-4 16" />
    </svg>
  );
}

function CounterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mr-2 shrink-0">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </svg>
  );
}

function DeadlineIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mr-2 shrink-0">
      <circle cx="12" cy="13" r="8.5" />
      <path d="M12 9v4l2.5 1.5" />
      <path d="M9 3h6" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mr-2 shrink-0">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M9 4v16" />
      <path d="M15 4v16" />
    </svg>
  );
}

function ProgressIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mr-2 shrink-0">
      <rect x="3" y="8" width="18" height="8" rx="4" />
      <path d="M7 12h6" />
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
