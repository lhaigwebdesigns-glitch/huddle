import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import "@fontsource-variable/inter/opsz.css";
import "katex/dist/katex.min.css";
import { initTheme } from "./lib/theme";
import "./styles.css";
import "./editors";
import Home from "./routes/Home";
import RoomPage from "./routes/RoomPage";
// Admin (with its charts) loads only when someone opens /admin.
const Admin = lazy(() => import("./routes/Admin"));
// Teacher pages load on first use.
const ClassesPage = lazy(() => import("./routes/Classes").then((m) => ({ default: m.ClassesPage })));
const ClassPage = lazy(() => import("./routes/Classes").then((m) => ({ default: m.ClassPage })));
const Grading = lazy(() => import("./routes/Grading"));
import StudentClass from "./routes/StudentClass";
import Dashboard from "./routes/Dashboard";
import PublicForm from "./routes/PublicForm";
import SharedChat from "./routes/SharedChat";
import { Privacy, Terms } from "./routes/Legal";

function JoinRedirect() {
  const { code = "" } = useParams();
  return <Navigate to={`/r/${code.toUpperCase().replace(/[^A-Z0-9]/g, "")}`} replace />;
}

// Light / dark / follow the OS (choice stored per browser).
initTheme();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/j/:code" element={<JoinRedirect />} />
        <Route path="/r/:code" element={<RoomPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile" element={<Dashboard view="profile" />} />
        <Route path="/admin" element={<Suspense fallback={null}><Admin /></Suspense>} />
        <Route path="/f/:code/:id" element={<PublicForm />} />
        <Route path="/classes" element={<Suspense fallback={null}><ClassesPage /></Suspense>} />
        <Route path="/classes/:id" element={<Suspense fallback={null}><ClassPage /></Suspense>} />
        <Route path="/classes/:id/a/:aid/:room" element={<Suspense fallback={null}><Grading /></Suspense>} />
        <Route path="/c/:code" element={<StudentClass />} />
        <Route path="/c/:code/a/:aid" element={<StudentClass />} />
        <Route path="/s/:id" element={<SharedChat />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
