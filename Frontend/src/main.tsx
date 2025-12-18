import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

console.log("[FRONTEND] App booting...");

window.onerror = (msg, url, line, col, err) => {
  console.error("[FRONTEND ERROR]", { msg, url, line, col, err });
};

createRoot(document.getElementById("root")!).render(<App />);
