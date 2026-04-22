const VALID_HOME_VIEW_MODES = new Set(["grid", "list"]);
const VALID_SORT_OPTIONS = new Set(["updatedAt", "name", "type"]);
const VALID_FILTER_OPTIONS = new Set(["all", "folders", "canvases", "assets", "starred"]);
const VALID_HOME_SECTIONS = new Set(["home", "recents", "starred"]);

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

export function basenameFromRelativePath(relativePath) {
  const normalizedPath = String(relativePath ?? "").replaceAll("\\", "/");
  const segments = normalizedPath.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "";
}

export function parentFolderPath(relativePath) {
  const normalizedPath = String(relativePath ?? "").replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");

  if (!normalizedPath || !normalizedPath.includes("/")) {
    return "";
  }

  return normalizedPath.slice(0, normalizedPath.lastIndexOf("/"));
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

export function formatDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function normalizeHomePreferences(uiState) {
  return {
    viewMode: VALID_HOME_VIEW_MODES.has(uiState?.homeView) ? uiState.homeView : "grid",
    sortBy: VALID_SORT_OPTIONS.has(uiState?.sortBy) ? uiState.sortBy : "updatedAt",
    filter: VALID_FILTER_OPTIONS.has(uiState?.filter) ? uiState.filter : "all",
  };
}

export function normalizeHomeNavigation(uiState) {
  return {
    selectedSection: VALID_HOME_SECTIONS.has(uiState?.selectedSection)
      ? uiState.selectedSection
      : "home",
    currentFolderPath: typeof uiState?.currentFolderPath === "string"
      ? uiState.currentFolderPath
      : "",
    scrollTop: Number.isFinite(uiState?.homeScrollTop) && uiState.homeScrollTop >= 0
      ? uiState.homeScrollTop
      : 0,
  };
}

export function buildHomeRouteState(navigation, scrollTop = 0) {
  const route = {
    selectedSection: VALID_HOME_SECTIONS.has(navigation?.selectedSection)
      ? navigation.selectedSection
      : "home",
    currentFolderPath: typeof navigation?.currentFolderPath === "string"
      ? navigation.currentFolderPath
      : "",
    homeScrollTop: Number.isFinite(scrollTop) && scrollTop >= 0 ? scrollTop : 0,
  };

  return {
    ...route,
    lastHomeRoute: {
      selectedSection: route.selectedSection,
      currentFolderPath: route.currentFolderPath,
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

  if (filter === "folders") {
    return items.filter((item) => item.type === "folder");
  }

  if (filter === "assets") {
    return items.filter((item) => item.type === "asset" || item.type === "file");
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
