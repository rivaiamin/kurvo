# Kurvo - Web-Based Vector Lineart Engine

**Kurvo** is a highly specialized web-based vector drawing application designed to replicate the organic, variable-width line-art workflows of desktop software like PaintTool SAI. Unlike standard Bézier curve designers, Kurvo leverages a proprietary mathematical engine over **Paper.js** to draw dynamic ribbons using Centripetal Catmull-Rom splines, which pass directly through user-defined nodes.

![Vector Lineart Engine](./public/vite.svg)

## Target Audience
- **Digital Artists & Illustrators** looking for familiar curve manipulation on the web completely free of heavy native desktop application installations.
- **Web Animators & Developers** needing to export CSS-sequenced SVG logic directly into websites for scroll-animations or vector storytelling.
- **Vector Enthusiasts** who find traditional vector handles unintuitive and prefer path-through-node routing logic.

---

## Core Features

- **Dynamic Ribbon Drawing:** Click to add nodes; the engine generates a smooth ribbon polygon responding magically to node pressure values.
- **Select & Transform:** Drag a box bounding select to scale (uniformly with shift) and rotate entire vector splines. 
- **Node Editing (Curve Slicing):** Seamlessly isolate nodes, drag to reshape curves without breaking tangents, and click empty curve rims to instantly split paths mathematically.
- **Per-Node Pressure Control:** Drag nodes horizontally to visually expand or pinch the exact radius of the line.
- **CSS SVG Animation Export:** Generate standalone HTML files showcasing what you drew fully animated via CSS natively, sequencing lines accurately.

---

## Tech Stack

This project was intentionally migrated off standard mobile-wrappers (like Expo) to maximize direct DOM 60 FPS performance and maintain accurate canvas pointer handling.

- **Frontend Build Tool:** [Vite](https://vitejs.dev/)
- **UI Framework:** [React (TypeScript)](https://react.dev/)
- **Vector Math & Canvas Engine:** [Paper.js](http://paperjs.org/)
- **Styling framework:** [Tailwind CSS](https://tailwindcss.com/)
- **Iconography:** [Lucide React](https://lucide.dev/)

---

## Getting Started

### 1. Installation
Clone the repository, then install requirements via your node package manager:
```bash
git clone https://github.com/rivaiamin/kurvo.git
cd kurvo
npm install
```

### 2. Running Locally
Boot the Vite dev server for instant Hot Module Replacement (HMR):
```bash
npm run dev
```

### 3. Production Build
Package and minify the application into standard assets:
```bash
npm run build
```

---

## Directory Structure
- `src/hooks/usePaperEngine.ts` — The decoupled Canvas interaction layer mapping native Paper.js commands into the React ecosystem.
- `src/components/` — Isolated UI and canvas components rendering standard Tailwind directives.
- `src/context/` — State orchestration layer synchronizing drawing tools and global colors natively.

---

*This application fulfills MVP specifications according to Version 1.0 of the Kurvo Vector Engine PRD.*
