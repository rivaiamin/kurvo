import paper from 'paper';
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PathData, ToolMode } from '../types';

interface EditorContextProps {
  activeTool: ToolMode;
  setActiveTool: (tool: ToolMode) => void;
  currentColor: string;
  setCurrentColor: (color: string) => void;
  brushSize: number;
  setBrushSize: (size: number) => void;
  isAnimating: boolean;
  setIsAnimating: (animating: boolean) => void;
  animatedPaths: PathData[];
  setAnimatedPaths: (paths: PathData[]) => void;
  projectRef: React.MutableRefObject<paper.Project | null>;
  resetView: () => void;
  initHistory: () => void;
  saveHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  projectRevision: number;
  bumpProjectRevision: () => void;
  selectionRevision: number;
  bumpSelectionRevision: () => void;
}

const EditorContext = createContext<EditorContextProps | undefined>(undefined);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [activeTool, setActiveTool] = useState<ToolMode>('draw');
  const [currentColor, setCurrentColor] = useState<string>('#1e293b');
  const [brushSize, setBrushSize] = useState<number>(4);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [animatedPaths, setAnimatedPaths] = useState<PathData[]>([]);

  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);

  const projectRef = useRef<paper.Project | null>(null);
  const [projectRevision, setProjectRevision] = useState(0);
  const bumpProjectRevision = useCallback(() => setProjectRevision((r) => r + 1), []);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const bumpSelectionRevision = useCallback(() => setSelectionRevision((r) => r + 1), []);

  const stateRefs = useRef({ undoStack, redoStack });
  useEffect(() => { stateRefs.current = { undoStack, redoStack }; }, [undoStack, redoStack]);

  const resetView = () => {
    if (paper.view && projectRef.current) {
      paper.view.zoom = 1;
      paper.view.center = new paper.Point(
        paper.view.viewSize.width / 2,
        paper.view.viewSize.height / 2
      );
    }
  };

  const initHistory = useCallback(() => {
    // Save blank canvas to start of history
    if (projectRef.current && stateRefs.current.undoStack.length === 0) {
      setUndoStack([projectRef.current.exportJSON() as string]);
    }
  }, []);

  const saveHistory = useCallback(() => {
    if (!projectRef.current) return;
    const currentState = projectRef.current.exportJSON() as string;

    setUndoStack(prev => {
      // Check if the current state is identical to the last to avoid redundant saves
      if (prev.length > 0 && prev[prev.length - 1] === currentState) return prev;

      const newStack = [...prev, currentState];
      if (newStack.length > 50) newStack.shift(); // Cap history to 50
      return newStack;
    });
    setRedoStack([]); // Clear redo timeline because a new divergent action happened
  }, []);

  const undo = useCallback(() => {
    const { undoStack, redoStack } = stateRefs.current;
    if (undoStack.length <= 1 || !projectRef.current) return; // Must leave at least empty layout

    const currentState = undoStack[undoStack.length - 1];
    const previousState = undoStack[undoStack.length - 2];

    setRedoStack([currentState, ...redoStack]);
    setUndoStack(undoStack.slice(0, -1));

    projectRef.current.clear();
    projectRef.current.importJSON(previousState);
    if ((window as any).clearPaperSelection) (window as any).clearPaperSelection();
  }, []);

  const redo = useCallback(() => {
    const { undoStack, redoStack } = stateRefs.current;
    if (redoStack.length === 0 || !projectRef.current) return;

    const nextState = redoStack[0];

    setUndoStack([...undoStack, nextState]);
    setRedoStack(redoStack.slice(1));

    projectRef.current.clear();
    projectRef.current.importJSON(nextState);
    if ((window as any).clearPaperSelection) (window as any).clearPaperSelection();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeNode = document.activeElement?.nodeName;
      if (activeNode === 'INPUT' || activeNode === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (!e.ctrlKey && !e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'z': setActiveTool('draw'); break;
          case 'p': setActiveTool('freestyle'); break;
          case 'x': setActiveTool('select'); break;
          case 'c': setActiveTool('edit'); break;
          case 'v': setActiveTool('pressure'); break;
          case 'e': setActiveTool('eraser'); break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, setActiveTool]);

  return (
    <EditorContext.Provider
      value={{
        activeTool, setActiveTool,
        currentColor, setCurrentColor,
        brushSize, setBrushSize,
        isAnimating, setIsAnimating,
        animatedPaths, setAnimatedPaths,
        projectRef, resetView,
        initHistory, saveHistory, undo, redo,
        canUndo: undoStack.length > 1,
        canRedo: redoStack.length > 0,
        projectRevision,
        bumpProjectRevision,
        selectionRevision,
        bumpSelectionRevision
      }}
    >
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditor must be used within an EditorProvider');
  }
  return context;
}
