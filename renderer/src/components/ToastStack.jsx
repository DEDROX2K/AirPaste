import { useToast } from "../hooks/useToast";
import { AppButton } from "./ui/app";

const ICONS = {
  success: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M4.5 7.5L6.5 9.5L10.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  error: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 5L10 10M10 5L5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  warn: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 2L13.5 12.5H1.5L7.5 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <line x1="7.5" y1="6" x2="7.5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="7.5" cy="11" r="0.75" fill="currentColor"/>
    </svg>
  ),
  info: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="7.5" y1="6.5" x2="7.5" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="7.5" cy="4.5" r="0.75" fill="currentColor"/>
    </svg>
  ),
};

export function ToastStack() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div id="toast-stack" className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast-item toast-item--${t.level}`}
          role="alert"
        >
          <span className="toast-item__icon">{ICONS[t.level] ?? ICONS.info}</span>
          <span className="toast-item__msg">{t.message}</span>
          <AppButton
            variant="ghost"
            size="icon"
            className="toast-item__close h-5 w-5 shrink-0 text-ap-text-secondary hover:text-ap-text-primary"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
          >
            ×
          </AppButton>
        </div>
      ))}
    </div>
  );
}
