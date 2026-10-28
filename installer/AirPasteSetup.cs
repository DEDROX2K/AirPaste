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

    class SetupWindow : Window
    {
        const int SegmentCount = 32;
        static readonly Color Ink = Color.FromRgb(0x1E, 0x1E, 0x1E);
        static readonly Color Muted = Color.FromRgb(0x55, 0x55, 0x58);
        static readonly Color Filled = Color.FromRgb(0x3B, 0x3B, 0x3D);
        static readonly Color Empty = Color.FromRgb(0xD3, 0xD3, 0xD3);
        static readonly FontFamily Display = new FontFamily("Segoe UI Variable Display, Segoe UI");
        static readonly FontFamily Text = new FontFamily("Segoe UI Variable Text, Segoe UI");

        readonly bool uninstallMode;
        readonly bool quiet;
        readonly string uninstallDir;
        readonly string version;
        readonly Rectangle[] segments = new Rectangle[SegmentCount];
        TextBlock statusText;
        TextBlock percentText;
        TextBlock chipText;
        Border chip;
        TextBlock noteText;
        Button primaryButton;
        Button secondaryButton;
        Action primaryAction;
        Action secondaryAction;
        bool busy;
        string lastError;

        public SetupWindow(bool uninstallMode, string uninstallDir, string version, bool quiet)
        {
            this.uninstallMode = uninstallMode;
            this.quiet = quiet;
            this.uninstallDir = uninstallDir;
            this.version = version;

            Title = uninstallMode ? "Uninstall AirPaste" : "AirPaste Setup";
            Width = 640;
            SizeToContent = SizeToContent.Height;
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            ResizeMode = ResizeMode.NoResize;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            UseLayoutRounding = true;
            TextOptions.SetTextFormattingMode(this, TextFormattingMode.Display);

            Content = BuildCard();
            MouseLeftButtonDown += delegate (object sender, MouseButtonEventArgs e)
            {
                if (e.ButtonState == MouseButtonState.Pressed) DragMove();
            };
            Closing += delegate (object sender, System.ComponentModel.CancelEventArgs e)
            {
                if (busy) e.Cancel = true;
            };

            if (quiet) return;
            if (uninstallMode) ShowUninstallPrompt();
            else Loaded += delegate { StartInstall(); };
            Loaded += delegate
            {
                Topmost = true;
                Activate();
                Topmost = false;
            };
        }

        UIElement BuildCard()
        {
            StackPanel body = new StackPanel();

            // Top row: tags, close.
            DockPanel top = new DockPanel { LastChildFill = false };
            StackPanel tags = new StackPanel { Orientation = Orientation.Horizontal };
            tags.Children.Add(MakeTag("v" + version));
            tags.Children.Add(MakeTag("Windows"));
            tags.Children.Add(MakeTag(uninstallMode ? "uninstall" : "setup"));
            DockPanel.SetDock(tags, Dock.Left);
            top.Children.Add(tags);
            Button close = new Button
            {
                Content = new TextBlock { Text = "✕", FontSize = 13, Foreground = new SolidColorBrush(Muted) },
                Width = 28,
                Height = 28,
                Cursor = Cursors.Hand,
                ToolTip = "Close",
                Template = FlatTemplate(14),
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0),
            };
            close.Click += delegate { if (!busy) Close(); };
            DockPanel.SetDock(close, Dock.Right);
            top.Children.Add(close);
            body.Children.Add(top);

            // Title: logo + name.
            StackPanel title = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 14, 0, 0) };
            Image logo = new Image { Width = 34, Height = 34, Margin = new Thickness(0, 0, 12, 0), VerticalAlignment = VerticalAlignment.Center };
            logo.Source = LoadLogo();
            RenderOptions.SetBitmapScalingMode(logo, BitmapScalingMode.HighQuality);
            title.Children.Add(logo);
            title.Children.Add(new TextBlock
            {
                Text = Product.Name,
                FontFamily = Display,
                FontSize = 30,
                Foreground = new SolidColorBrush(Ink),
                VerticalAlignment = VerticalAlignment.Center,
            });
            body.Children.Add(title);

            body.Children.Add(new Rectangle { Height = 1, Fill = new SolidColorBrush(Ink), Margin = new Thickness(0, 14, 0, 18) });

            statusText = new TextBlock { FontFamily = Text, FontSize = 15, Foreground = new SolidColorBrush(Color.FromRgb(0x33, 0x33, 0x36)), TextWrapping = TextWrapping.Wrap };
            body.Children.Add(statusText);

            // Percentage row: big number, chip, note, buttons on the right.
            DockPanel row = new DockPanel { Margin = new Thickness(0, 6, 0, 18), LastChildFill = true };
            StackPanel buttons = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
            secondaryButton = PillButton(false);
            secondaryButton.Click += delegate { if (secondaryAction != null) secondaryAction(); };
            primaryButton = PillButton(true);
            primaryButton.Click += delegate { if (primaryAction != null) primaryAction(); };
            buttons.Children.Add(secondaryButton);
            buttons.Children.Add(primaryButton);
            DockPanel.SetDock(buttons, Dock.Right);
            row.Children.Add(buttons);

            StackPanel left = new StackPanel { Orientation = Orientation.Horizontal };
            percentText = new TextBlock { FontFamily = Display, FontSize = 52, FontWeight = FontWeights.Normal, Foreground = new SolidColorBrush(Ink), Text = "0%", MinWidth = 120 };
            left.Children.Add(percentText);
            chipText = new TextBlock { FontFamily = Text, FontSize = 14, Foreground = new SolidColorBrush(Ink) };
            chip = new Border
            {
                BorderBrush = new SolidColorBrush(Muted),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(2),
                Padding = new Thickness(10, 3, 10, 4),
                Margin = new Thickness(16, 0, 12, 0),
                VerticalAlignment = VerticalAlignment.Center,
                Child = chipText,
            };
            left.Children.Add(chip);
            noteText = new TextBlock { FontFamily = Text, FontSize = 14, Foreground = new SolidColorBrush(Muted), VerticalAlignment = VerticalAlignment.Center };
            left.Children.Add(noteText);
            row.Children.Add(left);
            body.Children.Add(row);

            // The segmented bar.
            UniformGrid bar = new UniformGrid { Rows = 1, Columns = SegmentCount, Height = 64 };
            for (int i = 0; i < SegmentCount; i++)
            {
                segments[i] = new Rectangle { Fill = new SolidColorBrush(Empty), Margin = new Thickness(i == 0 ? 0 : 2, 0, i == SegmentCount - 1 ? 0 : 2, 0), RadiusX = 1, RadiusY = 1 };
                bar.Children.Add(segments[i]);
            }
            body.Children.Add(bar);

            Border card = new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(0xF2, 0xF2, 0xF2)),
                CornerRadius = new CornerRadius(10),
                Padding = new Thickness(22, 16, 22, 22),
                Margin = new Thickness(24),
                Child = body,
                Effect = new DropShadowEffect { BlurRadius = 30, ShadowDepth = 6, Direction = 270, Opacity = 0.28, Color = Colors.Black },
            };
            return card;
        }

        static ControlTemplate FlatTemplate()
        {
            return FlatTemplate(4);
        }

        static ControlTemplate FlatTemplate(double radius)
        {
            ControlTemplate template = new ControlTemplate(typeof(Button));
            FrameworkElementFactory border = new FrameworkElementFactory(typeof(Border));
            border.SetValue(Border.BackgroundProperty, new TemplateBindingExtension(Control.BackgroundProperty));
            border.SetValue(Border.BorderBrushProperty, new TemplateBindingExtension(Control.BorderBrushProperty));
            border.SetValue(Border.BorderThicknessProperty, new TemplateBindingExtension(Control.BorderThicknessProperty));
            border.SetValue(Border.CornerRadiusProperty, new CornerRadius(radius));
            border.SetValue(Border.PaddingProperty, new TemplateBindingExtension(Control.PaddingProperty));
            FrameworkElementFactory presenter = new FrameworkElementFactory(typeof(ContentPresenter));
            presenter.SetValue(ContentPresenter.HorizontalAlignmentProperty, HorizontalAlignment.Center);
            presenter.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);
            border.AppendChild(presenter);
            template.VisualTree = border;
            return template;
        }

        static Border MakeTag(string text)
        {
            return new Border
            {
                BorderBrush = new SolidColorBrush(Color.FromRgb(0x55, 0x55, 0x58)),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(2),
                Padding = new Thickness(8, 2, 8, 3),
                Margin = new Thickness(0, 0, 6, 0),
                Child = new TextBlock { Text = text, FontFamily = Text, FontSize = 12, Foreground = new SolidColorBrush(Ink) },
            };
        }

        static Button PillButton(bool primary)
        {
            Button button = new Button
            {
                Template = FlatTemplate(),
                Padding = new Thickness(14, 6, 14, 7),
                Margin = new Thickness(8, 0, 0, 0),
                Cursor = Cursors.Hand,
                FontFamily = Text,
                FontSize = 14,
                Visibility = Visibility.Collapsed,
                Background = primary ? new SolidColorBrush(Color.FromRgb(0x2A, 0x2A, 0x2C)) : Brushes.Transparent,
                Foreground = primary ? Brushes.White : new SolidColorBrush(Ink),
                BorderBrush = primary ? Brushes.Transparent : new SolidColorBrush(Color.FromRgb(0x9A, 0x9A, 0x9D)),
                BorderThickness = new Thickness(1),
            };
            return button;
        }

        static ImageSource LoadLogo()
        {
            try
            {
                Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("logo.png");
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

        // ---- state helpers (call on the UI thread)

        void SetProgress(double fraction)
        {
            if (fraction < 0) fraction = 0;
            if (fraction > 1) fraction = 1;
            percentText.Text = ((int)Math.Floor(fraction * 100)).ToString() + "%";
            int filled = (int)Math.Round(fraction * SegmentCount);
            for (int i = 0; i < SegmentCount; i++)
            {
                ((SolidColorBrush)segments[i].Fill).Color = i < filled ? Filled : Empty;
            }
        }

        void SetChip(string text)
        {
            chipText.Text = text;
            chip.Visibility = string.IsNullOrEmpty(text) ? Visibility.Collapsed : Visibility.Visible;
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

        // --render-preview: the card in each state, saved as PNGs (2x).
        public void RenderPreviews(string directory)
        {
            Directory.CreateDirectory(directory);
            statusText.Text = uninstallMode ? "Remove AirPaste from this PC? Your canvases and files are kept." : "Installing AirPaste on this PC.";
            if (uninstallMode)
            {
                SetProgress(0);
                SetChip(null);
                SetButtons("Uninstall", null, "Cancel", null);
                SavePng(System.IO.Path.Combine(directory, "uninstall.png"));
                return;
            }
            SetProgress(0.65);
            SetChip("↗ 48 MB/s");
            noteText.Text = "about 4 seconds left";
            SavePng(System.IO.Path.Combine(directory, "installing.png"));
            SetProgress(1);
            statusText.Text = "AirPaste is installed. Find it in Start and on your desktop.";
            SetChip("✓ done");
            noteText.Text = "";
            SetButtons("Open AirPaste", null, "Close", null);
            SavePng(System.IO.Path.Combine(directory, "done.png"));
        }

        void SavePng(string path)
        {
            FrameworkElement root = (FrameworkElement)Content;
            Content = null;
            root.Measure(new Size(Width, double.PositiveInfinity));
            root.Arrange(new Rect(new Point(0, 0), new Size(Width, root.DesiredSize.Height)));
            root.UpdateLayout();
            RenderTargetBitmap bitmap = new RenderTargetBitmap((int)(Width * 2), (int)(root.ActualHeight * 2), 192, 192, PixelFormats.Pbgra32);
            bitmap.Render(root);
            PngBitmapEncoder encoder = new PngBitmapEncoder();
            encoder.Frames.Add(BitmapFrame.Create(bitmap));
            using (FileStream output = File.Create(path)) encoder.Save(output);
            Content = root;
        }

        // ---------------------------------------------------------- install

        void StartInstall()
        {
            SetButtons(null, null, null, null);
            Process running = FindRunningApp();
            if (running != null)
            {
                statusText.Text = "AirPaste is open. Close it so setup can update it.";
                SetProgress(0);
                SetChip(null);
                noteText.Text = "";
                SetButtons("Close AirPaste", delegate { CloseRunningAppThenInstall(); }, "Cancel", delegate { Close(); });
                return;
            }

            busy = true;
            statusText.Text = "Installing AirPaste on this PC.";
            SetChip("↗ starting");
            noteText.Text = "";
            Thread worker = new Thread(InstallWorker) { IsBackground = true };
            worker.Start();
        }

        void CloseRunningAppThenInstall()
        {
            SetButtons(null, null, null, null);
            statusText.Text = "Closing AirPaste…";
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
                                    string chipLabel = "↗ " + Math.Round(speed / (1024 * 1024)).ToString() + " MB/s";
                                    string note = left >= 1.5 ? "about " + Math.Ceiling(left).ToString() + " seconds left" : "almost there";
                                    Ui(delegate
                                    {
                                        SetProgress(fraction * 0.96);
                                        SetChip(chipLabel);
                                        noteText.Text = note;
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

                Ui(delegate { statusText.Text = "Adding shortcuts…"; SetProgress(0.98); });
                string appExe = System.IO.Path.Combine(installDir, Product.ExeName);
                CreateShortcut(Product.StartMenuShortcut, appExe, installDir);
                CreateShortcut(Product.DesktopShortcut, appExe, installDir);
                RegisterUninstall(installDir, appExe, totalBytes);

                Ui(delegate
                {
                    busy = false;
                    SetProgress(1);
                    statusText.Text = "AirPaste is installed. Find it in Start and on your desktop.";
                    SetChip("✓ done");
                    noteText.Text = "";
                    SetButtons("Open AirPaste", delegate { LaunchApp(); Close(); }, "Close", delegate { Close(); });
                });
            }
            catch (Exception error)
            {
                string message = error.Message;
                lastError = message;
                Ui(delegate
                {
                    busy = false;
                    statusText.Text = "Setup couldn't finish: " + message;
                    SetChip(null);
                    noteText.Text = "";
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
            statusText.Text = "Remove AirPaste from this PC? Your canvases and files are kept.";
            SetProgress(0);
            SetChip(null);
            noteText.Text = "";
            SetButtons("Uninstall", delegate { StartUninstall(); }, "Cancel", delegate { Close(); });
        }

        void StartUninstall()
        {
            SetButtons(null, null, null, null);
            if (FindRunningApp() != null)
            {
                statusText.Text = "AirPaste is open. Close it first, then try again.";
                SetButtons("Try again", delegate { StartUninstall(); }, "Cancel", delegate { Close(); });
                return;
            }

            busy = true;
            statusText.Text = "Removing AirPaste…";
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
                        Ui(delegate { SetProgress(fraction * 0.95); });
                    }
                }
                try { if (Directory.Exists(dir)) Directory.Delete(dir, true); } catch { }
                DeleteShortcutIfOurs(Product.StartMenuShortcut, dir);
                DeleteShortcutIfOurs(Product.DesktopShortcut, dir);
                try { Registry.CurrentUser.DeleteSubKeyTree(Product.RegistryKey, false); } catch { }

                Ui(delegate
                {
                    busy = false;
                    SetProgress(1);
                    statusText.Text = "AirPaste was removed. Your canvases are still where you saved them.";
                    SetChip("✓ done");
                    SetButtons("Close", delegate { Close(); }, null, null);
                });
            }
            catch (Exception error)
            {
                string message = error.Message;
                Ui(delegate
                {
                    busy = false;
                    statusText.Text = "Couldn't remove everything: " + message;
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
