import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "dockview-react/dist/styles/dockview.css";
import "@nexfem/ui/tokens.css";
import "./styles.css";
import { App } from "./App.tsx";
import { t } from "./i18n/index.ts";
import { useModel } from "./stores/model.ts";
import { useUi } from "./stores/ui.ts";

document.documentElement.dataset.theme = useUi.getState().theme;
useUi.getState().log("info", t().fmt(t().log.ready, { name: useModel.getState().model.name }));

// Truy cập trạng thái từ kiểm thử e2e và DevTools.
Object.assign(window, { __nexfem: { ui: useUi, model: useModel } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
