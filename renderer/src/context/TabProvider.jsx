import { useCallback, useEffect, useMemo, useState } from "react";
import { isEditableElement } from "../lib/workspace";
import { TabContext } from "./TabContext";

const HOME_TAB_ID = "home";
const TABS_STORAGE_KEY = "airpaste_tabs";
const ACTIVE_TAB_STORAGE_KEY = "airpaste_active_tab";
const CLOSED_TABS_STORAGE_KEY = "airpaste_closed_tabs";
const MAX_RECENTLY_CLOSED_TABS = 10;

function generateTabId() {
  return Math.random().toString(36).substring(2, 9);
}

const HOME_TAB = Object.freeze({
  id: HOME_TAB_ID,
  type: "home",
  title: "Home",
  closable: false,
  pinned: true,
  viewState: {},
});

function createHomeTab() {
  return {
    ...HOME_TAB,
    viewState: {},
  };
}

function sanitizeTab(tab, index = 0) {
  if (!tab || typeof tab !== "object") {
    return null;
  }

  const id = typeof tab.id === "string" && tab.id.trim() ? tab.id.trim() : `tab-${index}-${generateTabId()}`;
  const type = typeof tab.type === "string" && tab.type.trim() ? tab.type.trim() : "file";
  const title = typeof tab.title === "string" && tab.title.trim() ? tab.title.trim() : "Untitled";
  const closable = id === HOME_TAB_ID ? false : tab.closable !== false;
  const pinned = id === HOME_TAB_ID ? true : tab.pinned === true;

  return {
    id,
    type,
    entityId: typeof tab.entityId === "string" && tab.entityId.trim() ? tab.entityId : null,
    title,
    closable,
    pinned,
    viewState: tab.viewState && typeof tab.viewState === "object" ? tab.viewState : {},
  };
}

function normalizeTabs(rawTabs) {
  const sourceTabs = Array.isArray(rawTabs) ? rawTabs : [];
  const nextTabs = [];
  let homeTab = createHomeTab();

  sourceTabs.forEach((tab, index) => {
    const nextTab = sanitizeTab(tab, index);
    if (!nextTab) {
      return;
    }

    if (nextTab.id === HOME_TAB_ID) {
      homeTab = {
        ...nextTab,
        id: HOME_TAB_ID,
        type: "home",
        title: "Home",
        closable: false,
        pinned: true,
      };
      return;
    }

    if (nextTabs.some((existingTab) => existingTab.id === nextTab.id)) {
      return;
    }

    nextTabs.push(nextTab);
  });

  return [homeTab, ...nextTabs];
}

function sanitizeClosedTabEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const tab = sanitizeTab(entry.tab);
  if (!tab || tab.id === HOME_TAB_ID || !tab.closable) {
    return null;
  }

  return {
    tab,
    previousIndex: Number.isInteger(entry.previousIndex) ? entry.previousIndex : null,
  };
}

function normalizeClosedTabs(rawClosedTabs) {
  if (!Array.isArray(rawClosedTabs)) {
    return [];
  }

  return rawClosedTabs
    .map(sanitizeClosedTabEntry)
    .filter(Boolean)
    .slice(0, MAX_RECENTLY_CLOSED_TABS);
}

function pinnedTabCount(tabs) {
  return tabs.filter((tab) => tab.pinned).length;
}

function clampMoveIndex(tabs, tab, targetIndex) {
  if (!tab) {
    return 0;
  }

  if (!Number.isFinite(targetIndex)) {
    return tabs.findIndex((entry) => entry.id === tab.id);
  }

  const currentIndex = tabs.findIndex((entry) => entry.id === tab.id);
  const normalizedTarget = Math.max(0, Math.min(tabs.length - 1, targetIndex));
  const pinnedCount = pinnedTabCount(tabs);

  if (tab.id === HOME_TAB_ID) {
    return 0;
  }

  if (tab.pinned) {
    return Math.max(1, Math.min(pinnedCount - 1, normalizedTarget));
  }

  const maxTarget = tabs.length - 1;
  const minTarget = Math.max(1, pinnedCount);
  const adjustedTarget = Math.max(minTarget, Math.min(maxTarget, normalizedTarget));

  if (currentIndex === -1) {
    return adjustedTarget;
  }

  return adjustedTarget;
}

function clampInsertIndex(tabs, tab, targetIndex) {
  const normalizedTarget = Math.max(0, Math.min(tabs.length, targetIndex));
  const pinnedCount = pinnedTabCount(tabs);

  if (tab?.pinned) {
    return Math.max(1, Math.min(pinnedCount, normalizedTarget));
  }

  return Math.max(Math.max(1, pinnedCount), Math.min(tabs.length, normalizedTarget));
}

