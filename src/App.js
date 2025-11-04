import logo from './logo.svg';
import './App.css';
import * as THREE from 'three';
import { Environment, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import Model from './components/Curve-base';
import Fog from './components/Fog';

function App() {
  return (
    <div className="App">
     <Canvas gl={{ antialias: true }}>
        <OrbitControls />
        <Environment preset="forest" />
        <Model />

        <primitive object={new THREE.FogExp2("#90EE90", 0.07)} attach="fog" /> {/* density still matters */}
        <Fog
          heightStart={0}
          heightEnd={5}
          heightCurve={1.3}
          fogColor="#90EE90"   // <-- set your fog tint here
        />
     </Canvas>
    </div>
  );
}

export default App;
