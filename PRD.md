# Product Requirements Document (PRD) & Development Roadmap
**Product Name:** Kurvo (Web-Based Vector Lineart Engine)
**Document Version:** 1.0

---

## 1. Executive Summary
**Kurvo** is a web-based vector drawing application designed to replicate the highly specialized line-art workflows of desktop software like PaintTool SAI. Unlike standard vector tools (e.g., Illustrator, Figma) that rely on traditional Bézier handles, this application utilizes a proprietary mathematical engine layered over Paper.js. It allows artists to draw dynamic, pressure-sensitive ribbons using Centripetal Catmull-Rom splines that pass directly through user-defined nodes, enabling precise, organic line manipulation and animation directly in the browser.

## 2. Target Audience
* **Digital Artists & Illustrators:** Looking for the specific "SAI-style" curve manipulation on mobile or web devices without installing heavy software.
* **Web Animators & Developers:** Needing to export sequentially animated, variable-width SVG lineart for websites.
* **Vector Enthusiasts:** Users who find standard Bézier curve handles unintuitive and prefer node-through-path routing.

---

## 3. Functional Requirements

### 3.1. Core Tools & Modes
| Tool | Action | Expected Behavior |
| :--- | :--- | :--- |
| **Draw (Pen)** | Click empty space | Adds a node to the active spline. Generates a variable-width polygon ribbon in real-time. |
| **Select (Box)** | Click a curve | Selects the entire path group. Generates a bounding box with 4 corner scale handles and 1 rotation handle. |
| **Edit (Nodes)** | Click a node | Selects a specific node for translation. Dragging moves the curve smoothly. |
| **Edit (Insert)** | Click a curve edge | Splits the curve mathematically and inserts a new node, interpolating the pressure of surrounding nodes. |
| **Edit (Delete)**| Double-click node | Deletes the node and recalculates the spline tension seamlessly. |
| **Pressure** | Drag node horizontally | Scales the specific node's pressure modifier, widening or pinching the ribbon dynamically. |

### 3.2. Canvas & Viewport Controls
* **Zoom:** Mouse wheel scrolls zoom the canvas *towards the cursor's exact coordinates*. Limits: 10% to 1000%.
* **Pan:** Holding `Spacebar` + dragging, or clicking the middle mouse button, translates the viewport.
* **Reset:** A dedicated UI button to reset zoom to 100% and re-center the canvas.

### 3.3. Export & Rendering
* **SVG Export:** Clears all UI handles and exports a clean, headless `.svg` file of the artwork.
* **Animated HTML Export:** Extracts the invisible skeleton paths, generates native CSS `stroke-dasharray` animations sequenced by drawing order, and exports a fully functional standalone `.html` file.

---

## 4. Non-Functional Requirements
* **Technology Stack:** React (UI layer), Paper.js (Canvas DOM / Vector Math), Tailwind CSS (Styling), Lucide React (Iconography).
* **Performance:** Path rendering and ribbon polygon calculation must maintain 60 FPS during node dragging.
* **Responsiveness:** The canvas must dynamically resize to the browser window (`data-paper-resize="true"`).

---

## 5. Development Roadmap

### Phase 1: MVP Foundation (Completed)
* [x] Catmull-Rom spline integration.
* [x] Dynamic variable-width pressure ribbon engine.
* [x] Multi-mode tool architecture (Draw, Select, Edit, Pressure).
* [x] Matrix transformations (Scale/Rotate bounding boxes).
* [x] SVG and CSS-Animated HTML Export.

### Phase 2: Workflow & Control (Next Sprint)
Focuses on the standard quality-of-life features expected in professional drawing tools.
* **Base Brush Size Slider:** UI slider to adjust the default stroke width before drawing.
* **Undo / Redo System:** Implement a history stack utilizing `project.exportJSON()` and `project.importJSON()`.
* **Keyboard Shortcuts:** Global hotkeys (`P` for Pen, `V` for Select, `A` for Nodes, `W` for Pressure, `Ctrl+Z` for Undo).
* **Hover States:** Visual feedback (cursor changes, node enlargement) when hovering over interactable points and bounding box handles.

### Phase 3: Advanced Vector Capabilities
Focuses on giving artists maximum control over complex shapes.
* **Sharp Corners (Cusp Nodes):** Ability to hold `Alt` while clicking a node to break the Catmull-Rom tangent, allowing for sharp angles and zigzags.
* **Close Path (Looping):** Snapping the final node to the first node to create a seamless, closed polygon outline.
* **Layer System:** A UI panel to add, delete, hide, and reorder layers (`bringToFront()`, `sendToBack()`).
* **Boolean Eraser:** A tool to mathematically slice or subtract from the vector ribbons.

### Phase 4: Ecosystem & Sharing (Future Polish)
Focuses on web-specific features.
* **Raster Export:** Export to `.png` with transparent background support.
* **Cloud Save:** Integration with Firebase or Supabase to save JSON vector data to user accounts.
* **Dark Mode:** Canvas and UI theme toggles.
* **Line Styles:** Support for dotted/dashed ribbons by calculating dash intervals along the custom polygon generation math.