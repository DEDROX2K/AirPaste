import { useCallback, useEffect, useMemo, useState } from "react";
import { TabContext } from "./TabContext";

// Generate a random stable ID for tabs
function generateTabId() {
  return Math.random().toString(36).substring(2, 9);
}

const HOME_TAB_ID = "home";

const DEFAULT_TABS = [
  {
    id: HOME_TAB_ID,
    type: "home",
    title: "Home",
    closable: false,
  },
];

export function TabProvider({ children }) {
  const [tabs, setTabs] = useState(() => {
    // Try to load persisted tabs later, but start with home
    return DEFAULT_TABS;
  });
  
  const [activeTabId, setActiveTabId] = useState(HOME_TAB_ID);

  // Persist to localStorage whenever tabs or activeTabId changes
  useEffect(() => {
    try {
      localStorage.setItem("airpaste_tabs", JSON.stringify(tabs));
      localStorage.setItem("airpaste_active_tab", activeTabId);
    } catch (e) {
      console.warn("Failed to persist tabs:", e);
    }
  }, [tabs, activeTabId]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const savedTabs = localStorage.getItem("airpaste_tabs");
      const savedActiveTab = localStorage.getItem("airpaste_active_tab");
      
      if (savedTabs) {
        const parsedTabs = JSON.parse(savedTabs);
        if (Array.isArray(parsedTabs) && parsedTabs.length > 0) {
          // Ensure home tab exists
          if (!parsedTabs.find((t) => t.id === HOME_TAB_ID)) {
            parsedTabs.unshift(DEFAULT_TABS[0]);
          }
          setTabs(parsedTabs);
        }
      }
      
      if (savedActiveTab) {
        setActiveTabId(savedActiveTab);
      }
    } catch (e) {
      console.warn("Failed to load persisted tabs:", e);
    }
  }, []);

  const openTab = useCallback((item) => {
    setTabs((currentTabs) => {
      // Check if tab already exists for this entity
      if (item.entityId) {
        const existingTab = currentTabs.find((t) => t.entityId === item.entityId);
        if (existingTab) {
          setActiveTabId(existingTab.id);
          return currentTabs;
        }
      }

      // Create new tab
      const newTabId = item.id || generateTabId();
      const newTab = {
        id: newTabId,
        type: item.type, // 'canvas' | 'page'
        entityId: item.entityId,
        projectId: item.projectId,
        spaceId: item.spaceId,
        title: item.title || "Untitled",
        closable: item.closable !== false,
        viewState: item.viewState || {},
      };

      setActiveTabId(newTab.id);
      return [...currentTabs, newTab];
    });
  }, []);

  const closeTab = useCallback((tabIdToClose) => {
    setTabs((currentTabs) => {
      const tabIndex = currentTabs.findIndex((t) => t.id === tabIdToClose);
      if (tabIndex === -1) return currentTabs;
      
      const tabToClose = currentTabs[tabIndex];
      if (!tabToClose.closable) return currentTabs; // Prevent closing un-closable tabs like Home

      const nextTabs = currentTabs.filter((t) => t.id !== tabIdToClose);

      // If we are closing the active tab, we need to pick a new active tab
      if (activeTabId === tabIdToClose) {
        // Prefer right neighbor, then left neighbor, then Home
        if (tabIndex < nextTabs.length) {
          // Right neighbor (it shifted left into the same index)
          setActiveTabId(nextTabs[tabIndex].id);
        } else if (tabIndex > 0) {
          // Left neighbor
          setActiveTabId(nextTabs[tabIndex - 1].id);
        } else {
          // Fallback to Home if nothing left (should always exist)
          setActiveTabId(HOME_TAB_ID);
        }
      }

      return nextTabs;
    });
  }, [activeTabId]);

  const updateTabViewState = useCallback((tabId, viewStateUpdate) => {
    setTabs((currentTabs) => {
      return currentTabs.map((tab) => {
        if (tab.id === tabId) {
          return {
            ...tab,
            viewState: {
              ...tab.viewState,
              ...viewStateUpdate,
            },
          };
        }
        return tab;
      });
    });
  }, []);

  const renameTabForEntity = useCallback((entityId, newTitle) => {
    if (!entityId) return;
    setTabs((currentTabs) => {
      return currentTabs.map((tab) => {
        if (tab.entityId === entityId) {
          return { ...tab, title: newTitle };
        }
        return tab;
      });
    });
  }, []);

  const closeTabsForEntity = useCallback((entityId) => {
    if (!entityId) return;
    setTabs((currentTabs) => {
      const tabsToClose = currentTabs.filter((t) => t.entityId === entityId);
      if (tabsToClose.length === 0) return currentTabs;

      let nextTabs = [...currentTabs];
      let nextActiveId = activeTabId;

      for (const t of tabsToClose) {
        const tabIndex = nextTabs.findIndex((nt) => nt.id === t.id);
        nextTabs = nextTabs.filter((nt) => nt.id !== t.id);

        if (nextActiveId === t.id) {
          if (tabIndex < nextTabs.length) {
            nextActiveId = nextTabs[tabIndex].id;
          } else if (tabIndex > 0) {
            nextActiveId = nextTabs[tabIndex - 1].id;
          } else {
            nextActiveId = HOME_TAB_ID;
          }
        }
      }

      // Need to defer setActiveTabId to avoid state queueing issues
      setTimeout(() => setActiveTabId(nextActiveId), 0);
      return nextTabs;
    });
  }, [activeTabId]);
  
  const showHomeTab = useCallback(() => {
    setActiveTabId(HOME_TAB_ID);
  }, []);

  const value = useMemo(
    () => ({
      tabs,
      activeTabId,
      activeTab: tabs.find((t) => t.id === activeTabId) || tabs[0],
      openTab,
      closeTab,
      setActiveTab: setActiveTabId,
      updateTabViewState,
      renameTabForEntity,
      closeTabsForEntity,
      showHomeTab,
    }),
    [
      tabs,
      activeTabId,
      openTab,
      closeTab,
      updateTabViewState,
      renameTabForEntity,
      closeTabsForEntity,
      showHomeTab,
    ]
  );

  return <TabContext.Provider value={value}>{children}</TabContext.Provider>;
}
