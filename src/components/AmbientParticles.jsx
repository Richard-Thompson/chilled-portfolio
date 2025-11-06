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

const AmbientParticles = React.memo(({ spherePosition = null, swarmMode = 'normal', controls = null, onReturnComplete = null }) => {
  const pointsRef = useRef();
  const geometryRef = useRef();
  const materialRef = useRef();
  const previousSwarmMode = useRef('normal');
  const transitionStart = useRef(0);
  const returnTransitionStart = useRef(0);
  const hasCalledReturnComplete = useRef(false);
  
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
    const orbitSpeeds = new Float32Array(count * 3); // Individual speed multipliers for chaos
    const orbitAxes = new Float32Array(count * 3); // Random orbital axis orientations
    
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
      
      // Swarm mode offsets for chaotic spherical orbital movement
      swarmOffsets[i3] = Math.random() * 6.283185307179586; // Phase offset X
      swarmOffsets[i3 + 1] = Math.random() * 6.283185307179586; // Phase offset Y  
      swarmOffsets[i3 + 2] = Math.random() * 6.283185307179586; // Phase offset Z
      
      // Random orbit radius around 2.0 units with more variation (0.5 to 4.0 range)
      orbitRadii[i] = 0.5 + Math.random() * 3.5;
      
      // Chaotic speed multipliers for interweaving (0.3x to 2.5x base speed)
      orbitSpeeds[i3] = 0.3 + Math.random() * 2.2; // X speed multiplier
      orbitSpeeds[i3 + 1] = 0.3 + Math.random() * 2.2; // Y speed multiplier
      orbitSpeeds[i3 + 2] = 0.3 + Math.random() * 2.2; // Z speed multiplier
      
      // Random orbital axis orientations for spherical distribution
      orbitAxes[i3] = (Math.random() - 0.5) * 2; // X axis tilt (-1 to 1)
      orbitAxes[i3 + 1] = (Math.random() - 0.5) * 2; // Y axis tilt (-1 to 1)
      orbitAxes[i3 + 2] = (Math.random() - 0.5) * 2; // Z axis tilt (-1 to 1)
      
      // Optimized color generation vec3(0.702,0.922,0.949)
      colors[i3] = 0.702;
      colors[i3 + 1] = 0.922;
      colors[i3 + 2] = 0.949;
    }
    
    return { positions, colors, initialPositions, animationOffsets, swarmOffsets, orbitRadii, orbitSpeeds, orbitAxes, count };
  }, []);

  // Animation loop with swarm behavior, reverse swarm, and normal movement
  const animationCallback = useCallback((state) => {
    if (!pointsRef.current) return;
    
    const time = state.clock.elapsedTime;
    const positionAttribute = pointsRef.current.geometry.attributes.position;
    const positions = positionAttribute.array;
    const { initialPositions, animationOffsets, swarmOffsets, orbitRadii, orbitSpeeds, orbitAxes, count } = particleData;
    const { movementRadius, speed, speedY, speedZ } = animationConstants;
    
    // Check if mode changed and start transition timer
    if (previousSwarmMode.current !== swarmMode) {
      if (swarmMode === 'swarm') {
        console.log('Starting swarm mode at time:', time);
        transitionStart.current = time;
        hasCalledReturnComplete.current = false; // Reset for next cycle
      } else if (swarmMode === 'returning') {
        console.log('Starting return mode at time:', time);
        returnTransitionStart.current = time;
        hasCalledReturnComplete.current = false;
      }
      previousSwarmMode.current = swarmMode;
    }
    
    // Cache frequently used values
    const timeSpeed = time * speed;
    const timeSpeedY = time * speedY;
    const timeSpeedZ = time * speedZ;
    
    if (swarmMode === 'swarm' && spherePosition) {
      // Swarm mode: particles orbit around the sphere's current position
      const swarmSpeed = controls?.speed || 0.8; // Speed of orbital movement (controllable)
      
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        
        // Current particle position
        const currentX = positions[i3];
        const currentY = positions[i3 + 1];
        const currentZ = positions[i3 + 2];
        
        const orbitRadius = orbitRadii[i];
        
        // Simplified smooth swarm motion - particles follow sphere in orbital pattern
        const swarmTime = time * swarmSpeed;
        const orbitSizeMultiplier = controls?.orbitSize || 2.0;
        const radius = orbitRadii[i] * orbitSizeMultiplier;
        
        // Simple orbital motion around sphere
        const angle1 = swarmTime + swarmOffsets[i3];
        const angle2 = swarmTime * 0.7 + swarmOffsets[i3 + 1];
        
        // Calculate target orbital position
        const targetX = spherePosition.x + Math.cos(angle1) * radius;
        const targetY = spherePosition.y + Math.sin(angle2) * radius * 0.5;
        const targetZ = spherePosition.z + Math.sin(angle1) * radius;
        
        // Smooth movement towards target with proper interpolation
        const lerpSpeed = 0.05; // Fixed lerp speed for smooth movement
        
        positions[i3] = currentX + (targetX - currentX) * lerpSpeed;
        positions[i3 + 1] = currentY + (targetY - currentY) * lerpSpeed;
        positions[i3 + 2] = currentZ + (targetZ - currentZ) * lerpSpeed;
      }
    } else if (swarmMode === 'returning') {
      // Returning mode: particles transition back to their original positions
      const returnSpeed = 0.02; // Faster return speed for testing (was 0.0008875)
      const returnDuration = 3.0; // Shorter duration for testing (was 67.28)
      const timeSinceReturn = time - returnTransitionStart.current;
      const returnProgress = Math.min(timeSinceReturn / returnDuration, 1.0);
      
      console.log(`Return progress: ${returnProgress.toFixed(3)}, Time since return: ${timeSinceReturn.toFixed(2)}s`);
      
      // Check if return is complete
      if (returnProgress >= 1.0 && !hasCalledReturnComplete.current && onReturnComplete) {
        console.log('Calling onReturnComplete!');
        hasCalledReturnComplete.current = true;
        onReturnComplete();
      }
      
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
      // Normal mode: smooth movement around initial positions with grass bending
      const bendRadius = 2.0; // Distance within which grass bends away from sphere
      const maxBendStrength = 1.5; // Maximum bending displacement
      
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
        
        // Base positions with normal movement
        let finalX = baseX + offsetX;
        let finalY = baseY + offsetY;
        let finalZ = baseZ + offsetZ;
        
        // Apply grass bending effect if sphere position is available
        if (spherePosition) {
          // Calculate distance from particle to sphere
          const deltaX = finalX - spherePosition.x;
          const deltaY = finalY - spherePosition.y;
          const deltaZ = finalZ - spherePosition.z;
          const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
          
          // Apply bending if within bend radius
          if (distance < bendRadius && distance > 0) {
            // Calculate normalized direction away from sphere
            const dirX = deltaX / distance;
            const dirY = deltaY / distance;
            const dirZ = deltaZ / distance;
            
            // Calculate bend strength (stronger when closer to sphere)
            const bendStrength = ((bendRadius - distance) / bendRadius) * maxBendStrength;
            
            // Apply smooth falloff using smoothstep function
            const t = distance / bendRadius;
            const smoothFalloff = 1.0 - (t * t * (3.0 - 2.0 * t));
            const finalBendStrength = bendStrength * smoothFalloff;
            
            // Apply bending displacement away from sphere
            finalX += dirX * finalBendStrength;
            finalY += dirY * finalBendStrength;
            finalZ += dirZ * finalBendStrength;
          }
        }
        
        // Apply final positions
        positions[i3] = finalX;
        positions[i3 + 1] = finalY;
        positions[i3 + 2] = finalZ;
      }
    }
    
    positionAttribute.needsUpdate = true;
  }, [particleData, animationConstants, swarmMode, spherePosition, controls, onReturnComplete]);

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