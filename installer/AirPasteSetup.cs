// AirPaste Setup: a small custom Windows installer with a modern card UI and
// a segmented progress bar (replaces electron-builder's NSIS dialog).
//
// Built by installer/build-installer.js with the C# compiler that ships with
// Windows (.NET Framework 4.8, C# 5 -- so no string interpolation or `?.`).
// The app itself (dist/win-unpacked, zipped) is appended to the end of this
// exe, followed by its length and a magic marker:
//
//   [stub exe][payload.zip][int64 zip length]["APINST01"]
//
// The same stub without a payload is copied into the install folder as the
// uninstaller ("Uninstall AirPaste.exe --uninstall").
//
// Per-user install, no admin: %LOCALAPPDATA%\Programs\AirPaste, Start menu
// and desktop shortcuts, and an entry in Settings > Apps (HKCU).

using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using Microsoft.Win32;

[assembly: AssemblyTitle("AirPaste Setup")]
[assembly: AssemblyProduct("AirPaste")]
[assembly: AssemblyCompany("AirPaste")]
[assembly: AssemblyDescription("Installer for AirPaste, the local-first desktop canvas for everything you save.")]
[assembly: AssemblyCopyright("Copyright (c) 2026 AirPaste")]

namespace AirPasteInstaller
{
    static class Product
    {
        public const string Name = "AirPaste";
        public const string ExeName = "airpaste.exe";
        public const string UninstallerName = "Uninstall AirPaste.exe";
        public const string RegistryKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\AirPaste";
        public static readonly byte[] Magic = Encoding.ASCII.GetBytes("APINST01");

        // --dir / --shortcut-dir: install somewhere else (used to test setup
        // without touching a real install).
        public static string InstallDirOverride;
        public static string ShortcutDirOverride;

        public static string InstallDir
        {
            get
            {
                if (!string.IsNullOrEmpty(InstallDirOverride)) return InstallDirOverride;
                return System.IO.Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "Programs",
                    Name);
            }
        }

        public static string StartMenuShortcut
        {
            get
            {
                string folder = ShortcutDirOverride != null
                    ? System.IO.Path.Combine(ShortcutDirOverride, "Start")
                    : Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                return System.IO.Path.Combine(folder, Name + ".lnk");
            }
        }

