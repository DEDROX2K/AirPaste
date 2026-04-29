import { memo, useEffect, useMemo, useRef } from "react";
import { useAppContext } from "../../context/useAppContext";
import { useTileGesture } from "../../systems/interactions/useTileGesture";
import TileShell from "./TileShell";

const TABLE_COLUMN_KINDS = ["text", "number", "checkbox", "date"];

function stopInteractivePointer(event) {
  event.stopPropagation();
}

function stopInteractiveKey(event) {
  event.stopPropagation();
}

function createColumn(index = 0) {
  return {
    id: crypto.randomUUID(),
    name: `Column ${index + 1}`,
    kind: "text",
  };
}

function createRow(columns) {
  return {
    id: crypto.randomUUID(),
    cells: Object.fromEntries(
      columns.map((column) => [column.id, column.kind === "checkbox" ? false : ""]),
    ),
  };
}

function normalizeCellValue(kind, value) {
  if (kind === "checkbox") {
    return value === true;
  }

  return typeof value === "string" ? value : (value == null ? "" : String(value));
}

function parseTsv(text) {
  return String(text ?? "")
    .replaceAll("\r\n", "\n")
    .split("\n")
    .filter((row) => row.length > 0)
    .map((row) => row.split("\t"));
}

function TableTile({
  card,
  tileMeta,
  dragVisualDelta,
  dragVisualTileIdSet,
  onBeginDrag,
  onContextMenu,
  onHoverChange,
  onFocusIn,
  onFocusOut,
  onPressStart,
}) {
  const { updateExistingCard } = useAppContext();
  const inputRefs = useRef(new Map());
  const pendingFocusRef = useRef(null);
  const surfaceGesture = useTileGesture({
    card,
    onDragStart: onBeginDrag,
    onPressStart,
  });
  const columns = useMemo(
    () => (Array.isArray(card.columns) && card.columns.length > 0 ? card.columns : [createColumn(0)]),
    [card.columns],
  );
  const rows = useMemo(
    () => (Array.isArray(card.rows) && card.rows.length > 0 ? card.rows : [createRow(columns)]),
    [card.rows, columns],
  );
  const surfaceFrameClassName = [
    "card__surface-frame",
    "card__surface-frame--interactive",
    tileMeta?.isSelected ? "card__surface-frame--selected" : "",
    tileMeta?.isMergeTarget ? "card__surface-frame--merge-target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    if (!pendingFocusRef.current) {
      return;
    }

    const { rowId, columnId } = pendingFocusRef.current;
    const input = inputRefs.current.get(`${rowId}:${columnId}`);

    if (input) {
      input.focus();
      input.select?.();
      pendingFocusRef.current = null;
    }
  }, [columns, rows]);

  const focusCell = (rowId, columnId) => {
    const input = inputRefs.current.get(`${rowId}:${columnId}`);
    input?.focus?.();
    input?.select?.();
  };

  const updateTable = (nextColumns, nextRows) => {
    updateExistingCard(card.id, {
      columns: nextColumns,
      rows: nextRows,
    });
  };

  const handleCellChange = (rowId, columnId, value) => {
    updateTable(
      columns,
      rows.map((row) => (
        row.id === rowId
          ? {
            ...row,
            cells: {
              ...row.cells,
              [columnId]: value,
            },
          }
          : row
      )),
    );
  };

  const handleAddRow = () => {
    const nextRow = createRow(columns);
    pendingFocusRef.current = { rowId: nextRow.id, columnId: columns[0]?.id ?? null };
    updateTable(columns, [...rows, nextRow]);
  };

  const handleDeleteRow = (rowId) => {
    if (rows.length <= 1) {
      updateTable(
        columns,
        rows.map((row) => ({
          ...row,
          cells: Object.fromEntries(
            columns.map((column) => [column.id, column.kind === "checkbox" ? false : ""]),
          ),
        })),
      );
      return;
    }

    updateTable(columns, rows.filter((row) => row.id !== rowId));
  };

  const handleAddColumn = () => {
    const nextColumn = createColumn(columns.length);
    const nextColumns = [...columns, nextColumn];
    const nextRows = rows.map((row) => ({
      ...row,
      cells: {
        ...row.cells,
        [nextColumn.id]: "",
      },
    }));

    updateTable(nextColumns, nextRows);
  };

  const handleDeleteColumn = (columnId) => {
    if (columns.length <= 1) {
      const onlyColumn = columns[0];
      updateTable(
        [{ ...onlyColumn, name: "Column 1", kind: "text" }],
        rows.map((row) => ({
          ...row,
          cells: {
            [onlyColumn.id]: "",
          },
        })),
      );
      return;
    }

    const nextColumns = columns.filter((column) => column.id !== columnId);
    const nextRows = rows.map((row) => ({
      ...row,
      cells: Object.fromEntries(
        nextColumns.map((column) => [column.id, row.cells?.[column.id] ?? (column.kind === "checkbox" ? false : "")]),
      ),
    }));

    updateTable(nextColumns, nextRows);
  };

  const handleColumnKindChange = (columnId, nextKind) => {
    const nextColumns = columns.map((column) => (
      column.id === columnId
        ? { ...column, kind: TABLE_COLUMN_KINDS.includes(nextKind) ? nextKind : "text" }
        : column
    ));
    const nextRows = rows.map((row) => ({
      ...row,
      cells: Object.fromEntries(
        nextColumns.map((column) => {
          const previousValue = row.cells?.[column.id];
          return [column.id, normalizeCellValue(column.kind, previousValue)];
        }),
      ),
    }));

    updateTable(nextColumns, nextRows);
  };

  const handleCellKeyDown = (event, rowIndex, columnIndex) => {
    stopInteractiveKey(event);

    if (event.key === "Enter") {
      event.preventDefault();
      const nextRow = rows[rowIndex + 1];

      if (nextRow) {
        focusCell(nextRow.id, columns[columnIndex].id);
      } else {
        handleAddRow();
      }
    }
  };

  const handleCellPaste = (event, rowIndex, columnIndex) => {
    const matrix = parseTsv(event.clipboardData?.getData("text/plain"));

    if (matrix.length === 0 || (matrix.length === 1 && matrix[0].length <= 1)) {
      return;
    }

    event.preventDefault();
    stopInteractiveKey(event);

    const requiredColumnCount = columnIndex + Math.max(...matrix.map((row) => row.length));
    const nextColumns = [...columns];

    while (nextColumns.length < requiredColumnCount) {
      nextColumns.push(createColumn(nextColumns.length));
    }

    const nextRows = [...rows.map((row) => ({
      ...row,
      cells: { ...row.cells },
    }))];
    const requiredRowCount = rowIndex + matrix.length;

    while (nextRows.length < requiredRowCount) {
      nextRows.push(createRow(nextColumns));
    }

    matrix.forEach((cells, pastedRowOffset) => {
      const targetRow = nextRows[rowIndex + pastedRowOffset];

      cells.forEach((cellValue, pastedColumnOffset) => {
        const targetColumn = nextColumns[columnIndex + pastedColumnOffset];

        if (!targetColumn) {
          return;
        }

        targetRow.cells[targetColumn.id] = normalizeCellValue(targetColumn.kind, cellValue);
      });
    });

    updateTable(nextColumns, nextRows);
  };

  return (
    <TileShell
      card={card}
      tileMeta={tileMeta}
      dragVisualDelta={dragVisualTileIdSet?.has(card.id) ? dragVisualDelta : null}
      className="card--table"
      onContextMenu={onContextMenu}
      onHoverChange={onHoverChange}
      onFocusIn={onFocusIn}
      onFocusOut={onFocusOut}
    >
      <div className="card__content">
        <div className={surfaceFrameClassName} {...surfaceGesture}>
          <section className="card__surface card__surface--table" aria-label={card.title || "Table"}>
            <header className="card__table-header">
              <input
                className="card__table-title"
                type="text"
                value={card.title ?? ""}
                placeholder="Untitled table"
                aria-label="Table title"
                onPointerDown={stopInteractivePointer}
                onKeyDown={stopInteractiveKey}
                onChange={(event) => updateExistingCard(card.id, { title: event.target.value })}
              />
              <div className="card__table-actions" onPointerDown={stopInteractivePointer}>
                <button type="button" className="card__table-action" onClick={handleAddColumn}>+ Column</button>
                <button type="button" className="card__table-action" onClick={handleAddRow}>+ Row</button>
              </div>
            </header>

            <div className="card__table-grid-shell" onPointerDown={stopInteractivePointer}>
              <table className="card__table-grid">
                <thead>
                  <tr>
                    {columns.map((column, columnIndex) => (
                      <th key={column.id} className="card__table-head-cell">
                        <div className="card__table-column-meta">
                          <input
                            className="card__table-column-name"
                            type="text"
                            value={column.name}
                            aria-label={`Column ${columnIndex + 1} name`}
                            onKeyDown={stopInteractiveKey}
                            onChange={(event) => updateTable(
                              columns.map((candidate) => (
                                candidate.id === column.id
                                  ? { ...candidate, name: event.target.value }
                                  : candidate
                              )),
                              rows,
                            )}
                          />
                          <button
                            type="button"
                            className="card__table-delete-button"
                            aria-label={`Delete column ${column.name}`}
                            onClick={() => handleDeleteColumn(column.id)}
                          >
                            ×
                          </button>
                        </div>
                        <select
                          className="card__table-column-kind"
                          value={column.kind}
                          aria-label={`Column ${columnIndex + 1} type`}
                          onKeyDown={stopInteractiveKey}
                          onChange={(event) => handleColumnKindChange(column.id, event.target.value)}
                        >
                          {TABLE_COLUMN_KINDS.map((kind) => (
                            <option key={kind} value={kind}>{kind}</option>
                          ))}
                        </select>
                      </th>
                    ))}
                    <th className="card__table-head-cell card__table-head-cell--actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={row.id}>
                      {columns.map((column, columnIndex) => (
                        <td key={`${row.id}:${column.id}`} className="card__table-cell">
                          {column.kind === "checkbox" ? (
                            <label className="card__table-checkbox">
                              <input
                                type="checkbox"
                                checked={row.cells?.[column.id] === true}
                                onPointerDown={stopInteractivePointer}
                                onKeyDown={stopInteractiveKey}
                                onChange={(event) => handleCellChange(row.id, column.id, event.target.checked)}
                              />
                              <span />
                            </label>
                          ) : (
                            <input
                              ref={(node) => {
                                if (node) {
                                  inputRefs.current.set(`${row.id}:${column.id}`, node);
                                } else {
                                  inputRefs.current.delete(`${row.id}:${column.id}`);
                                }
                              }}
                              className="card__table-cell-input"
                              type={column.kind === "number" ? "number" : column.kind === "date" ? "date" : "text"}
                              value={normalizeCellValue(column.kind, row.cells?.[column.id])}
                              onPointerDown={stopInteractivePointer}
                              onKeyDown={(event) => handleCellKeyDown(event, rowIndex, columnIndex)}
                              onPaste={(event) => handleCellPaste(event, rowIndex, columnIndex)}
                              onChange={(event) => handleCellChange(row.id, column.id, event.target.value)}
                            />
                          )}
                        </td>
                      ))}
                      <td className="card__table-cell card__table-cell--actions">
                        <button
                          type="button"
                          className="card__table-delete-button"
                          aria-label={`Delete row ${rowIndex + 1}`}
                          onPointerDown={stopInteractivePointer}
                          onClick={() => handleDeleteRow(row.id)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </TileShell>
  );
}

export default memo(TableTile);
