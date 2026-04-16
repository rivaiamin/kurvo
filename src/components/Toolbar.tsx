// @ts-nocheck
import { Code, Download, Eraser, Focus, ImagePlus, Maximize2, MousePointer2, Move, Palette, PenTool, Pencil, Play, Redo, Square, Trash2, Undo } from 'lucide-react';
import paper from 'paper';
import React, { useEffect, useRef, useState } from 'react';
import { useEditor } from '../context/EditorContext';
import type { ToolMode } from '../types';

type ToolbarProps = { children: React.ReactNode };

export function Toolbar({ children }: ToolbarProps) {
  const {
    activeTool, setActiveTool,
    currentColor, setCurrentColor,
    brushSize, setBrushSize,
    isAnimating, setIsAnimating,
    setAnimatedPaths, projectRef, resetView,
    undo, redo, canUndo, canRedo, saveHistory,
    selectionRevision
  } = useEditor();

  const referenceFileRef = useRef<HTMLInputElement>(null);
  const [refOpacitySlider, setRefOpacitySlider] = useState(65);

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
      if (!group.data?.isStroke) return;
      (group.children['ribbon'] as paper.Path).fillColor = paperColor;
      (group.children['capStart'] as paper.Path).fillColor = paperColor;
      (group.children['capEnd'] as paper.Path).fillColor = paperColor;
    });
  };

  const handleReferenceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    // Data URL embeds pixels in the string so Paper.js undo/history (importJSON) never reloads a dead blob: URL.
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      (window as any).addReferenceImageFromUrl?.(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const selectedGroup = (window as any).getActiveStrokeGroup?.() as paper.Group | undefined;
  const selectedIsReference = selectedGroup?.data?.isReference;

  useEffect(() => {
    const g = (window as any).getActiveStrokeGroup?.() as paper.Group | undefined;
    if (g?.data?.isReference) {
      setRefOpacitySlider(Math.round((g.opacity ?? 1) * 100));
    }
  }, [selectionRevision, activeTool]);

  const setReferenceOpacity = (pct: number) => {
    const g = (window as any).getActiveStrokeGroup?.();
    if (!g?.data?.isReference) return;
    g.opacity = Math.max(0.05, Math.min(1, pct / 100));
    paper.view?.draw();
  };

  const switchTool = (tool: ToolMode) => {
    if (isAnimating) return;
    setActiveTool(tool);
    if ((window as any).clearPaperSelection) (window as any).clearPaperSelection();
  };

  const handleClearLayer = () => {
    if (isAnimating) return;
    if (!projectRef.current?.activeLayer) return;

    const ok = window.confirm('Clear the current layer? This will remove all items on it.');
    if (!ok) return;

    projectRef.current.activeLayer.removeChildren();
    saveHistory();
    switchTool('draw');
  };

  const handleExportSVG = () => {
    if ((window as any).clearPaperSelection) (window as any).clearPaperSelection();
    if (!projectRef.current) return;
    const refLayer = projectRef.current.layers.find((l) => l.name === '__reference');
    const refWasVisible = refLayer?.visible;
    if (refLayer) refLayer.visible = false;
    const svgString = projectRef.current.exportSVG({ asString: true }) as string;
    if (refLayer) refLayer.visible = refWasVisible ?? true;
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

  const toolBtn = (active: boolean) =>
    `shrink-0 rounded p-2 md:px-3 md:py-1.5 text-sm font-medium flex items-center justify-center gap-0 md:gap-2 transition-all ${
      active ? 'bg-white shadow text-indigo-600' : 'text-slate-500'
    }`;

  return (
    <div className="grid min-h-0 w-full flex-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
      <header className="relative z-20 flex min-h-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2.5 shadow-sm md:px-4 pt-[max(0.625rem,env(safe-area-inset-top,0px))]">
        <div className="min-w-0 shrink">
          <span className="text-lg font-bold tracking-tight text-slate-900 md:text-xl">
            Kurvo
          </span>
        </div>
        <div className="flex min-w-0 flex-1 justify-end">
          <div className="flex max-w-full items-center justify-end gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] md:gap-2 md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden">
            <button
              onClick={toggleAnimation}
              className={`flex shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium shadow-sm transition-all md:px-4 ${isAnimating ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-slate-800 text-white hover:bg-slate-900'}`}
              title={isAnimating ? 'Stop animation' : 'Play drawing animation'}
            >
              {isAnimating ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
              <span className="hidden sm:inline">{isAnimating ? 'Stop' : 'Play'}</span>
            </button>

            <div className="mx-0.5 hidden h-6 w-px shrink-0 bg-slate-200 sm:block" />
            <button
              onClick={handleExportSVG}
              className={`flex shrink-0 items-center gap-1.5 rounded-md bg-indigo-600 px-2.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 md:gap-2 md:px-4 ${isAnimating ? 'pointer-events-none opacity-50' : ''}`}
              title="Export SVG"
            >
              <Download size={16} /> <span className="hidden md:inline">Export SVG</span>
            </button>
            <button
              onClick={handleExportAnimatedHTML}
              className={`flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 md:gap-2 md:px-4 ${isAnimating ? 'pointer-events-none opacity-50' : ''}`}
              title="Export standalone animated HTML file"
            >
              <Code size={16} /> <span className="hidden md:inline">Export HTML</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile tool mode dock (vertical, right side). Keeps bottom bar compact. */}
      <div
        className={`md:hidden fixed right-0 z-40 flex w-fit flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg ring-1 ring-black/5
          mr-3 bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)] mb-2 ${isAnimating ? 'opacity-50 pointer-events-none' : ''}`}
        aria-label="Tool mode"
      >
        <button onClick={() => switchTool('draw')} className={toolBtn(activeTool === 'draw')} title="Draw (Z)" aria-label="Draw">
          <PenTool size={16} />
        </button>
        <button onClick={() => switchTool('freestyle')} className={toolBtn(activeTool === 'freestyle')} title="Freestyle pen (P)" aria-label="Freestyle pen">
          <Pencil size={16} />
        </button>
        <button onClick={() => switchTool('select')} className={toolBtn(activeTool === 'select')} title="Select Box (X)" aria-label="Select box">
          <MousePointer2 size={16} />
        </button>
        <button onClick={() => switchTool('edit')} className={toolBtn(activeTool === 'edit')} title="Edit Nodes (C)" aria-label="Edit nodes">
          <Move size={16} />
        </button>
        <button onClick={() => switchTool('pressure')} className={toolBtn(activeTool === 'pressure')} title="Pressure (V)" aria-label="Pressure">
          <Maximize2 size={16} />
        </button>
        <button onClick={() => switchTool('eraser')} className={toolBtn(activeTool === 'eraser')} title="Boolean Eraser (E)" aria-label="Eraser">
          <Eraser size={16} />
        </button>
      </div>

      <div className="relative min-h-0 min-w-0 overflow-hidden">{children}</div>

      <div className="relative z-10 flex min-h-0 shrink-0 items-center border-t border-slate-200 bg-white p-2 shadow-[0_-4px_6px_-1px_rgb(0_0_0_/_0.06)] md:flex-row md:flex-wrap md:justify-between md:p-4 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] md:flex-none md:gap-4 md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden">
        <div className={`hidden md:flex shrink-0 gap-0.5 rounded-md border bg-slate-100 p-1 ${isAnimating ? 'pointer-events-none opacity-50' : ''}`}>
          <button onClick={() => switchTool('draw')} className={toolBtn(activeTool === 'draw')} title="Draw (Z)">
            <PenTool size={16} /> <span className="hidden md:inline">Draw</span>
          </button>
          <button onClick={() => switchTool('freestyle')} className={toolBtn(activeTool === 'freestyle')} title="Freestyle pen (P)">
            <Pencil size={16} /> <span className="hidden md:inline">Freestyle</span>
          </button>
          <button onClick={() => switchTool('select')} className={toolBtn(activeTool === 'select')} title="Select Box (X)">
            <MousePointer2 size={16} /> <span className="hidden md:inline">Select Box</span>
          </button>
          <button onClick={() => switchTool('edit')} className={toolBtn(activeTool === 'edit')} title="Edit Nodes (C)">
            <Move size={16} /> <span className="hidden md:inline">Edit Nodes</span>
          </button>
          <button onClick={() => switchTool('pressure')} className={toolBtn(activeTool === 'pressure')} title="Pressure (V)">
            <Maximize2 size={16} /> <span className="hidden md:inline">Pressure</span>
          </button>
          <button onClick={() => switchTool('eraser')} className={toolBtn(activeTool === 'eraser')} title="Boolean Eraser (E)">
            <Eraser size={16} /> <span className="hidden md:inline">Eraser</span>
          </button>
        </div>

        <div className={`flex shrink-0 items-center gap-1 rounded-md border bg-slate-100 px-2 py-1 md:gap-2 md:px-3 ${isAnimating ? 'pointer-events-none opacity-50' : ''}`}>
          <button onClick={undo} className={`p-1 transition-colors ${canUndo ? 'text-slate-700 hover:text-indigo-600' : 'pointer-events-none text-slate-300'}`} title="Undo (Ctrl+Z)"><Undo size={16} /></button>
          <button onClick={redo} className={`p-1 transition-colors ${canRedo ? 'text-slate-700 hover:text-indigo-600' : 'pointer-events-none text-slate-300'}`} title="Redo (Ctrl+Shift+Z)"><Redo size={16} /></button>
        </div>

        <button
          onClick={handleClearLayer}
          className={`flex shrink-0 items-center gap-2 rounded-md border bg-slate-100 p-2 text-sm font-medium text-red-600 transition-all hover:bg-red-50 md:px-3 md:py-1.5 ${isAnimating ? 'pointer-events-none opacity-50' : ''}`}
          title="Clear layer"
        >
          <Trash2 size={16} /> <span className="hidden md:inline">Clear</span>
        </button>

        <div className={`flex shrink-0 items-center gap-1.5 rounded-md border bg-slate-100 px-2 py-1 md:gap-2 md:px-3 ${isAnimating ? 'pointer-events-none opacity-50' : ''}`}>
          <Palette size={16} className="shrink-0 text-slate-500" />
          <input type="color" value={currentColor} onChange={handleColorChange} className="h-7 w-7 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0 md:h-6 md:w-6" />

          <div className="mx-0.5 hidden h-4 w-px bg-slate-300 sm:block" />

          <span className="w-4 shrink-0 text-center text-xs font-semibold text-slate-500">{brushSize}</span>
          <input
            type="range"
            min="1" max="25"
            value={brushSize}
            onChange={(e) => setBrushSize(parseInt(e.target.value))}
            className="w-16 shrink-0 cursor-pointer accent-indigo-600 md:w-24"
            title="Base Brush Size"
          />
        </div>

        <button onClick={resetView} className="flex shrink-0 items-center gap-2 rounded-md border bg-slate-100 p-2 text-sm font-medium text-slate-500 transition-all hover:bg-white hover:text-indigo-600 md:px-3 md:py-1.5" title="Reset Zoom/Pan">
          <Focus size={16} /> <span className="hidden md:inline">Reset View</span>
        </button>

        <input
          ref={referenceFileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleReferenceFile}
        />
        <button
          type="button"
          onClick={() => referenceFileRef.current?.click()}
          className={`flex shrink-0 items-center gap-2 rounded-md border bg-slate-100 p-2 text-sm font-medium text-slate-600 transition-all hover:bg-white hover:text-indigo-600 md:px-3 md:py-1.5 ${isAnimating ? 'pointer-events-none opacity-50' : ''}`}
          title="Place a local image under your artwork (not uploaded). Use Select tool to move, scale, or rotate; Alt+click selects it when covered by strokes."
        >
          <ImagePlus size={16} /> <span className="hidden md:inline">Reference image</span>
        </button>

        {activeTool === 'select' && selectedIsReference && (
          <label className={`flex min-w-[10rem] shrink-0 items-center gap-1.5 text-xs text-slate-600 md:gap-2 ${isAnimating ? 'pointer-events-none opacity-50' : ''}`}>
            <span className="hidden font-medium whitespace-nowrap sm:inline">Ref opacity</span>
            <input
              type="range"
              min="5"
              max="100"
              value={refOpacitySlider}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setRefOpacitySlider(v);
                setReferenceOpacity(v);
              }}
              onMouseUp={() => saveHistory()}
              onBlur={() => saveHistory()}
              className="w-16 shrink-0 cursor-pointer accent-indigo-600 md:w-20"
              title="Reference opacity"
            />
            <span className="w-6 shrink-0 tabular-nums">{refOpacitySlider}</span>
          </label>
        )}
      </div>
      </div>
    </div>
  );
}
