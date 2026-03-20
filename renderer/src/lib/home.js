const VALID_HOME_VIEW_MODES = new Set(["grid", "list"]);
const VALID_SORT_OPTIONS = new Set(["updatedAt", "name", "type"]);
const VALID_FILTER_OPTIONS = new Set(["all", "canvases", "pages", "starred"]);
const VALID_HOME_MODES = new Set(["home", "project", "space"]);
const VALID_HOME_SECTIONS = new Set(["overview", "recents", "projects", "resources", "trash", "starred"]);

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

export function folderNameFromPath(folderPath) {
  if (!folderPath) {
    return "No folder";
  }

  const segments = folderPath.split(/[\\/]/);
  return segments[segments.length - 1] || folderPath;
}

export function formatRelativeTime(value) {
  if (!value) {
    return "Just now";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Just now";
  }

  const elapsedSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const divisions = [
    { amount: 60, unit: "second" },
    { amount: 60, unit: "minute" },
    { amount: 24, unit: "hour" },
    { amount: 7, unit: "day" },
    { amount: 4.34524, unit: "week" },
    { amount: 12, unit: "month" },
    { amount: Number.POSITIVE_INFINITY, unit: "year" },
  ];
  let duration = elapsedSeconds;

  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return relativeTimeFormatter.format(Math.round(duration), division.unit);
    }

    duration /= division.amount;
  }

  return "Just now";
}

export function normalizeHomePreferences(uiState) {
  return {
    viewMode: VALID_HOME_VIEW_MODES.has(uiState?.homeView) ? uiState.homeView : "grid",
    sortBy: VALID_SORT_OPTIONS.has(uiState?.sortBy) ? uiState.sortBy : "updatedAt",
    filter: VALID_FILTER_OPTIONS.has(uiState?.filter) ? uiState.filter : "all",
  };
}

export function normalizeHomeNavigation(uiState, fallbackProjectId = null) {
  const mode = VALID_HOME_MODES.has(uiState?.homeMode) ? uiState.homeMode : "home";
  const selectedSection = VALID_HOME_SECTIONS.has(uiState?.selectedSection)
    ? uiState.selectedSection
    : "overview";

  return {
    mode,
    selectedSection,
    selectedProjectId: typeof uiState?.selectedProjectId === "string"
      ? uiState.selectedProjectId
      : typeof uiState?.lastOpenedProjectId === "string"
        ? uiState.lastOpenedProjectId
        : fallbackProjectId,
    selectedSpaceId: typeof uiState?.selectedSpaceId === "string"
      ? uiState.selectedSpaceId
      : typeof uiState?.lastOpenedSpaceId === "string"
        ? uiState.lastOpenedSpaceId
        : null,
    scrollTop: Number.isFinite(uiState?.homeScrollTop) && uiState.homeScrollTop >= 0
      ? uiState.homeScrollTop
      : 0,
  };
}

export function buildHomeRouteState(navigation, scrollTop = 0) {
  const route = {
    homeMode: VALID_HOME_MODES.has(navigation?.mode) ? navigation.mode : "home",
    selectedSection: VALID_HOME_SECTIONS.has(navigation?.selectedSection)
      ? navigation.selectedSection
      : "overview",
    selectedProjectId: typeof navigation?.selectedProjectId === "string" ? navigation.selectedProjectId : null,
    selectedSpaceId: typeof navigation?.selectedSpaceId === "string" ? navigation.selectedSpaceId : null,
    homeScrollTop: Number.isFinite(scrollTop) && scrollTop >= 0 ? scrollTop : 0,
  };

  return {
    ...route,
    lastHomeRoute: {
      mode: route.homeMode,
      selectedSection: route.selectedSection,
      selectedProjectId: route.selectedProjectId,
      selectedSpaceId: route.selectedSpaceId,
      scrollTop: route.homeScrollTop,
    },
  };
}

export function filterItemsByPreference(items, filter) {
  if (!Array.isArray(items)) {
    return [];
  }

  if (filter === "canvases") {
    return items.filter((item) => item.type === "canvas");
  }

  if (filter === "pages") {
    return items.filter((item) => item.type === "page");
  }

  if (filter === "starred") {
    return items.filter((item) => item.starred);
  }

  return [...items];
}

function compareByType(left, right) {
  const leftType = String(left?.type ?? "");
  const rightType = String(right?.type ?? "");

  if (leftType === rightType) {
    return String(left?.name ?? "").localeCompare(String(right?.name ?? ""));
  }

  return leftType.localeCompare(rightType);
}

export function sortEntriesByPreference(entries, sortBy) {
  const nextEntries = Array.isArray(entries) ? [...entries] : [];

  if (sortBy === "name") {
    return nextEntries.sort((left, right) => left.name.localeCompare(right.name));
  }

  if (sortBy === "type") {
    return nextEntries.sort((left, right) => {
      const typeOrder = compareByType(left, right);

      if (typeOrder !== 0) {
        return typeOrder;
      }

      return String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""));
    });
  }

  return nextEntries.sort((left, right) => {
    if (left.updatedAt === right.updatedAt) {
      return compareByType(left, right);
    }

    return String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""));
  });
}

export function resolveWorkspaceAssetUrl(folderPath, relativePath) {
  if (!folderPath || !relativePath) {
    return null;
  }

  const normalizedFolderPath = folderPath.replaceAll("\\", "/").replace(/\/$/, "");
  const normalizedRelativePath = String(relativePath).replaceAll("\\", "/").replace(/^\//, "");
  return encodeURI(`file:///${normalizedFolderPath}/${normalizedRelativePath}`);
}
