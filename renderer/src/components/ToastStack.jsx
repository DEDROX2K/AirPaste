import { useToast } from "../hooks/useToast";
import { AppButton } from "./ui/app";
import { Check, ErrorIcon, Info, Warning } from "./ui/icons";

const ICONS = {
  success: <Check size={15} aria-hidden="true" />,
  error: <ErrorIcon size={15} aria-hidden="true" />,
  warn: <Warning size={15} aria-hidden="true" />,
  info: <Info size={15} aria-hidden="true" />,
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
