import { EditorProvider } from './context/EditorContext';
import { Toolbar } from './components/Toolbar';
import { Canvas } from './components/Canvas';
import { LayerPanel } from './components/LayerPanel';

export default function App() {
  return (
    <EditorProvider>
      <div className="flex flex-col h-screen bg-slate-100 text-slate-800 font-sans select-none">
        <Toolbar>
          <div className="flex min-h-0 flex-1">
            <LayerPanel />
            <Canvas />
          </div>
        </Toolbar>
      </div>
    </EditorProvider>
  );
}
