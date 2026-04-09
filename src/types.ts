export type ToolMode = 'draw' | 'select' | 'edit' | 'pressure';

export interface PathData {
  id: number;
  d: string;
  color: string;
  length: number;
  width: number;
  mask?: {
    ribbonD: string;
    capStartD: string;
    capEndD: string;
  };
}
