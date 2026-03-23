import { useTabs } from "../context/useTabs";
import { desktop } from "../lib/desktop";
import "./TopTabBar.css";

function IconClose() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
      <polyline points="9 22 9 12 15 12 15 22"></polyline>
    </svg>
  );
}

function IconFile() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
      <polyline points="13 2 13 9 20 9"></polyline>
    </svg>
  );
}

function IconLayout() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="3" y1="9" x2="21" y2="9"></line>
      <line x1="9" y1="21" x2="9" y2="9"></line>
    </svg>
  );
}

function TitleBarControls() {
  const usesOverlay = desktop.window.usesTitleBarOverlay;

  if (usesOverlay) {
    return null;
  }

  return (
    <div className="titlebar-controls">
      <button
        className="titlebar-btn titlebar-btn--minimize"
        type="button"
        title="Minimize"
        onClick={() => desktop.window.minimize()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <rect y="4.5" width="10" height="1" rx="0.5" />
        </svg>
      </button>
      <button
        className="titlebar-btn titlebar-btn--maximize"
        type="button"
        title="Maximize"
        onClick={() => desktop.window.maximize()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
          <rect x="0.5" y="0.5" width="9" height="9" rx="1" />
        </svg>
      </button>
      <button
        className="titlebar-btn titlebar-btn--close"
        type="button"
        title="Close"
        onClick={() => desktop.window.close()}
      >
        <IconClose />
      </button>
    </div>
  );
}

export function TopTabBar({ usesCustomTitlebar }) {
  const { tabs, activeTabId, setActiveTab, closeTab } = useTabs();

  if (!usesCustomTitlebar) {
    return null;
  }

  return (
    <div
      className="titlebar-root"
      onDoubleClick={() => {
        desktop.window?.maximize?.();
      }}
    >
      <div className="titlebar-left" />

      <div className="titlebar-center">
        <div className="titlebar-tabs">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const isHome = tab.id === "home";

            return (
              <div
                key={tab.id}
                className={`titlebar-tab ${isActive ? "titlebar-tab--active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveTab(tab.id);
                  }
                }}
                title={tab.title}
              >
                <span className="titlebar-tab-icon">
                  {isHome ? <IconHome /> : tab.type === "page" ? <IconFile /> : <IconLayout />}
                </span>
                <span className="titlebar-tab-label">{tab.title}</span>
                
                {tab.closable && (
                  <button
                    className="titlebar-tab-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    title="Close tab"
                    aria-label="Close tab"
                  >
                    <IconClose />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="titlebar-right">
        <TitleBarControls />
      </div>
    </div>
  );
}
