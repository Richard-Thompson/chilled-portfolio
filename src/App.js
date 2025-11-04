import logo from './logo.svg';
import './App.css';
import { Environment, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import Model from './Curve-base';

function App() {
  return (
    <div className="App">
     <Canvas>
        <OrbitControls />
        <Environment preset="forest" />
        <Model />
     </Canvas>
    </div>
  );
}

export default App;
