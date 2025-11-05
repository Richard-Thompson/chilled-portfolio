import React, { useRef, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Create texture once outside component to avoid recreation
const createCircleTexture = () => {
  const canvas = document.createElement('canvas');
  const size = 16; // Reduced size for better performance
  canvas.width = size;
  canvas.height = size;
  
  const context = canvas.getContext('2d');
  const center = size / 2;
  const radius = size / 2;
  
  const gradient = context.createRadialGradient(center, center, 0, center, center, radius);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.2, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  
  return texture;
};

const circleTexture = createCircleTexture();

const AmbientParticles = React.memo(() => {
  const pointsRef = useRef();
  const geometryRef = useRef();
  const materialRef = useRef();
  
  // Pre-calculate animation constants
  const animationConstants = useMemo(() => ({
    movementRadius: 1.5, // 4x4 movement area (2 radius = 4x4 range)
    speed: 0.09,
    speedY: 0.21, // 0.3 * 0.7
    speedZ: 0.27, // 0.3 * 0.9
  }), []);

  // Optimized data generation with reduced allocations
  const particleData = useMemo(() => {
    const count = 20000; // Back to original 200k particles
    const containerSize = 50; // 50x50x50 container as originally requested
    
    // Use single buffer for all data to improve cache locality
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const initialPositions = new Float32Array(count * 3);
    const animationOffsets = new Float32Array(count * 3);
    
    // Batch process for better performance
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      
      // Generate once, use multiple times
      const x = (Math.random() - 0.5) * containerSize;
      const y = (Math.random() - 0.5) * containerSize * 0.5;
      const z = (Math.random() - 0.5) * containerSize;
      
      // Set positions (current and initial)
      positions[i3] = initialPositions[i3] = x;
      positions[i3 + 1] = initialPositions[i3 + 1] = y;
      positions[i3 + 2] = initialPositions[i3 + 2] = z;
      
      // Pre-calculate animation offsets
      animationOffsets[i3] = Math.random() * 6.283185307179586; // 2 * PI
      animationOffsets[i3 + 1] = Math.random() * 6.283185307179586;
      animationOffsets[i3 + 2] = Math.random() * 6.283185307179586;
      
      // Optimized color generation vec3(0.702,0.922,0.949)
      colors[i3] = 0.702;
      colors[i3 + 1] = 0.922;
      colors[i3 + 2] = 0.949;
    }
    
    return { positions, colors, initialPositions, animationOffsets, count };
  }, []);

  // Simple animation loop with smooth movement within 4x4 range
  const animationCallback = useCallback((state) => {
    if (!pointsRef.current) return;
    
    const time = state.clock.elapsedTime;
    const positionAttribute = pointsRef.current.geometry.attributes.position;
    const positions = positionAttribute.array;
    const { initialPositions, animationOffsets, count } = particleData;
    const { movementRadius, speed, speedY, speedZ } = animationConstants;
    
    // Cache frequently used values
    const timeSpeed = time * speed;
    const timeSpeedY = time * speedY;
    const timeSpeedZ = time * speedZ;
    
    // Simple loop with smooth movement around initial positions
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      
      // Get initial positions
      const baseX = initialPositions[i3];
      const baseY = initialPositions[i3 + 1];
      const baseZ = initialPositions[i3 + 2];
      
      // Calculate smooth movement offsets using sine waves
      const offsetX = Math.sin(timeSpeed + animationOffsets[i3]) * movementRadius;
      const offsetY = Math.sin(timeSpeedY + animationOffsets[i3 + 1]) * movementRadius;
      const offsetZ = Math.sin(timeSpeedZ + animationOffsets[i3 + 2]) * movementRadius;
      
      // Apply movement to positions
      positions[i3] = baseX + offsetX;
      positions[i3 + 1] = baseY + offsetY;
      positions[i3 + 2] = baseZ + offsetZ;
    }
    
    positionAttribute.needsUpdate = true;
  }, [particleData, animationConstants]);

  useFrame(animationCallback);

  return (
    <points ref={pointsRef}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          count={particleData.count}
          array={particleData.positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={particleData.count}
          array={particleData.colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        ref={materialRef}
        size={0.18}
        vertexColors={true}
        transparent={true}
        opacity={1.0}
        alphaTest={0.5}
        sizeAttenuation={true}
        map={circleTexture}
      />
    </points>
  );
});

export default AmbientParticles;