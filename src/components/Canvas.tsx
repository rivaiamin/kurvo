import React, { useRef } from 'react';
import { useEditor } from '../context/EditorContext';
import { usePaperEngine } from '../hooks/usePaperEngine';

export function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { activeTool, isAnimating, animatedPaths } = useEditor();

  usePaperEngine(canvasRef);

  return (
    <div className="flex-1 bg-white relative overflow-hidden">
      <canvas
          ref={canvasRef}
          className={`w-full h-full touch-none outline-none transition-opacity duration-300 ${activeTool === 'select' ? 'cursor-default' : 'cursor-crosshair'} ${isAnimating ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          data-paper-resize="true"
      />

      {isAnimating && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-20">
              <defs>
                  {animatedPaths.map((path) => {
                      const mask = path.mask;
                      if (!mask) return null;
                      const maskId = `mask-${path.id}`;
                      return (
                          <mask
                              key={`mask-${path.id}`}
                              id={maskId}
                              maskUnits="userSpaceOnUse"
                              x={0}
                              y={0}
                              width="100%"
                              height="100%"
                          >
                              <rect x="0" y="0" width="100%" height="100%" fill="black" />
                              <path d={mask.ribbonD} fill="white" />
                              <path d={mask.capStartD} fill="white" />
                              <path d={mask.capEndD} fill="white" />
                          </mask>
                      );
                  })}
              </defs>
              {animatedPaths.map((path, index) => (
                  <path
                      key={`anim-${path.id}`}
                      d={path.d}
                      fill="none"
                      stroke={path.color}
                      strokeWidth={path.width}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      mask={path.mask ? `url(#mask-${path.id})` : undefined}
                      className="animate-draw"
                      style={{
                          '--path-length': path.length,
                          strokeDasharray: path.length,
                          strokeDashoffset: path.length,
                          animationDelay: `${index * 0.4}s`
                      } as React.CSSProperties}
                  />
              ))}
          </svg>
      )}
    </div>
  );
}
