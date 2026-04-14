export type ToolMode = 'draw' | 'freestyle' | 'select' | 'edit' | 'pressure' | 'eraser';

export interface PathData {
  id: number;
  d: string;
  color: string;
  length: number;
  width: number;
  closed?: boolean;
  mask?: {
    ribbonD: string;
    capStartD?: string;
    capEndD?: string;
  };
}
