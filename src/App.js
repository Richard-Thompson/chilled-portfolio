import React, { Suspense, memo, useMemo } from 'react';
import './App.css';
import * as THREE from 'three';
import { KeyboardControls, Sparkles } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';

// Lazy load components for code splitting and faster initial load
const Model = React.lazy(() => import('./components/Curve-base'));
const Hdri = React.lazy(() => import('./components/Hdri'));
// const Controls = React.lazy(() => import('./components/Controls')); // Disabled - MovingSphere controls camera
const AmbientParticles = React.lazy(() => import('./components/AmbientParticles'));
const PerformanceMonitor = React.lazy(() => import('./components/PerformanceMonitor'));
const SwarmControl = React.lazy(() => import('./components/SwarmControl'));
const ParticleControls = React.lazy(() => import('./components/ParticleControls'));

// Pre-computed constants for performance
const KEYBOARD_MAP = [
  { name: 'forwardKeyPressed', keys: ['ArrowUp', 'KeyW'] },
  { name: 'backwardKeyPressed', keys: ['ArrowDown', 'KeyS'] },
  { name: 'leftKeyPressed', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'rightKeyPressed', keys: ['ArrowRight', 'KeyD'] },
  { name: 'shiftKeyPressed', keys: ['ShiftLeft', 'ShiftRight'] },
];

const CAMERA_CONFIG = { position: [4, 4, 4], fov: 60 };
const GL_CONFIG = { 
  antialias: false, 
  alpha: false, 
  powerPreference: 'high-performance',
  stencil: false,
  depth: true
};

// Optimized fog object (created once)
const FOG = new THREE.FogExp2("#228B22", 0.05);

// Memoized loading fallback
const LoadingFallback = memo(() => (
  <mesh>
    <boxGeometry args={[0.5, 0.5, 0.5]} />
    <meshBasicMaterial color="#90EE90" />
  </mesh>
));
LoadingFallback.displayName = 'LoadingFallback';

// Adaptive performance configuration
const getParticleConfig = (performanceLevel = 'GOOD') => {
  const configs = {
    EXCELLENT: { count: 100, speed: 0.5, range: 28, opacity: 0.7 },
    GOOD: { count: 70, speed: 0.4, range: 22, opacity: 0.6 },
    POOR: { count: 40, speed: 0.3, range: 18, opacity: 0.5 },
    CRITICAL: { count: 20, speed: 0.2, range: 15, opacity: 0.4 }
  };
  return configs[performanceLevel] || configs.GOOD;
};

function App() {
  const [performanceLevel, setPerformanceLevel] = React.useState('GOOD');
  const [swarmMode, setSwarmMode] = React.useState('normal'); // 'normal', 'swarm', 'returning'
  const [isSwarmButtonDisabled, setIsSwarmButtonDisabled] = React.useState(false);
  const [spherePosition, setSpherePosition] = React.useState(null);
  const [showControls, setShowControls] = React.useState(false);
  const [particleControls, setParticleControls] = React.useState({
    speed: 0.8,
    chaos: 1.5,
    orbitSize: 2.0,
    attraction: 1.0,
    complexity: 1.0,
    pulse: 0.4
  });
  
  // Handle performance changes and adjust settings automatically
  const handlePerformanceChange = React.useCallback((level, fps) => {
    setPerformanceLevel(level);
    console.log(`Performance adjusted to ${level} (${fps} FPS)`);
  }, []);

  // Toggle swarm mode on/off (normal <-> swarm)
  const cycleSwarmMode = React.useCallback(() => {
    if (isSwarmButtonDisabled) return; // Don't allow toggling while returning
    
    setSwarmMode(current => {
      if (current === 'normal') {
        return 'swarm';
      } else if (current === 'swarm') {
        setIsSwarmButtonDisabled(true); // Disable button during return transition
        return 'returning';
      }
      return current;
    });
  }, [isSwarmButtonDisabled]);

  // Handle sphere position updates
  const handleSphereMove = React.useCallback((newPosition) => {
    setSpherePosition(newPosition);
  }, []);

  // Handle particle control changes
  const handleParticleControlChange = React.useCallback((newControls) => {
    setParticleControls(newControls);
  }, []);

  // Handle return transition complete
  const handleReturnComplete = React.useCallback(() => {
    console.log('handleReturnComplete called!');
    setSwarmMode('normal');
    setIsSwarmButtonDisabled(false);
  }, []);

  // Add keyboard event listener for spacebar and controls toggle
  React.useEffect(() => {
    const handleKeyPress = (event) => {
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault(); // Prevent page scroll
        cycleSwarmMode();
      }
      if (event.code === 'KeyC' && !event.repeat) {
        event.preventDefault();
        setShowControls(prev => !prev); // Toggle controls with 'C' key
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [cycleSwarmMode]);

  // Memoized particle config based on performance
  const particleConfig = useMemo(() => getParticleConfig(performanceLevel), [performanceLevel]);

  // Memoized render components to prevent unnecessary re-renders
  const sceneComponents = useMemo(() => (
    <Suspense fallback={<LoadingFallback />}>
      <Hdri />
      <Model onSphereMove={handleSphereMove} />
      {/* <Sparkles /> */}
      <AmbientParticles 
        {...particleConfig} 
        spherePosition={spherePosition}
        swarmMode={swarmMode}
        controls={particleControls}
        onReturnComplete={handleReturnComplete}
      />
      {/* <Controls /> - Disabled: MovingSphere now controls camera */}
      <primitive object={FOG} attach="fog" />
    </Suspense>
  ), [particleConfig, spherePosition, swarmMode, particleControls, handleSphereMove]);

  return (
    <div className="App">
      <KeyboardControls map={KEYBOARD_MAP}>
        <Canvas 
          gl={GL_CONFIG} 
          camera={CAMERA_CONFIG}
          dpr={[1, 1]} // Limit device pixel ratio for performance
          performance={{ min: 0.5 }} // Performance monitoring
        >
          {sceneComponents}
        </Canvas>
      </KeyboardControls>
      <Suspense fallback={null}>
        <PerformanceMonitor onPerformanceChange={handlePerformanceChange} />
      </Suspense>
      <Suspense fallback={null}>
        <SwarmControl swarmMode={swarmMode} onModeChange={cycleSwarmMode} disabled={isSwarmButtonDisabled} />
      </Suspense>
      <Suspense fallback={null}>
        <ParticleControls 
          controls={particleControls}
          onControlChange={handleParticleControlChange}
          isVisible={showControls}
        />
      </Suspense>
    </div>
  );
}

export default App;
