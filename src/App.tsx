
import { EditorProvider } from './context/EditorContext';
import { Toolbar } from './components/Toolbar';
import { Canvas } from './components/Canvas';

export default function App() {
  return (
    <EditorProvider>
      <div className="flex flex-col h-screen bg-slate-100 text-slate-800 font-sans select-none">
        <Toolbar />
        <Canvas />
      </div>
    </EditorProvider>
  );
}
