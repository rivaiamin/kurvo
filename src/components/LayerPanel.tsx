// @ts-nocheck
import { ChevronDown, ChevronUp, Eye, EyeOff, Layers, Plus, Trash2, X } from 'lucide-react';
import paper from 'paper';
import React, { useEffect, useState } from 'react';
import { useEditor } from '../context/EditorContext';

export function LayerPanel() {
  const { projectRef, projectRevision, bumpProjectRevision, isAnimating, saveHistory } = useEditor();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const project = projectRef.current;
  const layers = (project?.layers ?? []).filter((l) => l.name !== '__ui' && l.name !== '__reference');
  const referenceLayer = project?.layers.find((l) => l.name === '__reference');
  const referenceGroups =
    referenceLayer?.children.filter((c) => c instanceof paper.Group && c.data?.isReference) ?? [];

  const normalizeLayerOrder = () => {
    if (!projectRef.current) return;
    const ref = projectRef.current.layers.find((l) => l.name === '__reference');
    const ui = projectRef.current.layers.find((l) => l.name === '__ui');
    if (ref) ref.sendToBack();
    if (ui) ui.bringToFront();
  };

  const activateLayer = (layer: paper.Layer) => {
    layer.activate();
    bumpProjectRevision();
  };

  const addLayer = () => {
    if (!projectRef.current) return;
    const n = projectRef.current.layers.filter((l) => l.name !== '__ui' && l.name !== '__reference').length + 1;
    const layer = new paper.Layer({ name: `Layer ${n}` });
    layer.activate();
    normalizeLayerOrder();
    bumpProjectRevision();
  };

  const deleteLayer = (layer: paper.Layer) => {
    if (!projectRef.current) return;
    const drawable = projectRef.current.layers.filter((l) => l.name !== '__ui' && l.name !== '__reference');
    if (drawable.length <= 1) return;
    const p = projectRef.current;
    const wasActive = layer === p.activeLayer;
    layer.remove();
    if (wasActive && p.layers.length > 0) {
      const top = p.layers.filter((l) => l.name !== '__ui' && l.name !== '__reference').pop();
      if (top) top.activate();
    }
    normalizeLayerOrder();
    bumpProjectRevision();
  };

  const toggleVisible = (layer: paper.Layer) => {
    layer.visible = !layer.visible;
    bumpProjectRevision();
  };

  const moveForward = (layer: paper.Layer) => {
    if (!project) return;
    const drawable = project.layers.filter((l) => l.name !== '__ui' && l.name !== '__reference');
    const idx = drawable.indexOf(layer);
    if (idx < 0 || idx >= drawable.length - 1) return;
    layer.insertAbove(drawable[idx + 1]);
    normalizeLayerOrder();
    bumpProjectRevision();
  };

  const moveBackward = (layer: paper.Layer) => {
    if (!project) return;
    const drawable = project.layers.filter((l) => l.name !== '__ui' && l.name !== '__reference');
    const idx = drawable.indexOf(layer);
    if (idx <= 0) return;
    layer.insertBelow(drawable[idx - 1]);
    normalizeLayerOrder();
    bumpProjectRevision();
  };

  const removeReferenceGroup = (id: number) => {
    if (!projectRef.current) return;
    const item = projectRef.current.getItem({ id });
    let g: paper.Group | null = null;
    if (item instanceof paper.Group && item.data?.isReference) g = item;
    else if (item?.parent instanceof paper.Group && item.parent.data?.isReference) g = item.parent;
    if (!g || g.layer?.name !== '__reference') return;
    g.remove();
    (window as any).clearPaperSelection?.();
    saveHistory();
    bumpProjectRevision();
  };

  const panelBody = (
    <>
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-white gap-2">
        <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 min-w-0">
          <Layers size={14} className="shrink-0" /> <span className="truncate">Layers</span>
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={addLayer}
            className="p-1 rounded hover:bg-slate-100 text-slate-600"
            title="New layer"
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1 rounded hover:bg-slate-100 text-slate-600"
            title="Close layers"
            aria-label="Close layers"
          >
            <X size={18} />
          </button>
        </div>
      </div>
      {referenceGroups.length > 0 && (
        <div className="px-2 pt-2 pb-1 border-b border-slate-200">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Reference (under artwork)</div>
          <ul className="space-y-1">
            {referenceGroups.map((g) => (
              <li key={g.id}>
                <div className="flex items-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
                  <span className="flex-1 truncate">Image ref</span>
                  <button
                    type="button"
                    className="text-indigo-600 hover:underline shrink-0"
                    onClick={() => (window as any).selectReferenceGroupById?.(g.id)}
                  >
                    Select
                  </button>
                  <button
                    type="button"
                    className="text-red-500 hover:text-red-700 shrink-0 p-0.5"
                    title="Remove reference"
                    onClick={() => removeReferenceGroup(g.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="flex-1 overflow-y-auto p-2 space-y-1">
        {layers
          .slice()
          .reverse()
          .map((layer) => {
            const isActive = project?.activeLayer === layer;
            const dIdx = layers.indexOf(layer);
            const canForward = dIdx < layers.length - 1;
            const canBackward = dIdx > 0;
            return (
              <li key={layer.id}>
                <div
                  className={`flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm ${
                    isActive ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleVisible(layer)}
                    className="p-0.5 text-slate-500 hover:text-slate-800"
                    title={layer.visible ? 'Hide' : 'Show'}
                  >
                    {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button
                    type="button"
                    className="flex-1 text-left truncate text-slate-800"
                    onClick={() => activateLayer(layer)}
                  >
                    {layer.name || 'Layer'}
                  </button>
                  <button
                    type="button"
                    onClick={() => moveForward(layer)}
                    className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    disabled={!canForward}
                    title="Bring forward"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveBackward(layer)}
                    className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    disabled={!canBackward}
                    title="Send backward"
                  >
                    <ChevronDown size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteLayer(layer)}
                    className="p-0.5 text-slate-400 hover:text-red-600 disabled:opacity-30"
                    disabled={layers.length <= 1}
                    title="Delete layer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            );
          })}
      </ul>
      {layers.length === 0 && (
        <p className="px-3 py-2 text-xs text-slate-500">Open canvas to load layers.</p>
      )}
      <span className="hidden" aria-hidden>
        {projectRevision}
      </span>
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className={`md:hidden fixed left-4 z-30 h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-lg ring-1 ring-black/5 active:scale-95 transition-transform max-md:top-[calc(env(safe-area-inset-top,0px)+3.75rem)] ${mobileOpen ? 'max-md:hidden' : 'flex'} ${isAnimating ? 'opacity-50 pointer-events-none' : ''}`}
        title="Layers"
        aria-label="Open layers"
        aria-expanded={mobileOpen}
      >
        <Layers size={22} />
      </button>

      {mobileOpen && (
        <button
          type="button"
          className="md:hidden fixed inset-0 z-40 bg-slate-900/40"
          aria-label="Dismiss layers"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div
        className={`flex flex-col shrink-0 h-full min-h-0 w-0 md:w-52 overflow-visible border-0 md:border-r border-slate-200 bg-slate-50 ${isAnimating ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <div
          className={`flex flex-col h-full min-h-0 w-[min(100vw-2rem,18rem)] md:w-full border-r md:border-0 border-slate-200 bg-slate-50 shadow-xl md:shadow-none
            md:relative md:translate-x-0
            max-md:fixed max-md:top-0 max-md:bottom-0 max-md:left-0 max-md:z-50 max-md:transition-transform max-md:duration-200 ease-out
            ${mobileOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'}`}
        >
          {panelBody}
        </div>
      </div>
    </>
  );
}
