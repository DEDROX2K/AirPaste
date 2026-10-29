// Lets any part of the app reopen the launch splash (e.g. clicking the home
// logo while already on Home) without threading state through App.jsx.
export const OPEN_LAUNCH_SPLASH_EVENT = "airpaste:open-launch-splash";

export function openLaunchSplash() {
  window.dispatchEvent(new Event(OPEN_LAUNCH_SPLASH_EVENT));
}
