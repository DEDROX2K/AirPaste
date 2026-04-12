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

function IconHomeFilled() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3.1 2.5 10.7h2.6V21h6.2v-6.1h1.4V21h6.2V10.7h2.6L12 3.1Z" />
    </svg>
  );
}

function IconWindowToggle() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 5.25L7 9L11 5.25" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
    </svg>
  );
}

function IconWindowMinimize() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 7H11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
    </svg>
  );
}

function IconWindowClose() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3.2 3.2L10.8 10.8M10.8 3.2L3.2 10.8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.2" />
      <path d="M16.65 16.65L21 21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function focusSearchInput() {
  const selectors = [
    "#tile-search",
    ".home-search__input",
    "input[type='search']",
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLInputElement)) {
      continue;
    }
    if (element.disabled) {
      continue;
    }

    element.focus();
    element.select?.();
    return;
  }
}

function TitleBarControls() {
  return (
    <div className="titlebar-controls">
      <button
        className="titlebar-btn titlebar-btn--maximize"
        type="button"
        title="Toggle maximize"
        aria-label="Toggle maximize"
        onClick={() => desktop.window.maximize()}
      >
        <IconWindowToggle />
      </button>
      <button
        className="titlebar-btn titlebar-btn--minimize"
        type="button"
        title="Minimize"
        aria-label="Minimize"
        onClick={() => desktop.window.minimize()}
      >
        <IconWindowMinimize />
      </button>
      <button
        className="titlebar-btn titlebar-btn--close"
        type="button"
        title="Close"
        aria-label="Close"
        onClick={() => desktop.window.close()}
      >
        <IconWindowClose />
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
      <div className="titlebar-left">
        <div className="titlebar-tabs">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const isHome = tab.id === "home";
            const tabClassName = `titlebar-tab ${isHome ? "titlebar-tab--home" : "titlebar-tab--file"} ${isActive ? "titlebar-tab--active" : ""}`;
            const onActivate = () => setActiveTab(tab.id);

            return (
              <div
                key={tab.id}
                className={tabClassName}
                onClick={onActivate}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onActivate();
                  }
                }}
                title={tab.title}
                aria-label={tab.title}
              >
                {isHome ? (
                  <span className="titlebar-home-icon" aria-hidden="true">
                    <IconHomeFilled />
                  </span>
                ) : (
                  <>
                    <span className="titlebar-tab-label">{tab.title}</span>
                    {tab.closable ? (
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
                    ) : null}
                  </>
                )}

              </div>
            );
          })}
        </div>
      </div>

      <div id="titlebar-center-slot" />

      <div className="titlebar-right">
        <div id="titlebar-right-slot" />
        <TitleBarControls />
      </div>
    </div>
  );
}
