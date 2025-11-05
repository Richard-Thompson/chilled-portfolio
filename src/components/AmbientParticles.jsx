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

const AmbientParticles = React.memo(({ spherePosition = null, swarmMode = 'normal' }) => {
  const pointsRef = useRef();
  const geometryRef = useRef();
  const materialRef = useRef();
  const previousSwarmMode = useRef('normal');
  const transitionStart = useRef(0);
  
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
    const containerSize = 200; // 50x50x50 container as originally requested
    
    // Use single buffer for all data to improve cache locality
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const initialPositions = new Float32Array(count * 3);
    const animationOffsets = new Float32Array(count * 3);
    const swarmOffsets = new Float32Array(count * 3); // For orbit randomization
    const orbitRadii = new Float32Array(count); // Individual orbit radius for each particle
    
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
      
      // Swarm mode offsets for random orbital movement
      swarmOffsets[i3] = Math.random() * 6.283185307179586; // X orbit offset
      swarmOffsets[i3 + 1] = Math.random() * 6.283185307179586; // Y orbit offset  
      swarmOffsets[i3 + 2] = Math.random() * 6.283185307179586; // Z orbit offset
      
      // Random orbit radius around 2.0 units (1.0 to 3.0 range)
      orbitRadii[i] = 1.0 + Math.random() * 2.0;
      
      // Optimized color generation vec3(0.702,0.922,0.949)
      colors[i3] = 0.702;
      colors[i3 + 1] = 0.922;
      colors[i3 + 2] = 0.949;
    }
    
    return { positions, colors, initialPositions, animationOffsets, swarmOffsets, orbitRadii, count };
  }, []);

  // Animation loop with swarm behavior, reverse swarm, and normal movement
  const animationCallback = useCallback((state) => {
    if (!pointsRef.current) return;
    
    const time = state.clock.elapsedTime;
    const positionAttribute = pointsRef.current.geometry.attributes.position;
    const positions = positionAttribute.array;
    const { initialPositions, animationOffsets, swarmOffsets, orbitRadii, count } = particleData;
    const { movementRadius, speed, speedY, speedZ } = animationConstants;
    
    // Check if mode changed and start transition timer
    if (previousSwarmMode.current !== swarmMode) {
      transitionStart.current = time;
      previousSwarmMode.current = swarmMode;
    }
    
    // Cache frequently used values
    const timeSpeed = time * speed;
    const timeSpeedY = time * speedY;
    const timeSpeedZ = time * speedZ;
    
    if (swarmMode === 'swarm' && spherePosition) {
      // Swarm mode: particles orbit around the sphere's current position
      const swarmSpeed = 0.8; // Speed of orbital movement
      const transitionDuration = 2.0; // 2 seconds to fully transition
      const timeSinceTransition = time - transitionStart.current;
      const transitionProgress = Math.min(timeSinceTransition / transitionDuration, 1.0);
      
      // Use smooth easing for transition
      const easedProgress = 1 - Math.pow(1 - transitionProgress, 3); // Ease out cubic
      const lerpSpeed = 0.03; // Smooth transition speed
      
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        
        // Current particle position
        const currentX = positions[i3];
        const currentY = positions[i3 + 1];
        const currentZ = positions[i3 + 2];
        
        const orbitRadius = orbitRadii[i];
        
        // Always calculate orbital motion from the full timeline (no reset)
        const fullOrbitTime = (time - transitionStart.current) * swarmSpeed;
        const orbitX = Math.sin(fullOrbitTime + swarmOffsets[i3]) * orbitRadius;
        const orbitY = Math.sin(fullOrbitTime * 0.7 + swarmOffsets[i3 + 1]) * orbitRadius * 0.5;
        const orbitZ = Math.cos(fullOrbitTime + swarmOffsets[i3 + 2]) * orbitRadius;
        
        const finalX = spherePosition.x + orbitX;
        const finalY = spherePosition.y + orbitY;
        const finalZ = spherePosition.z + orbitZ;
        
        if (transitionProgress < 1.0) {
          // During transition: blend from current position to orbital motion
          positions[i3] = THREE.MathUtils.lerp(currentX, finalX, easedProgress);
          positions[i3 + 1] = THREE.MathUtils.lerp(currentY, finalY, easedProgress);
          positions[i3 + 2] = THREE.MathUtils.lerp(currentZ, finalZ, easedProgress);
        } else {
          // After transition: pure orbital motion (already calculated above)
          positions[i3] = finalX;
          positions[i3 + 1] = finalY;
          positions[i3 + 2] = finalZ;
        }
      }
    } else if (swarmMode === 'reverse') {
      // Reverse swarm mode: particles move back to their original positions and resume normal movement
      const returnSpeed = 0.03; // Speed of returning to original positions
      
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        
        // Current particle position
        const currentX = positions[i3];
        const currentY = positions[i3 + 1];
        const currentZ = positions[i3 + 2];
        
        // Get original positions with normal movement
        const baseX = initialPositions[i3];
        const baseY = initialPositions[i3 + 1];
        const baseZ = initialPositions[i3 + 2];
        
        // Calculate normal movement offsets
        const offsetX = Math.sin(timeSpeed + animationOffsets[i3]) * movementRadius;
        const offsetY = Math.sin(timeSpeedY + animationOffsets[i3 + 1]) * movementRadius;
        const offsetZ = Math.sin(timeSpeedZ + animationOffsets[i3 + 2]) * movementRadius;
        
        // Target positions with normal movement
        const targetX = baseX + offsetX;
        const targetY = baseY + offsetY;
        const targetZ = baseZ + offsetZ;
        
        // Smoothly interpolate back to original movement pattern
        positions[i3] = THREE.MathUtils.lerp(currentX, targetX, returnSpeed);
        positions[i3 + 1] = THREE.MathUtils.lerp(currentY, targetY, returnSpeed);
        positions[i3 + 2] = THREE.MathUtils.lerp(currentZ, targetZ, returnSpeed);
      }
    } else {
      // Normal mode: smooth movement around initial positions
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
    }
    
    positionAttribute.needsUpdate = true;
  }, [particleData, animationConstants, swarmMode, spherePosition]);

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