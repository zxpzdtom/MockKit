import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

try {
  const root = document.getElementById("root");
  if (!root) throw new Error("没有找到 React 挂载节点 #root");

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} catch (error) {
  document.body.innerHTML = `<pre class="fatal-error">${String(error)}</pre>`;
}
