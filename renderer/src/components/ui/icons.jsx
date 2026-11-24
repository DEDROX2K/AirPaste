// The app's one icon set: pixelarticons (MIT, https://pixelarticons.com),
// drawn on a 24px grid. Exports keep the lucide-react names the app used
// before, and the lucide `size` prop, so call sites didn't have to change.
// Sharpest at multiples of 12px (12, 24, 36).
import { forwardRef } from "react";
import {
  Archive as PixelArchive,
  ArrowBarLeft,
  ArrowLeft as PixelArrowLeft,
  Brush as PixelBrush,
  ColorsSwatch,
  Checkbox as PixelCheckbox,
  Terminal as PixelTerminal,
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
  Card as PixelCard,
  Clock as PixelClock,
  Check as PixelCheck,
  CheckboxOn,
  ChevronDown as PixelChevronDown,
  ChevronRight as PixelChevronRight,
  Circle as PixelCircle,
  CircleInfo,
  Close,
  ArrowsHorizontal as PixelArrowsHorizontal,
  MessageText as PixelMessageText,
  CloudSun as PixelCloudSun,
  Copy as PixelCopy,
  Download,
  Eye as PixelEye,
  Feather as PixelFeather,
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
  Home as PixelHome,
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
  Share as PixelShare,
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

// The pixel house: the Home button while a file is open (the logo shows on Home).
export const HomeGlyph = pixelIcon(PixelHome, "HomeGlyph");

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
export const Share = pixelIcon(PixelShare, "Share");
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
export const Clock = pixelIcon(PixelClock, "Clock");
export const TileCard = pixelIcon(PixelCard, "TileCard");
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
export const ArrowLeft = pixelIcon(PixelArrowLeft, "ArrowLeft");
export const Highlighter = pixelIcon(PixelBrush, "Highlighter");
export const Palette = pixelIcon(ColorsSwatch, "Palette");
export const CheckboxEmpty = pixelIcon(PixelCheckbox, "CheckboxEmpty");
export const CodeBlock = pixelIcon(PixelTerminal, "CodeBlock");
export const Gauge = pixelIcon(SpeedFast, "Gauge");
export const Image = pixelIcon(PixelImage, "Image");
export const Progress = pixelIcon(BatteryMedium, "Progress");
export const Unlink = pixelIcon(PixelUnlink, "Unlink");
export const Bug = pixelIcon(PixelBug, "Bug");
export const Clipboard = pixelIcon(PixelClipboard, "Clipboard");

// Split screen: two side-by-side panes on the 24px pixel grid
// (pixelarticons has no columns glyph).
const SPLIT_COLUMNS_PATH = "M2 3h20v2H2zM2 19h20v2H2zM2 5h2v14H2zM20 5h2v14h-2zM11 5h2v14h-2z";

function SplitColumnsGlyph(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d={SPLIT_COLUMNS_PATH} />
    </svg>
  );
}

export const SplitColumns = pixelIcon(SplitColumnsGlyph, "SplitColumns");

// Split pair menu (the connector between linked tabs): a frame with one
// side marked, and the panes stacked top / bottom.
const FRAME_PATH = "M2 3h20v2H2zM2 19h20v2H2zM2 5h2v14H2zM20 5h2v14h-2z";

function pathGlyph(d, name) {
  function Glyph(props) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d={d} />
      </svg>
    );
  }
  Glyph.displayName = name;
  return Glyph;
}

export const PaneLeft = pixelIcon(pathGlyph(`${FRAME_PATH}M9 5h2v14H9zM5 10h2v4H5z`, "PaneLeftGlyph"), "PaneLeft");
export const PaneRight = pixelIcon(pathGlyph(`${FRAME_PATH}M13 5h2v14h-2zM17 10h2v4h-2z`, "PaneRightGlyph"), "PaneRight");
export const SplitRows = pixelIcon(pathGlyph(`${FRAME_PATH}M4 11h16v2H4z`, "SplitRowsGlyph"), "SplitRows");
export const SwapHorizontal = pixelIcon(PixelArrowsHorizontal, "SwapHorizontal");
export const Feedback = pixelIcon(PixelMessageText, "Feedback");

// Drawing tools. Line: a pixel diagonal with square end handles
// (pixelarticons has no line glyph). Ink pen: the feather quill.
export const DrawLine = pixelIcon(pathGlyph("M3 17h4v4H3zM17 3h4v4h-4zM7 15h2v2H7zM9 13h2v2H9zM11 11h2v2h-2zM13 9h2v2h-2zM15 7h2v2h-2z", "DrawLineGlyph"), "DrawLine");
export const InkPen = pixelIcon(PixelFeather, "InkPen");

// Curved view: a barrel-shaped frame (sides bowed out) with a centre cross.
export const CurvedView = pixelIcon(pathGlyph("M7 3h10v2H7zM4 5h3v2H4zM17 5h3v2h-3zM3 7h2v10H3zM19 7h2v10h-2zM4 17h3v2H4zM17 17h3v2h-3zM7 19h10v2H7zM11 8h2v8h-2zM8 11h8v2H8z", "CurvedViewGlyph"), "CurvedView");