function reorderTabs(tabs, tabId, targetIndex) {
  const currentIndex = tabs.findIndex((tab) => tab.id === tabId);
  if (currentIndex === -1) {
    return tabs;
  }

  const tab = tabs[currentIndex];
  const nextIndex = clampMoveIndex(tabs, tab, targetIndex);

  if (currentIndex === nextIndex) {
    return tabs;
  }

  const nextTabs = [...tabs];
  nextTabs.splice(currentIndex, 1);
  const insertIndex = currentIndex < nextIndex ? nextIndex - 1 : nextIndex;
  nextTabs.splice(insertIndex, 0, tab);
  return nextTabs;
}

function getNextActiveAfterClose(tabs, closingIds, activeTabId) {
  if (!closingIds.has(activeTabId)) {
    return activeTabId;
  }

  const activeIndex = tabs.findIndex((tab) => tab.id === activeTabId);
  for (let index = activeIndex + 1; index < tabs.length; index += 1) {
    const candidate = tabs[index];
    if (!closingIds.has(candidate.id)) {
      return candidate.id;
    }
  }

  for (let index = activeIndex - 1; index >= 0; index -= 1) {
    const candidate = tabs[index];
    if (!closingIds.has(candidate.id)) {
      return candidate.id;
    }
  }

  return HOME_TAB_ID;
}

function buildClosedEntries(tabs, closingIds) {
  return tabs
    .map((tab, index) => ({ tab, previousIndex: index }))
    .filter(({ tab }) => closingIds.has(tab.id) && tab.id !== HOME_TAB_ID && tab.closable)
    .reverse();
}

function cycleTab(tabs, activeTabId, direction) {
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTabId);
  if (activeIndex === -1 || tabs.length <= 1) {
    return activeTabId;
  }

  const nextIndex = (activeIndex + direction + tabs.length) % tabs.length;
  return tabs[nextIndex]?.id ?? activeTabId;
}

function getTabIdByShortcutIndex(tabs, requestedIndex) {
  if (!tabs.length) {
    return HOME_TAB_ID;
  }

  if (requestedIndex === 9) {
    return tabs[tabs.length - 1]?.id ?? HOME_TAB_ID;
  }

  return tabs[Math.max(0, Math.min(tabs.length - 1, requestedIndex - 1))]?.id ?? HOME_TAB_ID;
}

function shouldIgnoreKeyboardShortcut(event) {
  if (event.defaultPrevented) {
    return true;
  }

  if (event.altKey && !(event.metaKey && !event.ctrlKey)) {
    return true;
  }

  return isEditableElement(event.target) || isEditableElement(document.activeElement);
}

