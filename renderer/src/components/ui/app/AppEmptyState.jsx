import React from "react";
import { AppButton } from "./AppButton";

export function AppEmptyState({ eyebrow, title, description, actionLabel, onAction, icon }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center max-w-sm mx-auto h-full flex-1">
      {icon && (
        <div className="mb-3 text-ap-text-secondary opacity-50">
          {icon}
        </div>
      )}
      {eyebrow && (
        <span className="text-[10px] font-bold tracking-wider uppercase text-ap-text-secondary/70 mb-1.5">
          {eyebrow}
        </span>
      )}
      <h2 className="text-base font-semibold text-ap-text-primary mb-1 leading-snug">
        {title}
      </h2>
      {description && (
        <p className="text-xs text-ap-text-secondary mb-4 max-w-[280px] leading-normal">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <AppButton variant="default" size="sm" onClick={onAction} className="h-8px px-3 text-xs">
          {actionLabel}
        </AppButton>
      )}
    </div>
  );
}
