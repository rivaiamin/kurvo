// @ts-nocheck
import { Code, Download, Eraser, Focus, Maximize2, MousePointer2, Move, Palette, PenTool, Play, Redo, Square, Trash2, Undo } from 'lucide-react';
import paper from 'paper';
import React from 'react';
import { useEditor } from '../context/EditorContext';
import type { ToolMode } from '../types';

export function Toolbar() {
  const {
    activeTool, setActiveTool,
    currentColor, setCurrentColor,
    brushSize, setBrushSize,
    isAnimating, setIsAnimating,
    setAnimatedPaths, projectRef, resetView,
    undo, redo, canUndo, canRedo, saveHistory
  } = useEditor();

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    setCurrentColor(color);
    if (!projectRef.current) return;
    const paperColor = new paper.Color(color);
    const groups = new Set<paper.Group>();
    projectRef.current.getItems({ name: 'skeleton', selected: true }).forEach((skel) => {
      if (skel.parent?.data?.isStroke) groups.add(skel.parent as paper.Group);
    });
    const active = (window as any).getActiveStrokeGroup?.();
    if (active?.data?.isStroke) groups.add(active);
    groups.forEach((group) => {
      (group.children['ribbon'] as paper.Path).fillColor = paperColor;
      (group.children['capStart'] as paper.Path).fillColor = paperColor;
      (group.children['capEnd'] as paper.Path).fillColor = paperColor;
    });
  };

  const switchTool = (tool: ToolMode) => {
    if (isAnimating) return;
    setActiveTool(tool);
    if ((window as any).clearPaperSelection) (window as any).clearPaperSelection();
  };

  const handleExportSVG = () => {
    if ((window as any).clearPaperSelection) (window as any).clearPaperSelection();
    if (!projectRef.current) return;
    const svgString = projectRef.current.exportSVG({ asString: true }) as string;
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'sai-vector-pro.svg'; link.click();
  };

  const handleExportAnimatedHTML = () => {
    if ((window as any).clearPaperSelection) (window as any).clearPaperSelection();
    if (!projectRef.current) return;
    const skeletons = projectRef.current.getItems({ name: 'skeleton' }) as paper.Path[];
    if (skeletons.length === 0) return;

    const width = projectRef.current.view.viewSize.width;
    const height = projectRef.current.view.viewSize.height;

    let defsHTML = '';
    let pathsHTML = '';
    skeletons.forEach((skel, index) => {
      const group = skel.parent;
      const color = (group.children['ribbon'].fillColor as paper.Color).toCSS(true);
      const strokeWidth = (skel.data.baseWidth || 4) * 2;
      const length = skel.length;

      const ribbon = group.children['ribbon'] as paper.Path;
      const capStart = group.children['capStart'] as paper.Path;
      const capEnd = group.children['capEnd'] as paper.Path;
      const maskId = `mask-${skel.id}`;
      const closed = !!skel.closed;

      defsHTML += `
      <mask id="${maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">
        <rect x="0" y="0" width="${width}" height="${height}" fill="black" />
        <path d="${ribbon.pathData}" fill="white" />
        ${closed ? '' : `<path d="${capStart.pathData}" fill="white" />
        <path d="${capEnd.pathData}" fill="white" />`}
      </mask>`;

      pathsHTML += `
      <path
        d="${skel.pathData}"
        fill="none"
        stroke="${color}"
        stroke-width="${strokeWidth}"
        stroke-linecap="round"
        stroke-linejoin="round"
        mask="url(#${maskId})"
        class="animate-draw"
        style="--path-length: ${length}; stroke-dasharray: ${length}; stroke-dashoffset: ${length}; animation-delay: ${index * 0.4}s"
      />`;
    });

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Animated Vector Drawing</title>
<style>
  body { display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background-color: #f8fafc; }
  .animated-canvas { max-width: 100%; max-height: 100vh; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); background: white; }
  @keyframes drawSVGPath { 0% { stroke-dashoffset: var(--path-length); } 100% { stroke-dashoffset: 0; } }
  .animate-draw { animation: drawSVGPath 1.2s ease-in-out forwards; }
</style>
</head>
<body>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="animated-canvas">
    <defs>
      ${defsHTML}
    </defs>
    ${pathsHTML}
  </svg>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'animated-drawing.html'; link.click();
    URL.revokeObjectURL(url);
  };

  const toggleAnimation = () => {
    if (isAnimating) {
      setIsAnimating(false);
      return;
    }

    if ((window as any).clearPaperSelection) (window as any).clearPaperSelection();
    if (!projectRef.current) return;

    const skeletons = projectRef.current.getItems({ name: 'skeleton' }) as paper.Path[];
    const pathsData = skeletons.map(skel => {
      const group = skel.parent;
      const color = (group.children['ribbon'].fillColor as paper.Color).toCSS(true);
      const width = (skel.data.baseWidth || 4) * 2;

      const ribbon = group.children['ribbon'] as paper.Path;
      const capStart = group.children['capStart'] as paper.Path;
      const capEnd = group.children['capEnd'] as paper.Path;

      const closed = !!skel.closed;
      return {
        id: skel.id,
        d: skel.pathData,
        color: color,
        length: skel.length,
        width: width,
        closed,
        mask: closed
          ? { ribbonD: ribbon.pathData }
          : {
              ribbonD: ribbon.pathData,
              capStartD: capStart.pathData,
              capEndD: capEnd.pathData
            }
      };
    });

    setAnimatedPaths(pathsData);
    setIsAnimating(true);
  };

  return (
    <div className="flex flex-wrap items-center justify-between p-4 bg-white shadow-sm border-b z-10 relative">
      <div className="flex items-center gap-4">
        <div className={`flex bg-slate-100 p-1 rounded-md border ${isAnimating ? 'opacity-50 pointer-events-none' : ''}`}>
          <button onClick={() => switchTool('draw')} className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 transition-all ${activeTool === 'draw' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`} title="Draw (Z)">
            <PenTool size={16} /> Draw
          </button>
          <button onClick={() => switchTool('select')} className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 transition-all ${activeTool === 'select' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`} title="Select Box (X)">
            <MousePointer2 size={16} /> Select Box
          </button>
          <button onClick={() => switchTool('edit')} className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 transition-all ${activeTool === 'edit' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`} title="Edit Nodes (C)">
            <Move size={16} /> Edit Nodes
          </button>
          <button onClick={() => switchTool('pressure')} className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 transition-all ${activeTool === 'pressure' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`} title="Pressure (V)">
            <Maximize2 size={16} /> Pressure
          </button>
          <button onClick={() => switchTool('eraser')} className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 transition-all ${activeTool === 'eraser' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`} title="Boolean Eraser (E)">
            <Eraser size={16} /> Eraser
          </button>
        </div>

        <div className={`flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-md border ${isAnimating ? 'opacity-50 pointer-events-none' : ''}`}>
          <button onClick={undo} className={`p-1 transition-colors ${canUndo ? 'text-slate-700 hover:text-indigo-600' : 'text-slate-300 pointer-events-none'}`} title="Undo (Ctrl+Z)"><Undo size={16} /></button>
          <button onClick={redo} className={`p-1 transition-colors ${canRedo ? 'text-slate-700 hover:text-indigo-600' : 'text-slate-300 pointer-events-none'}`} title="Redo (Ctrl+Shift+Z)"><Redo size={16} /></button>
        </div>

        <div className={`flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-md border ${isAnimating ? 'opacity-50 pointer-events-none' : ''}`}>
          <Palette size={16} className="text-slate-500" />
          <input type="color" value={currentColor} onChange={handleColorChange} className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer rounded-full" />

          <div className="w-px h-4 bg-slate-300 mx-1"></div>

          <span className="text-xs font-semibold text-slate-500 w-4 text-center">{brushSize}</span>
          <input
            type="range"
            min="1" max="25"
            value={brushSize}
            onChange={(e) => setBrushSize(parseInt(e.target.value))}
            className="w-24 cursor-pointer accent-indigo-600"
            title="Base Brush Size"
          />
        </div>

        <button onClick={resetView} className="px-3 py-1.5 bg-slate-100 rounded-md border text-slate-500 hover:text-indigo-600 hover:bg-white transition-all flex items-center gap-2 text-sm font-medium" title="Reset Zoom/Pan">
          <Focus size={16} /> <span className="hidden md:inline">Reset View</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-2 md:mt-0">
        <button
          onClick={toggleAnimation}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium shadow-sm transition-all ${isAnimating ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-slate-800 text-white hover:bg-slate-900'}`}
        >
          {isAnimating ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          {isAnimating ? 'Stop Animation' : 'Play Drawing'}
        </button>

        <div className="w-px h-6 bg-slate-200 mx-1 hidden md:block"></div>

        <button onClick={() => { if (projectRef.current?.activeLayer) { projectRef.current.activeLayer.removeChildren(); saveHistory(); switchTool('draw'); } }} className={`p-2 text-red-500 hover:bg-red-50 rounded-md ${isAnimating ? 'opacity-50 pointer-events-none' : ''}`}>
          <Trash2 size={20} />
        </button>
        <button onClick={handleExportSVG} className={`flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium shadow-sm hover:bg-indigo-700 ${isAnimating ? 'opacity-50 pointer-events-none' : ''}`}>
          <Download size={16} /> Export SVG
        </button>
        <button onClick={handleExportAnimatedHTML} className={`flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium shadow-sm hover:bg-emerald-700 ${isAnimating ? 'opacity-50 pointer-events-none' : ''}`} title="Export standalone animated HTML file">
          <Code size={16} /> Export HTML
        </button>
      </div>
    </div>
  );
}
