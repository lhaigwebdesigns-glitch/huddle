import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import "katex/dist/katex.min.css";
import "./styles.css";
import "./editors";
import Home from "./routes/Home";
import RoomPage from "./routes/RoomPage";
import Admin from "./routes/Admin";
import PublicForm from "./routes/PublicForm";
import SharedChat from "./routes/SharedChat";
import { Privacy, Terms } from "./routes/Legal";

function JoinRedirect() {
  const { code = "" } = useParams();
  return <Navigate to={`/r/${code.toUpperCase().replace(/[^A-Z0-9]/g, "")}`} replace />;
}

// Follow the OS theme.
const mq = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => document.documentElement.classList.toggle("dark", mq.matches);
applyTheme();
mq.addEventListener("change", applyTheme);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/j/:code" element={<JoinRedirect />} />
        <Route path="/r/:code" element={<RoomPage />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/f/:code/:id" element={<PublicForm />} />
        <Route path="/s/:id" element={<SharedChat />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
