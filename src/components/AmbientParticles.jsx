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
      if (swarmMode === 'returning') {
        returnTransitionStart.current = time;
        hasCalledReturnComplete.current = false;
      } else {
        transitionStart.current = time;
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
      const transitionDuration = 67.28; // 67.28 seconds total (300% slower - 16.82 * 4)
      const timeSinceTransition = time - transitionStart.current;
      const transitionProgress = Math.min(timeSinceTransition / transitionDuration, 1.0);
      
      // Tangent curve: very slow start, dramatic ramp in last 10%
      let easedProgress;
      if (transitionProgress < 0.9) {
        // First 90%: very slow tangent curve
        const normalizedProgress = transitionProgress / 0.9;
        easedProgress = Math.tan(normalizedProgress * Math.PI * 0.45) / Math.tan(Math.PI * 0.45) * 0.1;
      } else {
        // Last 10%: dramatic acceleration
        const finalProgress = (transitionProgress - 0.9) / 0.1;
        easedProgress = 0.1 + finalProgress * 0.9;
      }
      
      const lerpSpeed = 0.0008875; // Base smooth transition speed (300% slower - 0.00355 / 4)
      
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        
        // Current particle position
        const currentX = positions[i3];
        const currentY = positions[i3 + 1];
        const currentZ = positions[i3 + 2];
        
        const orbitRadius = orbitRadii[i];
        
        // Chaotic spherical interweaving orbital motion
        const baseTime = (time - transitionStart.current) * swarmSpeed;
        
        // Individual speed multipliers for chaos (controllable)
        const chaosMultiplier = controls?.chaos || 1.0;
        const speedX = orbitSpeeds[i3] * chaosMultiplier;
        const speedY = orbitSpeeds[i3 + 1] * chaosMultiplier;
        const speedZ = orbitSpeeds[i3 + 2] * chaosMultiplier;
        
        // Multiple orbital frequencies for interweaving (controllable complexity)
        const complexityFactor = controls?.complexity || 1.0;
        const timeX = baseTime * speedX;
        const timeY = baseTime * speedY * (0.73 * complexityFactor);
        const timeZ = baseTime * speedZ * (1.19 * complexityFactor);
        
        // Spherical coordinates with chaotic variations (controllable)
        const orbitSizeMultiplier = controls?.orbitSize || 2.0;
        const pulseIntensity = controls?.pulse || 0.4;
        const scaledOrbitRadius = (orbitRadius / 2.0) * orbitSizeMultiplier; // Scale from default 2.0
        
        const phi = timeX + swarmOffsets[i3]; // Azimuthal angle
        const theta = Math.sin(timeY * 0.5) * 3.14159 + swarmOffsets[i3 + 1]; // Polar angle (oscillating)
        const radius = scaledOrbitRadius * (0.8 + pulseIntensity * Math.sin(timeZ + swarmOffsets[i3 + 2])); // Pulsating radius
        
        // Convert spherical to cartesian with axis tilting
        let orbitX = radius * Math.sin(theta) * Math.cos(phi);
        let orbitY = radius * Math.cos(theta);
        let orbitZ = radius * Math.sin(theta) * Math.sin(phi);
        
        // Add secondary orbital layer for more complexity (controllable)
        const secondaryTime = baseTime * (1.7 * complexityFactor);
        const secondaryRadius = scaledOrbitRadius * (0.3 * complexityFactor);
        const secX = secondaryRadius * Math.sin(secondaryTime * 2.1 + swarmOffsets[i3]);
        const secY = secondaryRadius * Math.cos(secondaryTime * 1.6 + swarmOffsets[i3 + 1]);
        const secZ = secondaryRadius * Math.sin(secondaryTime * 2.8 + swarmOffsets[i3 + 2]);
        
        // Combine primary and secondary orbits
        orbitX += secX;
        orbitY += secY;
        orbitZ += secZ;
        
        // Apply random axis tilting for 3D spherical distribution
        const tiltX = orbitAxes[i3];
        const tiltY = orbitAxes[i3 + 1];
        const tiltZ = orbitAxes[i3 + 2];
        
        // Rotate around random axes for true spherical chaos
        const rotatedX = orbitX + orbitY * tiltZ - orbitZ * tiltY;
        const rotatedY = orbitY + orbitZ * tiltX - orbitX * tiltZ;
        const rotatedZ = orbitZ + orbitX * tiltY - orbitY * tiltX;
        
        const finalX = spherePosition.x + rotatedX;
        const finalY = spherePosition.y + rotatedY;
        const finalZ = spherePosition.z + rotatedZ;
        
        if (transitionProgress < 1.0) {
          // Calculate distance from particle to sphere center
          const distanceToSphere = Math.sqrt(
            Math.pow(currentX - spherePosition.x, 2) +
            Math.pow(currentY - spherePosition.y, 2) +
            Math.pow(currentZ - spherePosition.z, 2)
          );
          
          // Normalize distance (assuming max distance is around 200 units from container)
          const normalizedDistance = Math.min(distanceToSphere / 200.0, 1.0);
          
          // Gravitational acceleration with tangent curve: extremely slow start, dramatic ramp
          const attractionMultiplier = controls?.attraction || 1.0;
          const baseAcceleration = 0.000125 * attractionMultiplier; // Much slower base (300% slower)
          const maxAcceleration = 0.01125 * attractionMultiplier;  // Higher max for dramatic finish (300% slower)
          
          // Apply tangent curve to distance-based acceleration
          let distanceAcceleration;
          if (normalizedDistance > 0.1) {
            // First 90% of distance: very slow tangent approach
            const distanceProgress = (1.0 - normalizedDistance) / 0.9;
            distanceAcceleration = Math.tan(distanceProgress * Math.PI * 0.45) / Math.tan(Math.PI * 0.45) * 0.1;
          } else {
            // Last 10% of distance: dramatic acceleration
            const finalDistanceProgress = (0.1 - normalizedDistance) / 0.1;
            distanceAcceleration = 0.1 + finalDistanceProgress * 0.9;
          }
          
          const accelerationFactor = baseAcceleration + (maxAcceleration - baseAcceleration) * distanceAcceleration;
          
          // Blend gravitational attraction with final orbital motion
          // Early in transition: pure gravitational attraction
          // Later in transition: blend toward orbital motion
          const attractionWeight = Math.max(0, 1.0 - transitionProgress * 1.5); // Reduces as transition progresses
          const orbitalWeight = Math.min(1.0, transitionProgress * 1.5); // Increases as transition progresses
          
          if (attractionWeight > 0) {
            // Gravitational attraction toward sphere center
            const directionX = spherePosition.x - currentX;
            const directionY = spherePosition.y - currentY;
            const directionZ = spherePosition.z - currentZ;
            
            // Apply acceleration based on distance
            const attractionX = currentX + directionX * accelerationFactor;
            const attractionY = currentY + directionY * accelerationFactor;
            const attractionZ = currentZ + directionZ * accelerationFactor;
            
            // Blend attraction with orbital motion
            positions[i3] = attractionX * attractionWeight + finalX * orbitalWeight;
            positions[i3 + 1] = attractionY * attractionWeight + finalY * orbitalWeight;
            positions[i3 + 2] = attractionZ * attractionWeight + finalZ * orbitalWeight;
          } else {
            // Pure orbital motion when attraction phase is complete
            positions[i3] = finalX;
            positions[i3 + 1] = finalY;
            positions[i3 + 2] = finalZ;
          }
        } else {
          // After transition: pure orbital motion (already calculated above)
          positions[i3] = finalX;
          positions[i3 + 1] = finalY;
          positions[i3 + 2] = finalZ;
        }
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