        public static string DesktopShortcut
        {
            get
            {
                string folder = ShortcutDirOverride != null
                    ? System.IO.Path.Combine(ShortcutDirOverride, "Desktop")
                    : Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                return System.IO.Path.Combine(folder, Name + ".lnk");
            }
        }
    }

    // A read-only, seekable window onto part of another stream (the zip
    // payload inside this exe), so ZipArchive can read it in place.
    class OffsetStream : Stream
    {
        private readonly Stream inner;
        private readonly long start;
        private readonly long length;
        private long position;

        public OffsetStream(Stream inner, long start, long length)
        {
            this.inner = inner;
            this.start = start;
            this.length = length;
        }

        public override bool CanRead { get { return true; } }
        public override bool CanSeek { get { return true; } }
        public override bool CanWrite { get { return false; } }
        public override long Length { get { return length; } }

        public override long Position
        {
            get { return position; }
            set { position = value; }
        }

        public override int Read(byte[] buffer, int offset, int count)
        {
            long remaining = length - position;
            if (remaining <= 0) return 0;
            if (count > remaining) count = (int)remaining;
            inner.Position = start + position;
            int read = inner.Read(buffer, offset, count);
            position += read;
            return read;
        }

        public override long Seek(long offset, SeekOrigin origin)
        {
            if (origin == SeekOrigin.Begin) position = offset;
            else if (origin == SeekOrigin.Current) position += offset;
            else position = length + offset;
            return position;
        }

        public override void Flush() { }
        public override void SetLength(long value) { throw new NotSupportedException(); }
        public override void Write(byte[] buffer, int offset, int count) { throw new NotSupportedException(); }
    }

    static class Payload
    {
        // Where the stub ends and the zip starts, or -1 when this exe has no
        // payload (the uninstaller).
        public static void Locate(string exePath, out long stubLength, out long zipLength)
        {
            stubLength = -1;
            zipLength = 0;
            using (FileStream file = File.OpenRead(exePath))
            {
                if (file.Length < 16) return;
                byte[] trailer = new byte[16];
                file.Position = file.Length - 16;
                ReadFully(file, trailer);
                for (int i = 0; i < 8; i++)
                {
                    if (trailer[8 + i] != Product.Magic[i]) return;
                }
                zipLength = BitConverter.ToInt64(trailer, 0);
                stubLength = file.Length - 16 - zipLength;
            }
        }

        public static void ReadFully(Stream stream, byte[] buffer)
        {
            int offset = 0;
            while (offset < buffer.Length)
            {
                int read = stream.Read(buffer, offset, buffer.Length - offset);
                if (read <= 0) throw new EndOfStreamException();
                offset += read;
            }
        }
    }

    // ---------------------------------------------------------------- UI
    //
    // Bento layout: a dark notice bar on top; under it a media tile (a
    // looping strip of art and three keys: fast forward, play/pause,
    // website) and a blue progress tile (big percentage, speed chip, ETA
    // dot, and a track of rounded bars that widen as progress passes them).
    // Icons are pixelarticons (MIT), the same set the app uses.

    static class Icons
    {
        public const string Play = "M15 11h-2V9h2zm0 4h-2v-2h2zm-2 2h-2v-2h2zm0-8h-2V7h2zm-2-2H9V5h2zM9 21H7V3h2zm6-8h2v-2h-2zm-6 4h2v2H9z";
        public const string Pause = "M10 20H4V4h6v16Zm8-16v16h-6V4h6Zm-4 2v12h2V6h-2ZM6 18h2V6H6v12Z";
        public const string Forward = "M5 19H3v-2h2v2Zm16 0h-2v-2h2v2ZM3 17H1v-6h2v6Zm11 0h-4v-4h4v4Zm9 0h-2v-6h2v6Zm-7-4h-2v-2h2v2ZM5 11H3V9h2v2Zm13 0h-2V9h2v2ZM9 9H5V7h4v2Zm11 0h-2V7h2v2Zm-5-2H9V5h6v2Z"; // speed-fast
        public const string Globe = "M6 2h12v2H6zm0 18h12v2H6zM4 4h2v2H4zm5 0h2v2H9zm0 14h2v2H9zm4 0h2v2h-2zM7 6h2v12H7zm8 0h2v12h-2zm-2-2h2v2h-2zm7 0h-2v2h2zM2 6h2v12H2zm20 0h-2v12h2zM4 18h2v2H4zm16 0h-2v2h2zM3 11h18v2H3z";
        public const string Close = "M7 19H5V17H7V19ZM19 19H17V17H19V19ZM9 15V17H7V15H9ZM17 17H15V15H17V17ZM11 15H9V13H11V15ZM15 15H13V13H15V15ZM13 13H11V11H13V13ZM11 11H9V9H11V11ZM15 11H13V9H15V11ZM9 9H7V7H9V9ZM17 9H15V7H17V9ZM7 7H5V5H7V7ZM19 7H17V5H19V7Z";

        // 24px grid, nonzero fill (as in the SVGs), snapped to pixels.
        public static UIElement Make(string data, Brush fill)
        {
            System.Windows.Shapes.Path path = new System.Windows.Shapes.Path
            {
                Data = Geometry.Parse("F1 " + data),
                Fill = fill,
                Width = 24,
                Height = 24,
                Stretch = Stretch.None,
                SnapsToDevicePixels = true,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            };
            RenderOptions.SetEdgeMode(path, EdgeMode.Aliased);
            return path;
        }
    }

    class SetupWindow : Window
    {
        const string WebsiteUrl = "https://dedrox2k.github.io/dedrox/airpaste.html";
        const double BarStep = 17;
        const double StripSpeed = 60;      // px/s while playing
        const double StripFastSpeed = 420; // px/s while fast forward is held

        static readonly Color PageColor = Color.FromRgb(0xE9, 0xEA, 0xEE);
        static readonly Color MediaColor = Color.FromRgb(0x17, 0x17, 0x1A);
        static readonly Color BlueColor = Color.FromRgb(0x34, 0x74, 0xFF);
        static readonly Color BlackColor = Color.FromRgb(0x07, 0x07, 0x09);
        static readonly Color OrangeColor = Color.FromRgb(0xFF, 0x91, 0x24);
        static readonly Color NavyColor = Color.FromRgb(0x0B, 0x1F, 0x45);
        static readonly Color InkColor = Color.FromRgb(0xF4, 0xF6, 0xFF);
        static readonly Color DimColor = Color.FromRgb(0x8A, 0x8D, 0x96);
        static readonly FontFamily Display = new FontFamily("Segoe UI Variable Display, Segoe UI");
        static readonly FontFamily Text = new FontFamily("Segoe UI Variable Text, Segoe UI");

        readonly bool uninstallMode;
        readonly bool quiet;
        readonly string uninstallDir;
        readonly string version;

        TextBlock headlineText;
        TextBlock detailText;
        Button primaryButton;
        Button secondaryButton;
        Action primaryAction;
        Action secondaryAction;

        Border screen;
        Canvas stripCanvas;
        Image stripImage;
        BitmapSource stripSource;
        Button fastKey;
        Button playKey;
        bool playing = true;
        bool holding;
        double stripPhase;

        TextBlock percentText;
        TextBlock stageText;
        TextBlock speedText;
        TextBlock etaText;
        Border etaDot;
        Border track;
        Canvas barCanvas;
        readonly System.Collections.Generic.List<Rectangle> bars = new System.Collections.Generic.List<Rectangle>();
        Brush barBrush;
        double targetFraction;
        double shownFraction;
        string stageOverride;

        readonly Stopwatch frameClock = new Stopwatch();
        double lastFrame;
        bool busy;
        string lastError;

        public SetupWindow(bool uninstallMode, string uninstallDir, string version, bool quiet)
        {
            this.uninstallMode = uninstallMode;
            this.quiet = quiet;
            this.uninstallDir = uninstallDir;
            this.version = version;

            Title = uninstallMode ? "Uninstall AirPaste" : "AirPaste Setup";
            Width = 860;
            SizeToContent = SizeToContent.Height;
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            ResizeMode = ResizeMode.NoResize;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            UseLayoutRounding = true;
            TextOptions.SetTextFormattingMode(this, TextFormattingMode.Display);
            playing = SystemParameters.ClientAreaAnimation;

            Content = BuildLayout();
            MouseLeftButtonDown += delegate (object sender, MouseButtonEventArgs e)
            {
                if (e.ButtonState == MouseButtonState.Pressed) DragMove();
            };
            Closing += delegate (object sender, System.ComponentModel.CancelEventArgs e)
            {
                if (busy) e.Cancel = true;
            };
            Closed += delegate { CompositionTarget.Rendering -= OnFrame; };

            if (quiet) return;
            if (uninstallMode) ShowUninstallPrompt();
            else Loaded += delegate { StartInstall(); };
            Loaded += delegate
            {
                Topmost = true;
                Activate();
                Topmost = false;
                frameClock.Start();
                CompositionTarget.Rendering += OnFrame;
            };
        }

        static SolidColorBrush Solid(Color color)
        {
            SolidColorBrush brush = new SolidColorBrush(color);
            brush.Freeze();
            return brush;
        }

        static SolidColorBrush Solid(Color color, double opacity)
        {
            return Solid(Color.FromArgb((byte)Math.Round(opacity * 255), color.R, color.G, color.B));
        }

        static Effect Shadow(Color color, double opacity)
        {
            return new DropShadowEffect { BlurRadius = 40, ShadowDepth = 10, Direction = 270, Opacity = opacity, Color = color };
        }

        // Keeps an element's children inside its rounded corners.
        static void ClipRounded(FrameworkElement element, double radius)
        {
            element.SizeChanged += delegate
            {
                element.Clip = new RectangleGeometry(new Rect(0, 0, element.ActualWidth, element.ActualHeight), radius, radius);
            };
        }

        UIElement BuildLayout()
        {
            Grid stack = new Grid();
            stack.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            stack.RowDefinitions.Add(new RowDefinition { Height = new GridLength(14) });
            stack.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

            UIElement notice = BuildNotice();
            Grid.SetRow(notice, 0);
            stack.Children.Add(notice);

            Grid bento = new Grid();
            bento.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            bento.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(14) });
            bento.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1.25, GridUnitType.Star) });
            UIElement media = BuildMediaTile();
            Grid.SetColumn(media, 0);
            bento.Children.Add(media);
            UIElement progress = BuildProgressTile();
            Grid.SetColumn(progress, 2);
            bento.Children.Add(progress);
            Grid.SetRow(bento, 2);
            stack.Children.Add(bento);

            return new Border
            {
                Background = Solid(PageColor),
                CornerRadius = new CornerRadius(44),
                Padding = new Thickness(14),
                Margin = new Thickness(24),
                Child = stack,
                Effect = new DropShadowEffect { BlurRadius = 30, ShadowDepth = 6, Direction = 270, Opacity = 0.28, Color = Colors.Black },
            };
        }

        UIElement BuildNotice()
        {
            StackPanel text = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
            headlineText = new TextBlock
            {
                FontFamily = Display,
                FontSize = 22,
                FontWeight = FontWeights.Medium,
                Foreground = Solid(InkColor),
                TextAlignment = TextAlignment.Center,
                TextWrapping = TextWrapping.Wrap,
            };
            detailText = new TextBlock
            {
                FontFamily = Text,
                FontSize = 14,
                Foreground = Solid(DimColor),
                TextAlignment = TextAlignment.Center,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 6, 0, 0),
            };
            text.Children.Add(headlineText);
            text.Children.Add(detailText);

            StackPanel buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center };
            secondaryButton = PillButton(false);
            secondaryButton.Click += delegate { if (secondaryAction != null) secondaryAction(); };
            primaryButton = PillButton(true);
            primaryButton.Click += delegate { if (primaryAction != null) primaryAction(); };
            buttons.Children.Add(secondaryButton);
            buttons.Children.Add(primaryButton);
            text.Children.Add(buttons);

            Button close = new Button
            {
                Content = Icons.Make(Icons.Close, Solid(DimColor)),
                Width = 36,
                Height = 36,
                Cursor = Cursors.Hand,
                ToolTip = "Close",
                Template = FlatTemplate(18, Solid(Colors.White, 0.08)),
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(0, -8, -14, 0),
            };
            System.Windows.Automation.AutomationProperties.SetName(close, "Close");
            close.Click += delegate { if (!busy) Close(); };

            Grid content = new Grid();
            content.Children.Add(text);
            content.Children.Add(close);

            return new Border
            {
                Background = Solid(MediaColor),
                CornerRadius = new CornerRadius(34),
                Padding = new Thickness(28, 22, 28, 22),
                Child = content,
            };
        }

        UIElement BuildMediaTile()
        {
            Grid inner = new Grid();
            inner.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star), MinHeight = 200 });
            inner.RowDefinitions.Add(new RowDefinition { Height = new GridLength(14) });
            inner.RowDefinitions.Add(new RowDefinition { Height = new GridLength(80) });

            // The screen: the strip pans left and right inside it.
            stripSource = LoadResourceImage("strip.png");
            stripImage = new Image { Source = stripSource, Stretch = Stretch.Fill };
            RenderOptions.SetBitmapScalingMode(stripImage, BitmapScalingMode.NearestNeighbor);
            stripCanvas = new Canvas { ClipToBounds = true };
            stripCanvas.Children.Add(stripImage);
            Grid screenContent = new Grid();
            screenContent.Children.Add(stripCanvas);
            LinearGradientBrush glare = new LinearGradientBrush { StartPoint = new Point(0.1, 0), EndPoint = new Point(0.6, 1) };
            glare.GradientStops.Add(new GradientStop(Color.FromArgb(0x24, 0xFF, 0xFF, 0xFF), 0));
            glare.GradientStops.Add(new GradientStop(Color.FromArgb(0x00, 0xFF, 0xFF, 0xFF), 0.38));
            screenContent.Children.Add(new Rectangle { Fill = glare, IsHitTestVisible = false });
            screen = new Border
            {
                Background = Brushes.Black,
                CornerRadius = new CornerRadius(34),
                Child = screenContent,
            };
            ClipRounded(screen, 34);
            screen.SizeChanged += delegate { LayoutStrip(); };
            Grid.SetRow(screen, 0);
            inner.Children.Add(screen);

            // The keys.
            Grid keys = new Grid();
            for (int i = 0; i < 5; i++)
            {
                keys.ColumnDefinitions.Add(new ColumnDefinition { Width = i % 2 == 0 ? new GridLength(1, GridUnitType.Star) : new GridLength(8) });
            }

            fastKey = MakeKey(Icons.Forward, new CornerRadius(28, 28, 28, 48), "Fast forward (hold)");
            fastKey.PreviewMouseLeftButtonDown += delegate { SetHolding(true); };
            fastKey.PreviewMouseLeftButtonUp += delegate { SetHolding(false); };
            fastKey.LostMouseCapture += delegate { SetHolding(false); };
            fastKey.MouseLeave += delegate { SetHolding(false); };
            fastKey.PreviewKeyDown += delegate (object sender, KeyEventArgs e)
            {
                if (e.Key == Key.Space || e.Key == Key.Enter) { SetHolding(true); e.Handled = true; }
            };
            fastKey.PreviewKeyUp += delegate (object sender, KeyEventArgs e)
            {
                if (e.Key == Key.Space || e.Key == Key.Enter) { SetHolding(false); e.Handled = true; }
            };
            fastKey.LostKeyboardFocus += delegate { SetHolding(false); };

            playKey = MakeKey(Icons.Pause, new CornerRadius(28), "Pause");
            playKey.Click += delegate { playing = !playing; RenderPlayKey(); };
            RenderPlayKey();

            Button webKey = MakeKey(Icons.Globe, new CornerRadius(28, 28, 48, 28), "Visit the AirPaste website");
            webKey.Click += delegate { OpenWebsite(); };

            Grid.SetColumn(fastKey, 0);
            Grid.SetColumn(playKey, 2);
            Grid.SetColumn(webKey, 4);
            keys.Children.Add(fastKey);
            keys.Children.Add(playKey);
            keys.Children.Add(webKey);
            Grid.SetRow(keys, 2);
            inner.Children.Add(keys);

            return new Border
            {
                Background = Solid(MediaColor),
                CornerRadius = new CornerRadius(48),
                Padding = new Thickness(18),
                Child = inner,
            };
        }

        UIElement BuildProgressTile()
        {
            StackPanel column = new StackPanel();

            // Big percentage + stage.
            DockPanel main = new DockPanel { LastChildFill = false };
            percentText = new TextBlock
            {
                FontFamily = Display,
                FontSize = 84,
                FontWeight = FontWeights.Light,
                Foreground = Solid(InkColor),
                VerticalAlignment = VerticalAlignment.Bottom,
                Margin = new Thickness(0, -10, 0, -8),
            };
            DockPanel.SetDock(percentText, Dock.Left);
            main.Children.Add(percentText);
            TextBlock percentSign = new TextBlock
            {
                Text = "%",
                FontFamily = Display,
                FontSize = 35,
                FontWeight = FontWeights.Light,
                Foreground = Solid(Color.FromRgb(0xBF, 0xC4, 0xD1)),
                VerticalAlignment = VerticalAlignment.Bottom,
                Margin = new Thickness(4, 0, 0, 4),
            };
            DockPanel.SetDock(percentSign, Dock.Left);
            main.Children.Add(percentSign);
            stageText = new TextBlock
            {
                FontFamily = Text,
                FontSize = 14,
                Foreground = Solid(Color.FromRgb(0x9E, 0xA3, 0xB2)),
                VerticalAlignment = VerticalAlignment.Bottom,
                Margin = new Thickness(12, 0, 0, 6),
            };
            DockPanel.SetDock(stageText, Dock.Right);
            main.Children.Add(stageText);
            column.Children.Add(new Border
            {
                Background = Solid(BlackColor),
                CornerRadius = new CornerRadius(24),
                Padding = new Thickness(20, 18, 20, 16),
                Child = main,
            });

            column.Children.Add(new TextBlock
            {
                Text = "AirPaste " + (string.IsNullOrEmpty(version) ? "" : "v" + version + " ") + "for Windows",
                FontFamily = Text,
                FontSize = 12,
                Foreground = Solid(Color.FromRgb(0xCF, 0xE0, 0xFF)),
                Opacity = 0.85,
                Margin = new Thickness(6, 10, 6, 10),
            });

            // Speed chip + ETA dot.
            Grid row = new Grid { Margin = new Thickness(0, 0, 0, 10) };
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1.35, GridUnitType.Star) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(10) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            DockPanel chipBody = new DockPanel { LastChildFill = false };
            TextBlock speedLabel = new TextBlock { Text = uninstallMode ? "files" : "speed", FontFamily = Text, FontSize = 12, Foreground = Solid(Color.FromRgb(0x11, 0x11, 0x11)), Opacity = 0.75 };
            DockPanel.SetDock(speedLabel, Dock.Top);
            chipBody.Children.Add(speedLabel);
            speedText = new TextBlock { FontFamily = Display, FontSize = 22, FontWeight = FontWeights.Medium, Foreground = Solid(Color.FromRgb(0x11, 0x11, 0x11)) };
            DockPanel.SetDock(speedText, Dock.Bottom);
            chipBody.Children.Add(speedText);
            Border chip = new Border
            {
                Background = Solid(OrangeColor),
                CornerRadius = new CornerRadius(20),
                Padding = new Thickness(16, 14, 16, 14),
                MinHeight = 78,
                Child = chipBody,
            };
            Grid.SetColumn(chip, 0);
            row.Children.Add(chip);

            etaText = new TextBlock { FontFamily = Display, FontSize = 18, Foreground = Solid(Color.FromRgb(0xDF, 0xE6, 0xFF)), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            etaDot = new Border
            {
                Background = Solid(NavyColor),
                CornerRadius = new CornerRadius(999),
                MinHeight = 78,
                VerticalAlignment = VerticalAlignment.Top,
                Child = etaText,
            };
            etaDot.SizeChanged += delegate { SyncEtaDot(); };
            Grid.SetColumn(etaDot, 2);
            row.Children.Add(etaDot);
            column.Children.Add(row);

            // The bar track.
            barBrush = Solid(BlueColor);
            barCanvas = new Canvas { Margin = new Thickness(18, 14, 18, 14) };
            barCanvas.SizeChanged += delegate { LayoutBars(); };
            track = new Border
            {
                Background = Solid(BlackColor),
                CornerRadius = new CornerRadius(26),
                Height = 86,
                Child = barCanvas,
            };
            ClipRounded(track, 26);
            column.Children.Add(track);

            return new Border
            {
                Background = Solid(BlueColor),
                CornerRadius = new CornerRadius(34),
                Padding = new Thickness(12),
                Child = column,
            };
        }

        static ControlTemplate FlatTemplate(double radius, Brush hover)
        {
            ControlTemplate template = new ControlTemplate(typeof(Button));
            FrameworkElementFactory root = new FrameworkElementFactory(typeof(Grid));
            FrameworkElementFactory border = new FrameworkElementFactory(typeof(Border));
            border.SetValue(Border.BackgroundProperty, new TemplateBindingExtension(Control.BackgroundProperty));
            border.SetValue(Border.BorderBrushProperty, new TemplateBindingExtension(Control.BorderBrushProperty));
            border.SetValue(Border.BorderThicknessProperty, new TemplateBindingExtension(Control.BorderThicknessProperty));
            border.SetValue(Border.CornerRadiusProperty, new CornerRadius(radius));
            root.AppendChild(border);
            FrameworkElementFactory overlay = new FrameworkElementFactory(typeof(Border));
            overlay.Name = "overlay";
            overlay.SetValue(Border.BackgroundProperty, hover);
            overlay.SetValue(Border.CornerRadiusProperty, new CornerRadius(radius));
            overlay.SetValue(UIElement.OpacityProperty, 0.0);
            root.AppendChild(overlay);
            FrameworkElementFactory presenter = new FrameworkElementFactory(typeof(ContentPresenter));
            presenter.SetValue(FrameworkElement.MarginProperty, new TemplateBindingExtension(Control.PaddingProperty));
            presenter.SetValue(ContentPresenter.HorizontalAlignmentProperty, HorizontalAlignment.Center);
            presenter.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);
            root.AppendChild(presenter);
            template.VisualTree = root;
            Trigger over = new Trigger { Property = UIElement.IsMouseOverProperty, Value = true };
            over.Setters.Add(new Setter(UIElement.OpacityProperty, 1.0, "overlay"));
            template.Triggers.Add(over);
            Trigger pressed = new Trigger { Property = ButtonBase.IsPressedProperty, Value = true };
            pressed.Setters.Add(new Setter(UIElement.OpacityProperty, 0.6, "overlay"));
            template.Triggers.Add(pressed);
            return template;
        }

        // A dark key: lit top edge, deep bottom edge, brightens on hover/press.
        static ControlTemplate KeyTemplate(CornerRadius radius)
        {
            ControlTemplate template = new ControlTemplate(typeof(Button));
            FrameworkElementFactory root = new FrameworkElementFactory(typeof(Grid));
            root.SetValue(UIElement.RenderTransformOriginProperty, new Point(0.5, 0.5));
            FrameworkElementFactory body = new FrameworkElementFactory(typeof(Border));
            body.SetValue(Border.BackgroundProperty, new TemplateBindingExtension(Control.BackgroundProperty));
            LinearGradientBrush edge = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(0, 1) };
            edge.GradientStops.Add(new GradientStop(Color.FromArgb(0x1F, 0xFF, 0xFF, 0xFF), 0));
            edge.GradientStops.Add(new GradientStop(Color.FromArgb(0x00, 0xFF, 0xFF, 0xFF), 0.3));
            edge.GradientStops.Add(new GradientStop(Color.FromRgb(0x0B, 0x0B, 0x0D), 1));
            edge.Freeze();
            body.SetValue(Border.BorderBrushProperty, edge);
            body.SetValue(Border.BorderThicknessProperty, new Thickness(0, 1, 0, 2));
            body.SetValue(Border.CornerRadiusProperty, radius);
            root.AppendChild(body);
            FrameworkElementFactory overlay = new FrameworkElementFactory(typeof(Border));
            overlay.Name = "overlay";
            overlay.SetValue(Border.BackgroundProperty, Solid(Colors.White));
            overlay.SetValue(Border.CornerRadiusProperty, radius);
            overlay.SetValue(UIElement.OpacityProperty, 0.0);
            root.AppendChild(overlay);
            FrameworkElementFactory presenter = new FrameworkElementFactory(typeof(ContentPresenter));
            presenter.SetValue(ContentPresenter.HorizontalAlignmentProperty, HorizontalAlignment.Center);
            presenter.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);
            root.AppendChild(presenter);
            FrameworkElementFactory focus = new FrameworkElementFactory(typeof(Border));
            focus.Name = "focus";
            focus.SetValue(Border.BorderBrushProperty, Brushes.White);
            focus.SetValue(Border.BorderThicknessProperty, new Thickness(2));
            focus.SetValue(Border.CornerRadiusProperty, radius);
            focus.SetValue(FrameworkElement.MarginProperty, new Thickness(-4));
            focus.SetValue(UIElement.VisibilityProperty, Visibility.Hidden);
            root.AppendChild(focus);
            template.VisualTree = root;

            Trigger over = new Trigger { Property = UIElement.IsMouseOverProperty, Value = true };
            over.Setters.Add(new Setter(UIElement.OpacityProperty, 0.06, "overlay"));
            template.Triggers.Add(over);
            Trigger pressed = new Trigger { Property = ButtonBase.IsPressedProperty, Value = true };
            pressed.Setters.Add(new Setter(UIElement.OpacityProperty, 0.12, "overlay"));
            pressed.Setters.Add(new Setter(UIElement.RenderTransformProperty, new ScaleTransform(0.97, 0.97)));
            template.Triggers.Add(pressed);
            Trigger keyboard = new Trigger { Property = UIElement.IsKeyboardFocusedProperty, Value = true };
            keyboard.Setters.Add(new Setter(UIElement.VisibilityProperty, Visibility.Visible, "focus"));
            template.Triggers.Add(keyboard);
            return template;
        }

        static Brush KeyFill(bool lit)
        {
            LinearGradientBrush brush = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(0, 1) };
            brush.GradientStops.Add(new GradientStop(lit ? Color.FromRgb(0x3C, 0x3C, 0x44) : Color.FromRgb(0x30, 0x30, 0x36), 0));
            brush.GradientStops.Add(new GradientStop(lit ? Color.FromRgb(0x30, 0x30, 0x36) : Color.FromRgb(0x26, 0x26, 0x2B), 1));
            brush.Freeze();
            return brush;
        }

        static Button MakeKey(string icon, CornerRadius radius, string label)
        {
            Button key = new Button
            {
                Template = KeyTemplate(radius),
                Background = KeyFill(false),
                Content = Icons.Make(icon, Brushes.White),
                Cursor = Cursors.Hand,
                ToolTip = label,
                FocusVisualStyle = null,
            };
            System.Windows.Automation.AutomationProperties.SetName(key, label);
            return key;
        }

        static Button PillButton(bool primary)
        {
            return new Button
            {
                Template = FlatTemplate(18, Solid(Colors.White, primary ? 0.14 : 0.08)),
                Height = 36,
                Padding = new Thickness(18, 0, 18, 1),
                Margin = new Thickness(5, 14, 5, 0),
                Cursor = Cursors.Hand,
                FontFamily = Text,
                FontSize = 14,
                Visibility = Visibility.Collapsed,
                Background = primary ? Solid(BlueColor) : Solid(Color.FromRgb(0x2A, 0x2A, 0x30)),
                Foreground = Brushes.White,
                BorderBrush = Brushes.Transparent,
                BorderThickness = new Thickness(0),
            };
        }

        static BitmapSource LoadResourceImage(string name)
        {
            try
            {
                Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(name);
                if (stream == null) return null;
                BitmapImage image = new BitmapImage();
                image.BeginInit();
                image.StreamSource = stream;
                image.CacheOption = BitmapCacheOption.OnLoad;
                image.EndInit();
                image.Freeze();
                return image;
            }
            catch
            {
                return null;
            }
        }

        static void OpenWebsite()
        {
            try { Process.Start(new ProcessStartInfo(WebsiteUrl) { UseShellExecute = true }); }
            catch { }
        }

        void SyncEtaDot()
        {
            if (etaDot.ActualWidth > 0 && (double.IsNaN(etaDot.Height) || Math.Abs(etaDot.Height - etaDot.ActualWidth) > 0.5)) etaDot.Height = etaDot.ActualWidth;
        }

        // ---- animation

        void SetHolding(bool value)
        {
            if (holding == value) return;
            holding = value;
            fastKey.Background = KeyFill(value);
        }

        void RenderPlayKey()
        {
            playKey.Content = Icons.Make(playing ? Icons.Pause : Icons.Play, Brushes.White);
            string label = playing ? "Pause" : "Play";
            playKey.ToolTip = label;
            System.Windows.Automation.AutomationProperties.SetName(playKey, label);
        }

        void OnFrame(object sender, EventArgs e)
        {
            double now = frameClock.Elapsed.TotalSeconds;
            double dt = Math.Min(0.064, now - lastFrame);
            lastFrame = now;

            double over = StripOverflow();
            if (over > 0 && (holding || playing))
            {
                // Constant pixel speed whatever the strip's width; the phase
                // runs 0..2 and ping-pongs.
                stripPhase = (stripPhase + dt * (holding ? StripFastSpeed : StripSpeed) / over) % 2;
                LayoutStrip();
            }

            if (Math.Abs(targetFraction - shownFraction) > 0.0005)
            {
                shownFraction += (targetFraction - shownFraction) * (1 - Math.Exp(-dt * 9));
                LayoutBars();
            }
        }

        // The strip is pixel art: draw it at a whole number of device pixels
        // per art pixel (at least enough to cover the screen), never shrunk.
        double StripScale()
        {
            double w = stripCanvas.ActualWidth, h = stripCanvas.ActualHeight;
            double dpi = 1;
            try { dpi = VisualTreeHelper.GetDpi(this).DpiScaleX; } catch { }
            double needed = Math.Max(h / stripSource.PixelHeight, w / stripSource.PixelWidth) * dpi;
            return Math.Max(1, Math.Ceiling(needed - 0.001)) / dpi;
        }

        double StripOverflow()
        {
            if (stripSource == null) return 0;
            double w = stripCanvas.ActualWidth, h = stripCanvas.ActualHeight;
            if (w <= 0 || h <= 0) return 0;
            return Math.Max(0, stripSource.PixelWidth * StripScale() - w);
        }

        void LayoutStrip()
        {
            if (stripSource == null) return;
            double w = stripCanvas.ActualWidth, h = stripCanvas.ActualHeight;
            if (w <= 0 || h <= 0) return;
            double scale = StripScale();
            double dw = stripSource.PixelWidth * scale;
            double dh = stripSource.PixelHeight * scale;
            double tri = 1 - Math.Abs(stripPhase - 1);
            double eased = tri * tri * (3 - 2 * tri);
            stripImage.Width = dw;
            stripImage.Height = dh;
            Canvas.SetLeft(stripImage, Math.Round(-eased * Math.Max(0, dw - w)));
            Canvas.SetTop(stripImage, Math.Round(-(dh - h) / 2));
        }

        // Bars sit every 17px; each widens from a thin line to a full bead as
        // the progress edge passes it, over a soft ~1/9 of the track.
        void LayoutBars()
        {
            double w = barCanvas.ActualWidth, h = barCanvas.ActualHeight;
            if (w <= 0 || h <= 0) return;
            int count = (int)Math.Ceiling((w + 15) / BarStep);
            while (bars.Count < count)
            {
                Rectangle bar = new Rectangle { Fill = barBrush };
                bars.Add(bar);
                barCanvas.Children.Add(bar);
            }
            while (bars.Count > count)
            {
                barCanvas.Children.Remove(bars[bars.Count - 1]);
                bars.RemoveAt(bars.Count - 1);
            }
            double edge = shownFraction * w * (1 + 1.0 / 9) - w / 18;
            for (int i = 0; i < count; i++)
            {
                double x = 2 + i * BarStep;
                double local = Math.Max(0, Math.Min(1, 0.5 + (edge - x) / w * 18));
                double bw = 2.2 + (BarStep - 2.2) * local;
                Rectangle bar = bars[i];
                bar.Width = bw;
                bar.Height = h;
                bar.RadiusX = bar.RadiusY = Math.Min(bw / 2, h / 2);
                Canvas.SetLeft(bar, x - bw / 2);
            }
        }

        // ---- state helpers (call on the UI thread)

        void SetHeadline(string headline, string detail)
        {
            headlineText.Text = headline;
            detailText.Text = detail ?? "";
            detailText.Visibility = string.IsNullOrEmpty(detail) ? Visibility.Collapsed : Visibility.Visible;
        }

        void SetProgress(double fraction)
        {
            if (fraction < 0) fraction = 0;
            if (fraction > 1) fraction = 1;
            targetFraction = fraction;
            if (quiet || !frameClock.IsRunning || fraction < shownFraction)
            {
                shownFraction = fraction;
                LayoutBars();
            }
            int percent = (int)Math.Floor(fraction * 100);
            percentText.Text = percent.ToString();
            stageText.Text = stageOverride ?? StageFor(percent);
        }

        string StageFor(int percent)
        {
            if (percent >= 100) return "done";
            if (uninstallMode) return percent > 0 ? "removing" : "ready";
            if (percent >= 90) return "almost there";
            if (percent >= 60) return "installing";
            if (percent >= 25) return "unpacking";
            return "starting";
        }

        void SetStage(string stage)
        {
            stageOverride = stage;
            stageText.Text = stage ?? StageFor((int)Math.Floor(targetFraction * 100));
        }

        void SetSpeed(string text)
        {
            speedText.Text = string.IsNullOrEmpty(text) ? "—" : text;
        }

        void SetEta(string text)
        {
            etaText.Text = string.IsNullOrEmpty(text) ? "—" : text;
        }

        void SetButtons(string primaryLabel, Action primary, string secondaryLabel, Action secondary)
        {
            primaryAction = primary;
            secondaryAction = secondary;
            primaryButton.Content = primaryLabel;
            primaryButton.Visibility = primaryLabel == null ? Visibility.Collapsed : Visibility.Visible;
            secondaryButton.Content = secondaryLabel;
            secondaryButton.Visibility = secondaryLabel == null ? Visibility.Collapsed : Visibility.Visible;
        }

        void Ui(Action action)
        {
            if (quiet) return;
            Dispatcher.BeginInvoke(action);
        }

        // --quiet: no window, install or remove right away (exit code 0 / 1).
        public int RunQuiet()
        {
            if (uninstallMode) UninstallWorker();
            else InstallWorker();
            return lastError == null ? 0 : 1;
        }

        // --render-preview: the window in each state, saved as PNGs (2x).
        public void RenderPreviews(string directory)
        {
            Directory.CreateDirectory(directory);
            if (uninstallMode)
            {
                ShowUninstallPrompt();
                SavePng(System.IO.Path.Combine(directory, "uninstall.png"));
                return;
            }
            ShowInstalling();
            SetProgress(0.65);
            SetSpeed("48 MB/s");
            SetEta("~4s");
            stripPhase = 0.35;
            SavePng(System.IO.Path.Combine(directory, "installing.png"));
            ShowInstalled();
            SavePng(System.IO.Path.Combine(directory, "done.png"));
        }

        void SavePng(string path)
        {
            FrameworkElement root = (FrameworkElement)Content;
            Content = null;
            for (int pass = 0; pass < 3; pass++)
            {
                root.Measure(new Size(Width, double.PositiveInfinity));
                root.Arrange(new Rect(new Point(0, 0), new Size(Width, root.DesiredSize.Height)));
                root.UpdateLayout();
                SyncEtaDot();
            }
            root.Measure(new Size(Width, double.PositiveInfinity));
            root.Arrange(new Rect(new Point(0, 0), new Size(Width, root.DesiredSize.Height)));
            root.UpdateLayout();
            LayoutStrip();
            LayoutBars();
            root.UpdateLayout();
            RenderTargetBitmap bitmap = new RenderTargetBitmap((int)(Width * 2), (int)Math.Ceiling(root.DesiredSize.Height * 2), 192, 192, PixelFormats.Pbgra32);
            bitmap.Render(root);
            PngBitmapEncoder encoder = new PngBitmapEncoder();
            encoder.Frames.Add(BitmapFrame.Create(bitmap));
            using (FileStream output = File.Create(path)) encoder.Save(output);
            Content = root;
        }

        void ShowInstalling()
        {
            SetHeadline("AirPaste is being installed", "This only takes a moment. You can open AirPaste as soon as it's ready.");
            SetStage(null);
            SetButtons(null, null, null, null);
        }

        void ShowInstalled()
        {
            SetHeadline("AirPaste is installed", "Find it in Start and on your desktop.");
            SetStage(null);
            SetProgress(1);
            SetEta("done");
            SetButtons("Open AirPaste", delegate { LaunchApp(); Close(); }, "Close", delegate { Close(); });
        }

        // ---------------------------------------------------------- install

        void StartInstall()
        {
            SetButtons(null, null, null, null);
            Process running = FindRunningApp();
            if (running != null)
            {
                SetHeadline("AirPaste is open", "Close it so setup can update it.");
                SetStage("waiting");
                SetProgress(0);
                SetSpeed(null);
                SetEta(null);
                SetButtons("Close AirPaste", delegate { CloseRunningAppThenInstall(); }, "Cancel", delegate { Close(); });
                return;
            }

            busy = true;
            ShowInstalling();
            SetProgress(0);
            SetSpeed(null);
            SetEta(null);
            Thread worker = new Thread(InstallWorker) { IsBackground = true };
            worker.Start();
        }

        void CloseRunningAppThenInstall()
        {
            SetButtons(null, null, null, null);
            SetHeadline("Closing AirPaste…", null);
            Thread worker = new Thread(delegate ()
            {
                Process running = FindRunningApp();
                while (running != null)
                {
                    try
                    {
                        running.CloseMainWindow();
                        if (!running.WaitForExit(8000)) running.Kill();
                        running.WaitForExit(4000);
                    }
                    catch { }
                    Thread.Sleep(300);
                    running = FindRunningApp();
                }
                Ui(delegate { StartInstall(); });
            }) { IsBackground = true };
            worker.Start();
        }

        static Process FindRunningApp()
        {
            string target = System.IO.Path.Combine(Product.InstallDir, Product.ExeName);
            foreach (Process process in Process.GetProcessesByName(System.IO.Path.GetFileNameWithoutExtension(Product.ExeName)))
            {
                try
                {
                    if (string.Equals(process.MainModule.FileName, target, StringComparison.OrdinalIgnoreCase)) return process;
                }
                catch { }
            }
            return null;
        }

        void InstallWorker()
        {
            try
            {
                string exePath = Assembly.GetExecutingAssembly().Location;
                long stubLength;
                long zipLength;
                Payload.Locate(exePath, out stubLength, out zipLength);
                if (stubLength < 0) throw new InvalidOperationException("This setup file is incomplete. Download it again.");

                string installDir = Product.InstallDir;
                if (Directory.Exists(installDir)) DeleteDirectoryContents(installDir);
                Directory.CreateDirectory(installDir);

                long totalBytes = 0;
                long doneBytes = 0;
                Stopwatch clock = Stopwatch.StartNew();
                long lastUiTick = 0;

                using (FileStream file = new FileStream(exePath, FileMode.Open, FileAccess.Read, FileShare.Read, 1 << 20))
                using (ZipArchive zip = new ZipArchive(new OffsetStream(file, stubLength, zipLength), ZipArchiveMode.Read))
                {
                    foreach (ZipArchiveEntry entry in zip.Entries) totalBytes += entry.Length;
                    byte[] buffer = new byte[1 << 20];
                    string root = System.IO.Path.GetFullPath(installDir) + System.IO.Path.DirectorySeparatorChar;

                    foreach (ZipArchiveEntry entry in zip.Entries)
                    {
                        string target = System.IO.Path.GetFullPath(System.IO.Path.Combine(installDir, entry.FullName));
                        if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase)) continue;

                        if (entry.FullName.EndsWith("/") || entry.FullName.EndsWith("\\"))
                        {
                            Directory.CreateDirectory(target);
                            continue;
                        }

                        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(target));
                        using (Stream input = entry.Open())
                        using (FileStream output = File.Create(target))
                        {
                            int read;
                            while ((read = input.Read(buffer, 0, buffer.Length)) > 0)
                            {
                                output.Write(buffer, 0, read);
                                doneBytes += read;

                                if (clock.ElapsedMilliseconds - lastUiTick > 50)
                                {
                                    lastUiTick = clock.ElapsedMilliseconds;
                                    double fraction = totalBytes > 0 ? (double)doneBytes / totalBytes : 0;
                                    double seconds = Math.Max(0.001, clock.Elapsed.TotalSeconds);
                                    double speed = doneBytes / seconds;
                                    double left = speed > 0 ? (totalBytes - doneBytes) / speed : 0;
                                    string speedLabel = Math.Round(speed / (1024 * 1024)).ToString() + " MB/s";
                                    string eta = left >= 60 ? "~" + Math.Ceiling(left / 60).ToString() + "m" : "~" + Math.Max(1, Math.Ceiling(left)).ToString() + "s";
                                    Ui(delegate
                                    {
                                        SetProgress(fraction * 0.96);
                                        SetSpeed(speedLabel);
                                        SetEta(eta);
                                    });
                                }
                            }
                        }
                    }

                    // The uninstaller: this exe without its payload.
                    using (FileStream output = File.Create(System.IO.Path.Combine(installDir, Product.UninstallerName)))
                    {
                        file.Position = 0;
                        long remaining = stubLength;
                        while (remaining > 0)
                        {
                            int read = file.Read(buffer, 0, (int)Math.Min(buffer.Length, remaining));
                            if (read <= 0) break;
                            output.Write(buffer, 0, read);
                            remaining -= read;
                        }
                    }
                }

                Ui(delegate { SetStage("shortcuts"); SetProgress(0.98); });
                string appExe = System.IO.Path.Combine(installDir, Product.ExeName);
                CreateShortcut(Product.StartMenuShortcut, appExe, installDir);
                CreateShortcut(Product.DesktopShortcut, appExe, installDir);
                RegisterUninstall(installDir, appExe, totalBytes);
                RefreshShellIcons();

                Ui(delegate
                {
                    busy = false;
                    ShowInstalled();
                });
            }
            catch (Exception error)
            {
                string message = error.Message;
                lastError = message;
                Ui(delegate
                {
                    busy = false;
                    SetHeadline("Setup couldn't finish", message);
                    SetStage("stopped");
                    SetSpeed(null);
                    SetEta(null);
                    SetButtons("Try again", delegate { StartInstall(); }, "Close", delegate { Close(); });
                });
            }
        }

        static void DeleteDirectoryContents(string directory)
        {
            foreach (string path in Directory.GetFiles(directory)) DeleteFileQuietly(path);
            foreach (string path in Directory.GetDirectories(directory)) Directory.Delete(path, true);
        }

        static void DeleteFileQuietly(string path)
        {
            File.SetAttributes(path, FileAttributes.Normal);
            File.Delete(path);
        }

        [DllImport("shell32.dll")]
        static extern void SHChangeNotify(int eventId, uint flags, IntPtr item1, IntPtr item2);

        // Explorer caches icons by file path, so reinstalling over an older
        // build (or one that had Electron's icon) can keep showing the stale
        // icon on shortcuts and in Settings > Apps. This tells it to reload.
        static void RefreshShellIcons()
        {
            const int SHCNE_ASSOCCHANGED = 0x08000000;
            const uint SHCNF_IDLIST = 0x0000;
            try { SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, IntPtr.Zero, IntPtr.Zero); } catch { }
        }

        static void CreateShortcut(string shortcutPath, string targetPath, string workingDirectory)
        {
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(shortcutPath));
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            dynamic shell = Activator.CreateInstance(shellType);
            dynamic link = shell.CreateShortcut(shortcutPath);
            link.TargetPath = targetPath;
            link.WorkingDirectory = workingDirectory;
            link.IconLocation = targetPath + ",0";
            link.Description = Product.Name;
            link.Save();
        }

        void RegisterUninstall(string installDir, string appExe, long totalBytes)
        {
            RemoveOtherUninstallEntries(installDir);

            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(Product.RegistryKey))
            {
                string uninstaller = System.IO.Path.Combine(installDir, Product.UninstallerName);
                key.SetValue("DisplayName", Product.Name);
                key.SetValue("DisplayVersion", version);
                key.SetValue("Publisher", Product.Name);
                key.SetValue("DisplayIcon", appExe + ",0");
                key.SetValue("InstallLocation", installDir);
                key.SetValue("UninstallString", "\"" + uninstaller + "\" --uninstall");
                key.SetValue("QuietUninstallString", "\"" + uninstaller + "\" --uninstall --quiet");
                key.SetValue("EstimatedSize", (int)(totalBytes / 1024), RegistryValueKind.DWord);
                key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }
        }

        // Only removes a shortcut that opens something inside installDir, so an
        // unrelated "AirPaste.lnk" (another install, a user's own) is left alone.
        static void DeleteShortcutIfOurs(string shortcutPath, string installDir)
        {
            try
            {
                if (!File.Exists(shortcutPath)) return;
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                dynamic shell = Activator.CreateInstance(shellType);
                dynamic link = shell.CreateShortcut(shortcutPath);
                string target = link.TargetPath as string;
                string folder = System.IO.Path.GetFullPath(installDir).TrimEnd('\\') + "\\";
                if (target != null && target.StartsWith(folder, StringComparison.OrdinalIgnoreCase)) File.Delete(shortcutPath);
            }
            catch { }
        }

        // An older installer (electron-builder's NSIS) used this same folder:
        // its files are gone now, so drop its entries from Settings > Apps.
        static void RemoveOtherUninstallEntries(string installDir)
        {
            string folder = System.IO.Path.GetFullPath(installDir).TrimEnd('\\') + "\\";
            using (RegistryKey root = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall", true))
            {
                if (root == null) return;
                foreach (string name in root.GetSubKeyNames())
                {
                    if (string.Equals(name, "AirPaste", StringComparison.OrdinalIgnoreCase)) continue;
                    using (RegistryKey entry = root.OpenSubKey(name))
                    {
                        string uninstall = entry == null ? null : entry.GetValue("UninstallString") as string;
                        if (uninstall == null || uninstall.IndexOf(folder, StringComparison.OrdinalIgnoreCase) < 0) continue;
                    }
                    try { root.DeleteSubKeyTree(name, false); } catch { }
                }
            }
        }

        static void LaunchApp()
        {
            try
            {
                Process.Start(new ProcessStartInfo(System.IO.Path.Combine(Product.InstallDir, Product.ExeName))
                {
                    WorkingDirectory = Product.InstallDir,
                    UseShellExecute = true,
                });
            }
            catch { }
        }

        // -------------------------------------------------------- uninstall

        void ShowUninstallPrompt()
        {
            SetHeadline("Remove AirPaste from this PC?", "Your canvases and files are kept.");
            SetStage(null);
            SetProgress(0);
            SetSpeed(null);
            SetEta(null);
            SetButtons("Uninstall", delegate { StartUninstall(); }, "Cancel", delegate { Close(); });
        }

        void StartUninstall()
        {
            SetButtons(null, null, null, null);
            if (FindRunningApp() != null)
            {
                SetHeadline("AirPaste is open", "Close it first, then try again.");
                SetButtons("Try again", delegate { StartUninstall(); }, "Cancel", delegate { Close(); });
                return;
            }

            busy = true;
            SetHeadline("Removing AirPaste…", "Your canvases and files are kept.");
            Thread worker = new Thread(UninstallWorker) { IsBackground = true };
            worker.Start();
        }

        void UninstallWorker()
        {
            try
            {
                string dir = uninstallDir;
                string[] files = Directory.Exists(dir) ? Directory.GetFiles(dir, "*", SearchOption.AllDirectories) : new string[0];
                for (int i = 0; i < files.Length; i++)
                {
                    try { DeleteFileQuietly(files[i]); } catch { }
                    if (i % 25 == 0)
                    {
                        double fraction = (double)(i + 1) / Math.Max(1, files.Length);
                        string removed = (i + 1).ToString();
                        Ui(delegate { SetProgress(fraction * 0.95); SetSpeed(removed); });
                    }
                }
                try { if (Directory.Exists(dir)) Directory.Delete(dir, true); } catch { }
                DeleteShortcutIfOurs(Product.StartMenuShortcut, dir);
                DeleteShortcutIfOurs(Product.DesktopShortcut, dir);
                try { Registry.CurrentUser.DeleteSubKeyTree(Product.RegistryKey, false); } catch { }
                RefreshShellIcons();

                Ui(delegate
                {
                    busy = false;
                    SetHeadline("AirPaste was removed", "Your canvases are still where you saved them.");
                    SetProgress(1);
                    SetSpeed(files.Length.ToString());
                    SetEta("done");
                    SetButtons("Close", delegate { Close(); }, null, null);
                });
            }
            catch (Exception error)
            {
                string message = error.Message;
                Ui(delegate
                {
                    busy = false;
                    SetHeadline("Couldn't remove everything", message);
                    SetStage("stopped");
                    SetButtons("Close", delegate { Close(); }, null, null);
                });
            }
        }
    }

    // ------------------------------------------------------------ entry

    static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            string self = Assembly.GetExecutingAssembly().Location;
            bool uninstall = Array.IndexOf(args, "--uninstall") >= 0;
            bool quiet = Array.IndexOf(args, "--quiet") >= 0;
            int previewIndex = Array.IndexOf(args, "--render-preview");
            int shortcutIndex = Array.IndexOf(args, "--shortcut-dir");
            if (shortcutIndex >= 0 && shortcutIndex + 1 < args.Length) Product.ShortcutDirOverride = args[shortcutIndex + 1];
            int installDirIndex = Array.IndexOf(args, "--dir");
            if (!uninstall && installDirIndex >= 0 && installDirIndex + 1 < args.Length) Product.InstallDirOverride = args[installDirIndex + 1];
            string version = ReadVersion();

            if (uninstall)
            {
                string installDir = Product.InstallDir;
                int dirIndex = Array.IndexOf(args, "--dir");
                if (dirIndex >= 0 && dirIndex + 1 < args.Length) installDir = args[dirIndex + 1];

                // The uninstaller lives inside the folder it deletes: run a
                // copy from %TEMP% instead, then let that copy remove itself.
                string selfDir = System.IO.Path.GetDirectoryName(self);
                if (string.Equals(System.IO.Path.GetFullPath(selfDir).TrimEnd('\\'), System.IO.Path.GetFullPath(installDir).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase))
                {
                    string copy = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "AirPaste-uninstall-" + Guid.NewGuid().ToString("N") + ".exe");
                    File.Copy(self, copy, true);
                    string forwarded = "--uninstall --dir \"" + installDir + "\" --wait-pid " + Process.GetCurrentProcess().Id.ToString();
                    if (quiet) forwarded += " --quiet";
                    if (Product.ShortcutDirOverride != null) forwarded += " --shortcut-dir \"" + Product.ShortcutDirOverride + "\"";
                    Process.Start(new ProcessStartInfo(copy, forwarded) { UseShellExecute = false });
                    return 0;
                }

                // Started by the uninstaller in the install folder: let it
                // exit first, or its own exe would stay locked.
                int waitIndex = Array.IndexOf(args, "--wait-pid");
                int waitPid;
                if (waitIndex >= 0 && waitIndex + 1 < args.Length && int.TryParse(args[waitIndex + 1], out waitPid))
                {
                    try { Process.GetProcessById(waitPid).WaitForExit(15000); } catch { }
                }

                if (quiet)
                {
                    int code = new SetupWindow(true, installDir, version, true).RunQuiet();
                    ScheduleSelfDelete(self);
                    return code;
                }

                Application uninstallApp = new Application();
                uninstallApp.Exit += delegate { ScheduleSelfDelete(self); };
                return uninstallApp.Run(new SetupWindow(true, installDir, version, false));
            }

            if (previewIndex >= 0 && previewIndex + 1 < args.Length)
            {
                new SetupWindow(false, null, version, false).RenderPreviews(args[previewIndex + 1]);
                new SetupWindow(true, Product.InstallDir, version, false).RenderPreviews(args[previewIndex + 1]);
                return 0;
            }

            if (quiet) return new SetupWindow(false, null, version, true).RunQuiet();

            Application app = new Application();
            return app.Run(new SetupWindow(false, null, version, false));
        }

        static string ReadVersion()
        {
            try
            {
                Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("version.txt");
                if (stream == null) return "";
                using (StreamReader reader = new StreamReader(stream)) return reader.ReadToEnd().Trim();
            }
            catch
            {
                return "";
            }
        }

        static void ScheduleSelfDelete(string path)
        {
            if (!path.StartsWith(System.IO.Path.GetTempPath(), StringComparison.OrdinalIgnoreCase)) return;
            try
            {
                Process.Start(new ProcessStartInfo("cmd.exe", "/c ping 127.0.0.1 -n 3 > nul & del \"" + path + "\"")
                {
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden,
                });
            }
            catch { }
        }
    }
}
