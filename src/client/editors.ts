/**
 * Registers the lazily-loaded editor for each file kind. Imported once from main.tsx;
 * each editor's code is only downloaded when someone opens a file of that kind.
 */
import { registerEditor } from "./components/FilePanel";

registerEditor("sheet", () => import("./components/SheetEditor"));
registerEditor("slides", () => import("./components/SlidesEditor"));
registerEditor("whiteboard", () => import("./components/WhiteboardEditor"));
registerEditor("form", () => import("./components/FormEditor"));
