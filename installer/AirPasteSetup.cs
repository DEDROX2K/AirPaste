// AirPaste Setup: a small custom Windows installer with a minimal,
// Apple-style window (replaces electron-builder's NSIS dialog).
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
    // Apple-style and minimal: one white card with the app icon, the name and
    // version, a status line, a thin blue progress bar and macOS-style
    // buttons. Nothing moves except the progress bar.

    static class Icons
    {
        public const string Close = "M7 19H5V17H7V19ZM19 19H17V17H19V19ZM9 15V17H7V15H9ZM17 17H15V15H17V17ZM11 15H9V13H11V15ZM15 15H13V13H15V15ZM13 13H11V11H13V13ZM11 11H9V9H11V11ZM15 11H13V9H15V11ZM9 9H7V7H9V9ZM17 9H15V7H17V9ZM7 7H5V5H7V7ZM19 7H17V5H19V7Z";

        public static UIElement Make(string data, Brush fill, double size)
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
                RenderTransformOrigin = new Point(0.5, 0.5),
                RenderTransform = new ScaleTransform(size / 24, size / 24),
            };
            RenderOptions.SetEdgeMode(path, EdgeMode.Aliased);
            return path;
        }
    }

    class SetupWindow : Window
    {
        static readonly Color CardColor = Color.FromRgb(0xFF, 0xFF, 0xFF);
        static readonly Color EdgeColor = Color.FromRgb(0xE3, 0xE3, 0xE8);
        static readonly Color InkColor = Color.FromRgb(0x1D, 0x1D, 0x1F);
        static readonly Color GreyColor = Color.FromRgb(0x86, 0x86, 0x8B);
        static readonly Color TrackColor = Color.FromRgb(0xE8, 0xE8, 0xED);
        static readonly Color BlueColor = Color.FromRgb(0x00, 0x71, 0xE3);
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

        StackPanel progressPanel;
        Border track;
        Border fill;
        TextBlock stageText;
        TextBlock percentText;
        string speedLabel;
        string etaLabel;
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
            Width = 480;
            SizeToContent = SizeToContent.Height;
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            ResizeMode = ResizeMode.NoResize;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            UseLayoutRounding = true;
            TextOptions.SetTextFormattingMode(this, TextFormattingMode.Display);

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

        UIElement BuildLayout()
        {
            StackPanel column = new StackPanel { Margin = new Thickness(36, 34, 36, 28) };

            BitmapSource iconSource = LoadResourceImage("icon.png");
            if (iconSource != null)
            {
                Image icon = new Image
                {
                    Source = iconSource,
                    Width = 76,
                    Height = 76,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    Effect = new DropShadowEffect { BlurRadius = 18, ShadowDepth = 4, Direction = 270, Opacity = 0.16, Color = Colors.Black },
                };
                RenderOptions.SetBitmapScalingMode(icon, BitmapScalingMode.HighQuality);
                column.Children.Add(icon);
            }

            column.Children.Add(new TextBlock
            {
                Text = Product.Name,
                FontFamily = Display,
                FontSize = 24,
                FontWeight = FontWeights.SemiBold,
                Foreground = Solid(InkColor),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 16, 0, 0),
            });
            column.Children.Add(new TextBlock
            {
                Text = string.IsNullOrEmpty(version) ? "for Windows" : "Version " + version,
                FontFamily = Text,
                FontSize = 12.5,
                Foreground = Solid(GreyColor),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 2, 0, 0),
            });

            headlineText = new TextBlock
            {
                FontFamily = Text,
                FontSize = 14,
                FontWeight = FontWeights.Medium,
                Foreground = Solid(InkColor),
                TextAlignment = TextAlignment.Center,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 26, 0, 0),
            };
            detailText = new TextBlock
            {
                FontFamily = Text,
                FontSize = 12.5,
                Foreground = Solid(GreyColor),
                TextAlignment = TextAlignment.Center,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 4, 0, 0),
            };
            column.Children.Add(headlineText);
            column.Children.Add(detailText);

            // Progress: a thin rounded bar and one quiet line under it.
            progressPanel = new StackPanel { Margin = new Thickness(0, 22, 0, 0), Visibility = Visibility.Collapsed };
            fill = new Border { Background = Solid(BlueColor), CornerRadius = new CornerRadius(3), HorizontalAlignment = HorizontalAlignment.Left, Width = 0 };
            track = new Border { Background = Solid(TrackColor), CornerRadius = new CornerRadius(3), Height = 6, Child = fill };
            track.SizeChanged += delegate { LayoutFill(); };
            progressPanel.Children.Add(track);
            Grid status = new Grid { Margin = new Thickness(0, 8, 0, 0) };
            stageText = new TextBlock { FontFamily = Text, FontSize = 11.5, Foreground = Solid(GreyColor), HorizontalAlignment = HorizontalAlignment.Left };
            percentText = new TextBlock { FontFamily = Text, FontSize = 11.5, Foreground = Solid(GreyColor), HorizontalAlignment = HorizontalAlignment.Right };
            status.Children.Add(stageText);
            status.Children.Add(percentText);
            progressPanel.Children.Add(status);
            column.Children.Add(progressPanel);

            StackPanel buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 26, 0, 0) };
            secondaryButton = MacButton(false);
            secondaryButton.Click += delegate { if (secondaryAction != null) secondaryAction(); };
            primaryButton = MacButton(true);
            primaryButton.Click += delegate { if (primaryAction != null) primaryAction(); };
            buttons.Children.Add(secondaryButton);
            buttons.Children.Add(primaryButton);
            column.Children.Add(buttons);

            Button close = new Button
            {
                Content = Icons.Make(Icons.Close, Solid(GreyColor), 14),
                Width = 28,
                Height = 28,
                Cursor = Cursors.Hand,
                ToolTip = "Close",
                Template = ButtonTemplate(14, Brushes.Transparent, Solid(Colors.Black, 0.06)),
                Background = Brushes.Transparent,
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(0, 12, 12, 0),
                FocusVisualStyle = null,
            };
            System.Windows.Automation.AutomationProperties.SetName(close, "Close");
            close.Click += delegate { if (!busy) Close(); };

            Grid card = new Grid();
            card.Children.Add(column);
            card.Children.Add(close);

            return new Border
            {
                Background = Solid(CardColor),
                BorderBrush = Solid(EdgeColor),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(18),
                Margin = new Thickness(28),
                Child = card,
                Effect = new DropShadowEffect { BlurRadius = 44, ShadowDepth = 12, Direction = 270, Opacity = 0.16, Color = Colors.Black },
            };
        }

        // A plain rounded button with a hover / press overlay.
        static ControlTemplate ButtonTemplate(double radius, Brush border, Brush hover)
        {
            ControlTemplate template = new ControlTemplate(typeof(Button));
            FrameworkElementFactory root = new FrameworkElementFactory(typeof(Grid));
            FrameworkElementFactory body = new FrameworkElementFactory(typeof(Border));
            body.SetValue(Border.BackgroundProperty, new TemplateBindingExtension(Control.BackgroundProperty));
            body.SetValue(Border.BorderBrushProperty, border);
            body.SetValue(Border.BorderThicknessProperty, new Thickness(border == Brushes.Transparent ? 0 : 1));
            body.SetValue(Border.CornerRadiusProperty, new CornerRadius(radius));
            root.AppendChild(body);
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
            FrameworkElementFactory focus = new FrameworkElementFactory(typeof(Border));
            focus.Name = "focus";
            focus.SetValue(Border.BorderBrushProperty, Solid(BlueColor, 0.5));
            focus.SetValue(Border.BorderThicknessProperty, new Thickness(3));
            focus.SetValue(Border.CornerRadiusProperty, new CornerRadius(radius + 3));
            focus.SetValue(FrameworkElement.MarginProperty, new Thickness(-3));
            focus.SetValue(UIElement.VisibilityProperty, Visibility.Hidden);
            root.AppendChild(focus);
            template.VisualTree = root;
            Trigger over = new Trigger { Property = UIElement.IsMouseOverProperty, Value = true };
            over.Setters.Add(new Setter(UIElement.OpacityProperty, 1.0, "overlay"));
            template.Triggers.Add(over);
            Trigger pressed = new Trigger { Property = ButtonBase.IsPressedProperty, Value = true };
            pressed.Setters.Add(new Setter(UIElement.OpacityProperty, 0.6, "overlay"));
            template.Triggers.Add(pressed);
            Trigger keyboard = new Trigger { Property = UIElement.IsKeyboardFocusedProperty, Value = true };
            keyboard.Setters.Add(new Setter(UIElement.VisibilityProperty, Visibility.Visible, "focus"));
            template.Triggers.Add(keyboard);
            return template;
        }

        static Button MacButton(bool primary)
        {
            return new Button
            {
                Template = primary
                    ? ButtonTemplate(8, Brushes.Transparent, Solid(Colors.Black, 0.12))
                    : ButtonTemplate(8, Solid(Color.FromRgb(0xD2, 0xD2, 0xD7)), Solid(Colors.Black, 0.04)),
                Height = 32,
                MinWidth = 96,
                Padding = new Thickness(16, 0, 16, 1),
                Margin = new Thickness(10, 0, 0, 0),
                Cursor = Cursors.Hand,
                FontFamily = Text,
                FontSize = 13,
                FontWeight = primary ? FontWeights.SemiBold : FontWeights.Normal,
                Visibility = Visibility.Collapsed,
                Background = primary ? Solid(BlueColor) : Solid(Colors.White),
                Foreground = primary ? Brushes.White : Solid(InkColor),
                FocusVisualStyle = null,
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
                image.DecodePixelWidth = 256;
                image.EndInit();
                image.Freeze();
                return image;
            }
            catch
            {
                return null;
            }
        }

        // ---- animation: only the bar eases towards its target

        void OnFrame(object sender, EventArgs e)
        {
            double now = frameClock.Elapsed.TotalSeconds;
            double dt = Math.Min(0.064, now - lastFrame);
            lastFrame = now;
            if (Math.Abs(targetFraction - shownFraction) > 0.0005)
            {
                shownFraction += (targetFraction - shownFraction) * (1 - Math.Exp(-dt * 9));
                LayoutFill();
            }
        }

        void LayoutFill()
        {
            double w = track.ActualWidth;
            if (w <= 0) return;
            fill.Width = Math.Max(0, Math.Min(w, w * shownFraction));
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
                LayoutFill();
            }
            progressPanel.Visibility = busy || fraction > 0 ? Visibility.Visible : Visibility.Collapsed;
            RenderStatus();
        }

        string StageFor(int percent)
        {
            if (percent >= 100) return "Done";
            if (uninstallMode) return percent > 0 ? "Removing…" : "Ready";
            if (percent >= 90) return "Almost there…";
            if (percent >= 25) return "Installing…";
            return "Preparing…";
        }

        void SetStage(string stage)
        {
            stageOverride = stage;
            RenderStatus();
        }

        void SetSpeed(string text)
        {
            speedLabel = text;
            RenderStatus();
        }

        void SetEta(string text)
        {
            etaLabel = text;
            RenderStatus();
        }

        // "Installing…" on the left; "64%  ·  ~4s left" on the right.
        void RenderStatus()
        {
            int percent = (int)Math.Floor(targetFraction * 100);
            string stage = stageOverride;
            if (stage == "waiting") stage = "Waiting…";
            else if (stage == "shortcuts") stage = "Adding shortcuts…";
            else if (stage == "stopped") stage = "Stopped";
            stageText.Text = stage ?? StageFor(percent);
            string right = percent + "%";
            if (!uninstallMode && percent < 100 && !string.IsNullOrEmpty(etaLabel) && etaLabel != "done") right += "  ·  " + etaLabel + " left";
            percentText.Text = right;
        }

        void SetButtons(string primaryLabel, Action primary, string secondaryLabel, Action secondary)
        {
            primaryAction = primary;
            secondaryAction = secondary;
            primaryButton.Content = primaryLabel;
            primaryButton.Visibility = primaryLabel == null ? Visibility.Collapsed : Visibility.Visible;
            secondaryButton.Content = secondaryLabel;
            secondaryButton.Visibility = secondaryLabel == null ? Visibility.Collapsed : Visibility.Visible;
            if (primaryLabel != null) primaryButton.IsDefault = true;
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
            busy = true;
            ShowInstalling();
            SetProgress(0.64);
            SetSpeed("48 MB/s");
            SetEta("~4s");
            SavePng(System.IO.Path.Combine(directory, "installing.png"));
            busy = false;
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
                LayoutFill();
            }
            RenderTargetBitmap bitmap = new RenderTargetBitmap((int)(Width * 2), (int)Math.Ceiling(root.DesiredSize.Height * 2), 192, 192, PixelFormats.Pbgra32);
            bitmap.Render(root);
            PngBitmapEncoder encoder = new PngBitmapEncoder();
            encoder.Frames.Add(BitmapFrame.Create(bitmap));
            using (FileStream output = File.Create(path)) encoder.Save(output);
            Content = root;
        }

        void ShowInstalling()
        {
            SetHeadline("Installing AirPaste", "This only takes a moment.");
            SetStage(null);
            SetButtons(null, null, null, null);
        }

        void ShowInstalled()
        {
            SetHeadline("AirPaste is ready", "You'll find it in Start and on your desktop.");
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
