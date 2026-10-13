import { firstString, getNextCardPosition, nowIso, normalizeCard } from "../../lib/workspace";
import TILE_TYPES from "../tileTypes";

export const TABLE_CARD_TYPE = TILE_TYPES.TABLE;

export const TABLE_CARD_SIZE = Object.freeze({
  width: 560,
  height: 360,
});

export const TABLE_DEFAULT_TITLE = "Untitled table";
export const TABLE_COLUMN_KINDS = Object.freeze(["text", "number", "checkbox", "date"]);
export const TABLE_DEFAULT_COLUMNS = Object.freeze([
  Object.freeze({ id: "col_name", name: "Name", kind: "text" }),
  Object.freeze({ id: "col_status", name: "Status", kind: "text" }),
  Object.freeze({ id: "col_notes", name: "Notes", kind: "text" }),
]);
export const TABLE_DEFAULT_ROWS = Object.freeze([
  Object.freeze({
    id: "row_1",
    cells: Object.freeze({
      col_name: "",
      col_status: "",
      col_notes: "",
    }),
  }),
]);

export function normalizeTableColumnKind(kind) {
  return TABLE_COLUMN_KINDS.includes(kind) ? kind : "text";
}

export function createDefaultTableColumns() {
  return TABLE_DEFAULT_COLUMNS.map((column) => ({ ...column }));
}

export function createDefaultTableRows(columns = TABLE_DEFAULT_COLUMNS) {
  const safeColumns = Array.isArray(columns) && columns.length > 0
    ? columns
    : TABLE_DEFAULT_COLUMNS;

  return [
    {
      id: "row_1",
      cells: Object.fromEntries(
        safeColumns.map((column) => [
          column.id,
          normalizeTableCellValue(column.kind, TABLE_DEFAULT_ROWS[0]?.cells?.[column.id]),
        ]),
      ),
    },
  ];
}

export function normalizeTableColumns(columns) {
  const normalizedColumns = Array.isArray(columns)
    ? columns
      .map((column, index) => ({
        id: typeof column?.id === "string" && column.id.trim().length > 0
          ? column.id.trim()
          : `col_${index + 1}`,
        name: typeof column?.name === "string" && column.name.trim().length > 0
          ? column.name
          : `Column ${index + 1}`,
        kind: normalizeTableColumnKind(column?.kind),
      }))
      .filter((column) => column.id.length > 0)
    : [];

  return normalizedColumns.length > 0 ? normalizedColumns : createDefaultTableColumns();
}

export function normalizeTableCellValue(kind, value) {
  if (kind === "checkbox") {
    return value === true;
  }

  return typeof value === "string"
    ? value
    : (value == null ? "" : String(value));
}

export function normalizeTableRows(rows, columns) {
  const safeColumns = Array.isArray(columns) && columns.length > 0
    ? columns
    : createDefaultTableColumns();
  const normalizedRows = Array.isArray(rows)
    ? rows
      .map((row, index) => {
        const safeCells = row?.cells && typeof row.cells === "object" ? row.cells : {};

        return {
          id: typeof row?.id === "string" && row.id.trim().length > 0
            ? row.id.trim()
            : `row_${index + 1}`,
          cells: Object.fromEntries(
            safeColumns.map((column) => [
              column.id,
              normalizeTableCellValue(column.kind, safeCells[column.id]),
            ]),
          ),
        };
      })
      .filter((row) => row.id.length > 0)
    : [];

  return normalizedRows.length > 0 ? normalizedRows : createDefaultTableRows(safeColumns);
}

export function createTableCard(cards, viewport, preferredCenter = null, options = {}) {
  const position = getNextCardPosition(cards, viewport, TABLE_CARD_TYPE, preferredCenter);
  const timestamp = nowIso();
  const columns = normalizeTableColumns(options?.columns);
  const rows = normalizeTableRows(options?.rows, columns);

  return normalizeCard({
    id: crypto.randomUUID(),
    type: TABLE_CARD_TYPE,
    title: firstString(options?.title, TABLE_DEFAULT_TITLE),
    columns,
    rows,
    x: position.x,
    y: position.y,
    width: Number.isFinite(options?.width) ? options.width : position.width,
    height: Number.isFinite(options?.height) ? options.height : position.height,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
