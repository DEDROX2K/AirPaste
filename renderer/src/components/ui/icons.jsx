// The app's one icon set: pixelarticons (MIT, https://pixelarticons.com),
// drawn on a 24px grid. Exports keep the lucide-react names the app used
// before, and the lucide `size` prop, so call sites didn't have to change.
// Sharpest at multiples of 12px (12, 24, 36).
import { forwardRef } from "react";
import {
  Archive as PixelArchive,
  ArrowBarLeft,
  ArrowBarRight,
  BatteryMedium,
  BookOpen,
  Bug as PixelBug,
  Clipboard as PixelClipboard,
  Bookmark as PixelBookmark,
  Code as PixelCode,
  Image as PixelImage,
  Bulletlist,
  Calculator as PixelCalculator,
  Calendar,
  Cancel,
  Check as PixelCheck,
  CheckboxOn,
  ChevronDown as PixelChevronDown,
  ChevronRight as PixelChevronRight,
  Circle as PixelCircle,
  CircleInfo,
  Close,
  CloudSun as PixelCloudSun,
  Copy as PixelCopy,
  Download,
  Eye as PixelEye,
  FileText as PixelFileText,
  Folder as PixelFolder,
  FolderPlus as PixelFolderPlus,
  Frame as PixelFrame,
  Gear,
  GitBranch,
  Github,
  Globe as PixelGlobe,
  Grid2x22,
  Grid3x3,
  Hand,
  Hash as PixelHash,
  Heart,
  Hourglass,
  Layout,
  Link as PixelLink,
  ListBox,
  Menu as PixelMenu,
  Minus as PixelMinus,
  MoreHorizontal as PixelMoreHorizontal,
  Notebook,
  Notes as PixelNotes,
  PenSquare,
  Pencil as PixelPencil,
  Plus as PixelPlus,
  Reload,
  Search as PixelSearch,
  SlidersHorizontal,
  Sparkles as PixelSparkles,
  SpeedFast,
  Square as PixelSquare,
  SquareAlert,
  Star as PixelStar,
  Sticker as PixelSticker,
  StickyNote as PixelStickyNote,
  Target as PixelTarget,
  TextAlignCenter,
  TextAlignLeft,
  TextAlignRight,
  TextStartT,
  Trash,
  Unlink as PixelUnlink,
  CursorMinimal,
  WarningDiamond,
  Zap,
} from "pixelarticons/react";

function joinClassNames(...names) {
  return names.filter(Boolean).join(" ");
}

// lucide-only props (strokeWidth, absoluteStrokeWidth) don't apply to
// filled pixel shapes, and `fill="none"` would make them invisible.
function withoutLucideProps(props) {
  const rest = { ...props };
  delete rest.strokeWidth;
  delete rest.absoluteStrokeWidth;
  delete rest.fill;
  return rest;
}

function pixelIcon(Glyph, displayName) {
  const Icon = forwardRef(function PixelIcon({
    size = 24,
    color,
    className,
    style,
    ...props
  }, ref) {
    const rest = withoutLucideProps(props);
    return (
      <Glyph
        ref={ref}
        width={size}
        height={size}
        shapeRendering="crispEdges"
        className={joinClassNames("ap-pixel-icon", className)}
        style={color ? { color, ...style } : style}
        {...rest}
      />
    );
  });

  Icon.displayName = displayName;
  return Icon;
}

// Filled star for "starred" state, generated from pixelarticons' star with
// its interior filled in.
const STAR_SOLID_PATH = "M11 1h2v2h-2zM9 3h6v4H9zM1 7h22v4H1zM3 11h18v2H3zM5 13h14v3H5zM3 16h18v2H3zM3 18h7v2H3zM14 18h7v2h-7zM3 20h5v2H3zM16 20h5v2h-5z";

function StarSolidGlyph(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d={STAR_SOLID_PATH} />
    </svg>
  );
}

const StarOutline = pixelIcon(PixelStar, "Star");
const StarFilled = pixelIcon(StarSolidGlyph, "StarSolid");

// lucide's Star took `fill="currentColor"` to show the starred state.
export const Star = forwardRef(function Star({ fill, ...props }, ref) {
  const Icon = fill && fill !== "none" ? StarFilled : StarOutline;
  return <Icon ref={ref} {...props} />;
});

// The home button is the AirPaste logo (pixel art itself).
export const Home = forwardRef(function Home({ size = 24, className, ...props }, ref) {
  const rest = withoutLucideProps(props);
  return (
    <img
      ref={ref}
      src={`${import.meta.env.BASE_URL}logo.png`}
      width={size}
      height={size}
      alt=""
      draggable={false}
      className={joinClassNames("ap-logo-icon", className)}
      {...rest}
    />
  );
});

