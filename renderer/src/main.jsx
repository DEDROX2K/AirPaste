import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppProvider } from "./context/AppProvider";
import { LogProvider } from "./context/LogProvider";
import { ToastProvider } from "./context/ToastProvider";
import "./index.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <StrictMode>
    <LogProvider>
      <ToastProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </ToastProvider>
    </LogProvider>
  </StrictMode>,
);
