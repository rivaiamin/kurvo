// @ts-nocheck
import { ChevronDown, ChevronUp, Eye, EyeOff, Layers, Plus, Trash2 } from 'lucide-react';
import paper from 'paper';
import React from 'react';
import { useEditor } from '../context/EditorContext';

export function LayerPanel() {
  const { projectRef, projectRevision, bumpProjectRevision, isAnimating } = useEditor();

  const project = projectRef.current;
  const layers = (project?.layers ?? []).filter((l) => l.name !== '__ui');

  const keepUiOnTop = () => {
    if (!projectRef.current) return;
    const ui = projectRef.current.layers.find((l) => l.name === '__ui');
    if (ui) ui.bringToFront();
  };

  const activateLayer = (layer: paper.Layer) => {
    layer.activate();
    bumpProjectRevision();
  };

  const addLayer = () => {
    if (!projectRef.current) return;
    const n = projectRef.current.layers.filter((l) => l.name !== '__ui').length + 1;
    const layer = new paper.Layer({ name: `Layer ${n}` });
    layer.activate();
    keepUiOnTop();
    bumpProjectRevision();
  };

  const deleteLayer = (layer: paper.Layer) => {
    if (!projectRef.current) return;
    const drawable = projectRef.current.layers.filter((l) => l.name !== '__ui');
    if (drawable.length <= 1) return;
    const p = projectRef.current;
    const wasActive = layer === p.activeLayer;
    layer.remove();
    if (wasActive && p.layers.length > 0) {
      const top = p.layers.filter((l) => l.name !== '__ui').pop();
      if (top) top.activate();
    }
    keepUiOnTop();
    bumpProjectRevision();
  };

  const toggleVisible = (layer: paper.Layer) => {
    layer.visible = !layer.visible;
    bumpProjectRevision();
  };

  const moveForward = (layer: paper.Layer) => {
    if (!project) return;
    const drawable = project.layers.filter((l) => l.name !== '__ui');
    const idx = drawable.indexOf(layer);
    if (idx < 0 || idx >= drawable.length - 1) return;
    layer.insertAbove(drawable[idx + 1]);
    keepUiOnTop();
    bumpProjectRevision();
  };

  const moveBackward = (layer: paper.Layer) => {
    if (!project) return;
    const drawable = project.layers.filter((l) => l.name !== '__ui');
    const idx = drawable.indexOf(layer);
    if (idx <= 0) return;
    layer.insertBelow(drawable[idx - 1]);
    keepUiOnTop();
    bumpProjectRevision();
  };

  return (
    <div
      className={`flex flex-col w-52 shrink-0 border-r border-slate-200 bg-slate-50 ${isAnimating ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-white">
        <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
          <Layers size={14} /> Layers
        </span>
        <button
          type="button"
          onClick={addLayer}
          className="p-1 rounded hover:bg-slate-100 text-slate-600"
          title="New layer"
        >
          <Plus size={16} />
        </button>
      </div>
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
    </div>
  );
}
