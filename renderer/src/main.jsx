import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppProvider } from "./context/AppProvider";
import { LogProvider } from "./context/LogProvider";
import { TabProvider } from "./context/TabProvider";
import { ToastProvider } from "./context/ToastProvider";
import "./index.css";
import "./design/index.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <StrictMode>
    <LogProvider>
      <ToastProvider>
        <TabProvider>
          <AppProvider>
            <App />
          </AppProvider>
        </TabProvider>
      </ToastProvider>
    </LogProvider>
  </StrictMode>,
);