export function TabProvider({ children }) {
  const [tabs, setTabs] = useState(() => [createHomeTab()]);
  const [activeTabId, setActiveTabId] = useState(HOME_TAB_ID);
  const [closedTabs, setClosedTabs] = useState([]);

  useEffect(() => {
    try {
      const savedTabs = localStorage.getItem(TABS_STORAGE_KEY);
      const savedActiveTab = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
      const savedClosedTabs = localStorage.getItem(CLOSED_TABS_STORAGE_KEY);

      const nextTabs = normalizeTabs(savedTabs ? JSON.parse(savedTabs) : null);
      const nextClosedTabs = normalizeClosedTabs(savedClosedTabs ? JSON.parse(savedClosedTabs) : null);
      const nextActiveTabId = nextTabs.some((tab) => tab.id === savedActiveTab) ? savedActiveTab : HOME_TAB_ID;

      setTabs(nextTabs);
      setClosedTabs(nextClosedTabs);
      setActiveTabId(nextActiveTabId);
    } catch (error) {
      console.warn("Failed to load persisted tabs:", error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs));
      localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTabId);
      localStorage.setItem(CLOSED_TABS_STORAGE_KEY, JSON.stringify(closedTabs));
    } catch (error) {
      console.warn("Failed to persist tabs:", error);
    }
  }, [activeTabId, closedTabs, tabs]);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(HOME_TAB_ID);
    }
  }, [activeTabId, tabs]);

  const openTab = useCallback((item) => {
    let nextActiveId = item.id || null;

    setTabs((currentTabs) => {
      if (item.entityId) {
        const existingTab = currentTabs.find((tab) => tab.entityId === item.entityId);
        if (existingTab) {
          nextActiveId = existingTab.id;
          return currentTabs;
        }
      }

      const newTabId = item.id || generateTabId();
      nextActiveId = newTabId;
      const nextTab = sanitizeTab({
        id: newTabId,
        type: item.type,
        entityId: item.entityId,
        title: item.title || "Untitled",
        closable: item.closable !== false,
        pinned: item.pinned === true,
        viewState: item.viewState || {},
      });

      if (!nextTab) {
        return currentTabs;
      }

      const insertIndex = clampInsertIndex(currentTabs, nextTab, currentTabs.length);
      const nextTabs = [...currentTabs];
      nextTabs.splice(insertIndex, 0, nextTab);
      return nextTabs;
    });

    if (nextActiveId) {
      setActiveTabId(nextActiveId);
    }
  }, []);

  const moveTab = useCallback((tabId, targetIndex) => {
    setTabs((currentTabs) => reorderTabs(currentTabs, tabId, targetIndex));
  }, []);

  const activateNextTab = useCallback(() => {
    setActiveTabId((currentActiveTabId) => cycleTab(tabs, currentActiveTabId, 1));
  }, [tabs]);

  const activatePreviousTab = useCallback(() => {
    setActiveTabId((currentActiveTabId) => cycleTab(tabs, currentActiveTabId, -1));
  }, [tabs]);

  const closeTabsByIds = useCallback((tabIds) => {
    const closingIds = new Set((Array.isArray(tabIds) ? tabIds : []).filter(Boolean));
    if (closingIds.size === 0) {
      return;
    }

    let nextActiveId = HOME_TAB_ID;
    let nextClosedEntries = [];

    setTabs((currentTabs) => {
      const closableIds = new Set(
        currentTabs
          .filter((tab) => closingIds.has(tab.id) && tab.id !== HOME_TAB_ID && tab.closable)
          .map((tab) => tab.id),
      );

      if (closableIds.size === 0) {
        nextActiveId = currentTabs.find((tab) => tab.id === activeTabId)?.id ?? HOME_TAB_ID;
        return currentTabs;
      }

      nextClosedEntries = buildClosedEntries(currentTabs, closableIds);
      nextActiveId = getNextActiveAfterClose(currentTabs, closableIds, activeTabId);
      return currentTabs.filter((tab) => !closableIds.has(tab.id));
    });

    if (nextClosedEntries.length > 0) {
      setClosedTabs((currentClosedTabs) => [...nextClosedEntries, ...currentClosedTabs].slice(0, MAX_RECENTLY_CLOSED_TABS));
    }

    setActiveTabId(nextActiveId);
  }, [activeTabId]);

  const closeTab = useCallback((tabIdToClose) => {
    closeTabsByIds([tabIdToClose]);
  }, [closeTabsByIds]);

  const reopenClosedTab = useCallback(() => {
    let restoredTabId = null;

    setClosedTabs((currentClosedTabs) => {
      const [nextClosedTab, ...remainingClosedTabs] = currentClosedTabs;
      if (!nextClosedTab?.tab) {
        return currentClosedTabs;
      }

      setTabs((currentTabs) => {
        if (nextClosedTab.tab.entityId) {
          const existingTab = currentTabs.find((tab) => tab.entityId === nextClosedTab.tab.entityId);
          if (existingTab) {
            restoredTabId = existingTab.id;
            return currentTabs;
          }
        }

        const nextTabId = currentTabs.some((tab) => tab.id === nextClosedTab.tab.id)
          ? generateTabId()
          : nextClosedTab.tab.id;
        const restoredTab = {
          ...nextClosedTab.tab,
          id: nextTabId,
        };
        const insertIndex = clampInsertIndex(currentTabs, restoredTab, nextClosedTab.previousIndex ?? currentTabs.length);
        const nextTabs = [...currentTabs];
        nextTabs.splice(insertIndex, 0, restoredTab);
        restoredTabId = restoredTab.id;
        return nextTabs;
      });

      return remainingClosedTabs;
    });

    if (restoredTabId) {
      setActiveTabId(restoredTabId);
    }
  }, []);

  const closeOtherTabs = useCallback((tabId) => {
    closeTabsByIds(tabs.filter((tab) => tab.id !== HOME_TAB_ID && tab.id !== tabId).map((tab) => tab.id));
  }, [closeTabsByIds, tabs]);

  const closeTabsToRight = useCallback((tabId) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === tabId);
    if (currentIndex === -1) {
      return;
    }

    closeTabsByIds(
      tabs
        .slice(currentIndex + 1)
        .filter((tab) => tab.id !== HOME_TAB_ID)
        .map((tab) => tab.id),
    );
  }, [closeTabsByIds, tabs]);

  const updateTabViewState = useCallback((tabId, viewStateUpdate) => {
    setTabs((currentTabs) => currentTabs.map((tab) => {
      if (tab.id !== tabId) {
        return tab;
      }

      return {
        ...tab,
        viewState: {
          ...tab.viewState,
          ...viewStateUpdate,
        },
      };
    }));
  }, []);

  const renameTabForEntity = useCallback((entityId, newTitle) => {
    if (!entityId) return;

    setTabs((currentTabs) => currentTabs.map((tab) => (
      tab.entityId === entityId
        ? { ...tab, title: newTitle }
        : tab
    )));
  }, []);

  const rebindTabEntity = useCallback((previousEntityId, nextEntityId, nextTitle = null) => {
    if (!previousEntityId || !nextEntityId) return;

    setTabs((currentTabs) => currentTabs.map((tab) => {
      if (tab.entityId !== previousEntityId) {
        return tab;
      }

      return {
        ...tab,
        entityId: nextEntityId,
        title: typeof nextTitle === "string" && nextTitle.trim() ? nextTitle.trim() : tab.title,
      };
    }));
  }, []);

  const closeTabsForEntity = useCallback((entityId) => {
    if (!entityId) return;
    closeTabsByIds(tabs.filter((tab) => tab.entityId === entityId).map((tab) => tab.id));
  }, [closeTabsByIds, tabs]);

  const showHomeTab = useCallback(() => {
    setActiveTabId(HOME_TAB_ID);
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      if (shouldIgnoreKeyboardShortcut(event)) {
        return;
      }

      const key = String(event.key || "").toLowerCase();

      if (isMac) {
        if (event.metaKey && event.altKey && !event.shiftKey && event.key === "ArrowRight") {
          event.preventDefault();
          activateNextTab();
          return;
        }

        if (event.metaKey && event.altKey && !event.shiftKey && event.key === "ArrowLeft") {
          event.preventDefault();
          activatePreviousTab();
          return;
        }

        if (event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey && key === "w") {
          event.preventDefault();
          closeTab(activeTabId);
          return;
        }

        if (event.metaKey && event.shiftKey && !event.altKey && !event.ctrlKey && key === "t") {
          event.preventDefault();
          reopenClosedTab();
          return;
        }

        if (event.metaKey && !event.altKey && !event.ctrlKey && /^[1-9]$/.test(key)) {
          event.preventDefault();
          setActiveTabId(getTabIdByShortcutIndex(tabs, Number(key)));
        }

        return;
      }

      if (event.ctrlKey && !event.altKey && !event.metaKey && key === "tab") {
        event.preventDefault();
        if (event.shiftKey) {
          activatePreviousTab();
        } else {
          activateNextTab();
        }
        return;
      }

      if (event.ctrlKey && !event.altKey && !event.metaKey && event.key === "PageDown") {
        event.preventDefault();
        activateNextTab();
        return;
      }

      if (event.ctrlKey && !event.altKey && !event.metaKey && event.key === "PageUp") {
        event.preventDefault();
        activatePreviousTab();
        return;
      }

      if (event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && key === "w") {
        event.preventDefault();
        closeTab(activeTabId);
        return;
      }

      if (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && key === "t") {
        event.preventDefault();
        reopenClosedTab();
        return;
      }

      if (event.ctrlKey && !event.altKey && !event.metaKey && /^[1-9]$/.test(key)) {
        event.preventDefault();
        setActiveTabId(getTabIdByShortcutIndex(tabs, Number(key)));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activateNextTab, activatePreviousTab, activeTabId, closeTab, reopenClosedTab, tabs]);

  const value = useMemo(() => ({
    tabs,
    activeTabId,
    activeTab: tabs.find((tab) => tab.id === activeTabId) || tabs[0],
    openTab,
    moveTab,
    activateNextTab,
    activatePreviousTab,
    closeTab,
    reopenClosedTab,
    closeOtherTabs,
    closeTabsToRight,
    setActiveTab: setActiveTabId,
    updateTabViewState,
    renameTabForEntity,
    rebindTabEntity,
    closeTabsForEntity,
    showHomeTab,
    canReopenClosedTab: closedTabs.length > 0,
  }), [
    tabs,
    activeTabId,
    openTab,
    moveTab,
    activateNextTab,
    activatePreviousTab,
    closeTab,
    reopenClosedTab,
    closeOtherTabs,
    closeTabsToRight,
    updateTabViewState,
    renameTabForEntity,
    rebindTabEntity,
    closeTabsForEntity,
    showHomeTab,
    closedTabs.length,
  ]);

  return <TabContext.Provider value={value}>{children}</TabContext.Provider>;
}