// lucide names -> pixel glyphs.
export const Archive = pixelIcon(PixelArchive, "Archive");
export const BookOpenText = pixelIcon(BookOpen, "BookOpenText");
export const Calculator = pixelIcon(PixelCalculator, "Calculator");
export const CalendarDays = pixelIcon(Calendar, "CalendarDays");
export const Check = pixelIcon(PixelCheck, "Check");
export const ChevronDown = pixelIcon(PixelChevronDown, "ChevronDown");
export const ChevronRight = pixelIcon(PixelChevronRight, "ChevronRight");
export const Circle = pixelIcon(PixelCircle, "Circle");
export const CloudSun = pixelIcon(PixelCloudSun, "CloudSun");
export const Copy = pixelIcon(PixelCopy, "Copy");
export const Eye = pixelIcon(PixelEye, "Eye");
export const FileText = pixelIcon(PixelFileText, "FileText");
export const Folder = pixelIcon(PixelFolder, "Folder");
export const FolderOpen = pixelIcon(PixelFolder, "FolderOpen");
export const FolderPlus = pixelIcon(PixelFolderPlus, "FolderPlus");
export const Frame = pixelIcon(PixelFrame, "Frame");
export const Globe = pixelIcon(PixelGlobe, "Globe");
export const Grid2X2 = pixelIcon(Grid2x22, "Grid2X2");
export const Hash = pixelIcon(PixelHash, "Hash");
export const HeartHandshake = pixelIcon(Heart, "HeartHandshake");
export const Import = pixelIcon(Download, "Import");
export const LayoutList = pixelIcon(ListBox, "LayoutList");
export const Link2 = pixelIcon(PixelLink, "Link2");
export const List = pixelIcon(Bulletlist, "List");
export const ListChecks = pixelIcon(CheckboxOn, "ListChecks");
export const Menu = pixelIcon(PixelMenu, "Menu");
export const MoreHorizontal = pixelIcon(PixelMoreHorizontal, "MoreHorizontal");
export const NotebookText = pixelIcon(Notebook, "NotebookText");
export const PenLine = pixelIcon(PenSquare, "PenLine");
export const Pencil = pixelIcon(PixelPencil, "Pencil");
export const Plus = pixelIcon(PixelPlus, "Plus");
export const RefreshCw = pixelIcon(Reload, "RefreshCw");
export const Search = pixelIcon(PixelSearch, "Search");
export const Settings = pixelIcon(Gear, "Settings");
export const Settings2 = pixelIcon(SlidersHorizontal, "Settings2");
export const Sparkles = pixelIcon(PixelSparkles, "Sparkles");
export const Table2 = pixelIcon(Grid3x3, "Table2");
export const Target = pixelIcon(PixelTarget, "Target");
export const Timer = pixelIcon(Hourglass, "Timer");
export const Trash2 = pixelIcon(Trash, "Trash2");
export const Type = pixelIcon(TextStartT, "Type");
export const X = pixelIcon(Close, "X");

// Icons that replaced hand-drawn inline SVGs.
export const Minus = pixelIcon(PixelMinus, "Minus");
export const Square = pixelIcon(PixelSquare, "Square");
export const Info = pixelIcon(CircleInfo, "Info");
export const ErrorIcon = pixelIcon(Cancel, "ErrorIcon");
export const Alert = pixelIcon(SquareAlert, "Alert");
export const Warning = pixelIcon(WarningDiamond, "Warning");
export const Sidebar = pixelIcon(Layout, "Sidebar");
export const SidebarOpen = pixelIcon(ArrowBarRight, "SidebarOpen");
export const SidebarClose = pixelIcon(ArrowBarLeft, "SidebarClose");
export const Bookmark = pixelIcon(PixelBookmark, "Bookmark");
export const Canvas = pixelIcon(PixelFrame, "Canvas");
export const Notes = pixelIcon(PixelNotes, "Notes");
export const Sticker = pixelIcon(PixelSticker, "Sticker");
export const StickyNote = pixelIcon(PixelStickyNote, "StickyNote");
export const AlignLeft = pixelIcon(TextAlignLeft, "AlignLeft");
export const AlignCenter = pixelIcon(TextAlignCenter, "AlignCenter");
export const AlignRight = pixelIcon(TextAlignRight, "AlignRight");
export const GitHubMark = pixelIcon(Github, "GitHubMark");
export const Fork = pixelIcon(GitBranch, "Fork");
export const Pointer = pixelIcon(CursorMinimal, "Pointer");
export const PanHand = pixelIcon(Hand, "PanHand");
export const Tether = pixelIcon(PixelLink, "Tether");
export const Bolt = pixelIcon(Zap, "Bolt");
export const Code = pixelIcon(PixelCode, "Code");
export const Gauge = pixelIcon(SpeedFast, "Gauge");
export const Image = pixelIcon(PixelImage, "Image");
export const Progress = pixelIcon(BatteryMedium, "Progress");
export const Unlink = pixelIcon(PixelUnlink, "Unlink");
export const Bug = pixelIcon(PixelBug, "Bug");
export const Clipboard = pixelIcon(PixelClipboard, "Clipboard");
