import React, { createContext, useContext, useState, useRef, ReactNode } from 'react';
import type { ToolMode, PathData } from '../types';
import paper from 'paper';

interface EditorContextProps {
  activeTool: ToolMode;
  setActiveTool: (tool: ToolMode) => void;
  currentColor: string;
  setCurrentColor: (color: string) => void;
  isAnimating: boolean;
  setIsAnimating: (animating: boolean) => void;
  animatedPaths: PathData[];
  setAnimatedPaths: (paths: PathData[]) => void;
  projectRef: React.MutableRefObject<paper.Project | null>;
  resetView: () => void;
}

const EditorContext = createContext<EditorContextProps | undefined>(undefined);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [activeTool, setActiveTool] = useState<ToolMode>('draw');
  const [currentColor, setCurrentColor] = useState<string>('#1e293b');
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [animatedPaths, setAnimatedPaths] = useState<PathData[]>([]);
  const projectRef = useRef<paper.Project | null>(null);

  const resetView = () => {
    if (paper.view && projectRef.current) {
      paper.view.zoom = 1;
      paper.view.center = new paper.Point(
        paper.view.viewSize.width / 2,
        paper.view.viewSize.height / 2
      );
    }
  };

  return (
    <EditorContext.Provider
      value={{
        activeTool,
        setActiveTool,
        currentColor,
        setCurrentColor,
        isAnimating,
        setIsAnimating,
        animatedPaths,
        setAnimatedPaths,
        projectRef,
        resetView,
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
