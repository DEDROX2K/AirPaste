import { memo, useMemo, useState } from "react";

const HISTORY_LIMIT = 5;
const OPERATOR_SET = new Set(["+", "-", "×", "÷"]);

function isDigitToken(value) {
  return /^[0-9]$/.test(value);
}

function isOperatorToken(value) {
  return OPERATOR_SET.has(value);
}

function getCurrentNumberSegment(expression) {
  const segments = String(expression ?? "").split(/[+\-×÷]/);
  return segments[segments.length - 1] ?? "";
}

function formatResultNumber(value) {
  if (!Number.isFinite(value)) {
    throw new Error("Invalid calculation");
  }

  const rounded = Math.round((value + Number.EPSILON) * 1_000_000_000) / 1_000_000_000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function tokenizeExpression(expression) {
  const normalized = String(expression ?? "").trim();
  const tokens = [];
  let currentNumber = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];

    if (/[0-9.]/.test(character)) {
      currentNumber += character;
      continue;
    }

    if (!/[+\-*/]/.test(character)) {
      throw new Error("Unsupported input");
    }

    if (
      character === "-"
      && currentNumber.length === 0
      && (tokens.length === 0 || typeof tokens[tokens.length - 1] === "string")
    ) {
      currentNumber = "-";
      continue;
    }

    if (currentNumber.length === 0 || currentNumber === "-") {
      throw new Error("Incomplete expression");
    }

    tokens.push(Number(currentNumber));
    tokens.push(character);
    currentNumber = "";
  }

  if (currentNumber.length === 0 || currentNumber === "-") {
    throw new Error("Incomplete expression");
  }

  tokens.push(Number(currentNumber));
  return tokens;
}

function evaluateBasicExpression(expression) {
  const normalized = String(expression ?? "")
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .trim();

  if (!normalized) {
    return "0";
  }

  const tokens = tokenizeExpression(normalized);
  const values = [];
  const operators = [];
  const precedence = { "+": 1, "-": 1, "*": 2, "/": 2 };

  const applyTopOperator = () => {
    const operator = operators.pop();
    const right = values.pop();
    const left = values.pop();

    if (!Number.isFinite(left) || !Number.isFinite(right) || !operator) {
      throw new Error("Incomplete expression");
    }

    if (operator === "+") {
      values.push(left + right);
      return;
    }

    if (operator === "-") {
      values.push(left - right);
      return;
    }

    if (operator === "*") {
      values.push(left * right);
      return;
    }

    if (right === 0) {
      throw new Error("Cannot divide by zero");
    }

    values.push(left / right);
  };

  tokens.forEach((token) => {
    if (typeof token === "number") {
      values.push(token);
      return;
    }

    while (
      operators.length > 0
      && precedence[operators[operators.length - 1]] >= precedence[token]
    ) {
      applyTopOperator();
    }

    operators.push(token);
  });

  while (operators.length > 0) {
    applyTopOperator();
  }

  if (values.length !== 1) {
    throw new Error("Invalid calculation");
  }

  return formatResultNumber(values[0]);
}

function CanvasCalculator({ isOpen = true }) {
  const [expression, setExpression] = useState("0");
  const [history, setHistory] = useState([]);
  const [isResultState, setIsResultState] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const historyItems = useMemo(
    () => history.slice(0, HISTORY_LIMIT),
    [history],
  );

  const appendToken = (token) => {
    setExpression((currentExpression) => {
      const safeExpression = String(currentExpression ?? "0");

      if (isDigitToken(token)) {
        if (isResultState || safeExpression === "0") {
          return token;
        }

        return `${safeExpression}${token}`;
      }

      if (token === ".") {
        if (isResultState) {
          return "0.";
        }

        const currentSegment = getCurrentNumberSegment(safeExpression);

        if (currentSegment.includes(".")) {
          return safeExpression;
        }

        if (safeExpression === "0" || isOperatorToken(safeExpression.at(-1))) {
          return `${safeExpression === "0" ? "" : safeExpression}0.`;
        }

        return `${safeExpression}.`;
      }

      if (isOperatorToken(token)) {
        if (safeExpression === "0" && token !== "-") {
          return safeExpression;
        }

        if (safeExpression === "0" && token === "-") {
          return "-";
        }

        if (isOperatorToken(safeExpression.at(-1))) {
          return `${safeExpression.slice(0, -1)}${token}`;
        }

        return `${safeExpression}${token}`;
      }

      return safeExpression;
    });

    setErrorMessage("");
    setIsResultState(false);
  };

  const clearExpression = () => {
    setExpression("0");
    setErrorMessage("");
    setIsResultState(false);
  };

  const evaluateExpression = () => {
    try {
      if (isOperatorToken(expression.at(-1))) {
        return;
      }

      const result = evaluateBasicExpression(expression);
      const receipt = `${expression} = ${result}`;

      setHistory((currentHistory) => [
        { id: `${Date.now()}-${currentHistory.length}`, expression, result },
        ...currentHistory,
      ].slice(0, HISTORY_LIMIT));
      setExpression(result);
      setErrorMessage("");
      setIsResultState(true);
      return receipt;
    } catch (error) {
      setErrorMessage(error?.message || "Calculation error");
      setIsResultState(true);
      return null;
    }
  };

  const keypadRows = [
    ["7", "8", "9", "÷"],
    ["4", "5", "6", "×"],
    ["1", "2", "3", "-"],
    ["0", ".", "=", "+"],
  ];

  return (
    <aside
      className={`canvas-calculator${isOpen ? " is-open" : " is-closed"}`}
      aria-label="Canvas calculator"
      aria-hidden={!isOpen}
    >
      <div className="canvas-calculator__receipt-shell">
        <div className="canvas-calculator__receipt-header">
          <span className="canvas-calculator__receipt-label">Receipt</span>
          <button
            type="button"
            className="canvas-calculator__receipt-clear"
            onClick={() => setHistory([])}
            disabled={historyItems.length === 0}
          >
            Clear
          </button>
        </div>
        <div className="canvas-calculator__receipt-list" role="log" aria-live="polite">
          {historyItems.length > 0 ? (
            historyItems.map((entry) => (
              <p key={entry.id} className="canvas-calculator__receipt-item">
                <span>{entry.expression}</span>
                <span>= {entry.result}</span>
              </p>
            ))
          ) : (
            <p className="canvas-calculator__receipt-empty">No calculations yet.</p>
          )}
        </div>
      </div>

      <div className="canvas-calculator__shell">
        <div className="canvas-calculator__display-frame">
          <div className="canvas-calculator__display" aria-live="polite">
            <span className="canvas-calculator__display-text">
              {errorMessage || expression}
            </span>
            <button
              type="button"
              className="canvas-calculator__display-reset"
              onClick={clearExpression}
              aria-label="Clear current expression"
              title="Clear"
            />
          </div>
        </div>

        <div className="canvas-calculator__keypad">
          {keypadRows.flat().map((token) => (
            <button
              key={token}
              type="button"
              className={`canvas-calculator__key${token === "=" ? " canvas-calculator__key--equals" : ""}${isOperatorToken(token) ? " canvas-calculator__key--operator" : ""}`}
              onClick={() => {
                if (token === "=") {
                  evaluateExpression();
                  return;
                }

                appendToken(token);
              }}
            >
              {token}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

export default memo(CanvasCalculator);
