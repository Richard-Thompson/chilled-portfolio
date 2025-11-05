import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Optimized Ambient Particle System with Light Green Variations
 * 
 * Features:
 * - Randomly moving particles with smooth motion
 * - Multiple shades of light green colors
 * - Efficient instanced rendering for performance
 * - Configurable particle count and behavior
 * - Smooth fade in/out effects
 * - Depth-based opacity for atmospheric effect
 */

// Performance-optimized constants for smooth particles
const PARTICLE_COUNT = 100; // Increased for better atmosphere
const MOVEMENT_SPEED = 0.15; // Slower for smoother motion
const MOVEMENT_RANGE = 25; // Larger range for better coverage
const PARTICLE_SIZE = 0.05; // Smaller for better performance
const FADE_DISTANCE = 18; // Better fade distance
const UPDATE_SKIP_FRAMES = 1; // Reduced skipping for smoother animation

// Light green color variations
const GREEN_COLORS = [
  new THREE.Color(0x90EE90), // Light green
  new THREE.Color(0x98FB98), // Pale green
  new THREE.Color(0xADFF2F), // Green yellow
  new THREE.Color(0x00FF7F), // Spring green
  new THREE.Color(0x7CFC00), // Lawn green
  new THREE.Color(0x32CD32), // Lime green
  new THREE.Color(0x00FA9A), // Medium spring green
  new THREE.Color(0x66CDAA), // Medium aquamarine
];

export default function AmbientParticles({ 
  count = PARTICLE_COUNT,
  speed = MOVEMENT_SPEED,
  range = MOVEMENT_RANGE,
  size = PARTICLE_SIZE,
  fadeDistance = FADE_DISTANCE,
  opacity = 0.6
}) {
  const meshRef = useRef();
  const particleData = useRef([]);
  const timeRef = useRef(0);

  // Memoized geometry and material for performance
  const geometry = useMemo(() => new THREE.SphereGeometry(size, 8, 6), [size]);
  
  const material = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: opacity,
      blending: THREE.AdditiveBlending, // Gives a nice glow effect
      depthWrite: false, // Prevents z-fighting
      vertexColors: true,
    });
  }, [opacity]);

  // Initialize particle data
  const particlePositions = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const data = [];

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      
      // Random initial positions
      positions[i3] = (Math.random() - 0.5) * range;
      positions[i3 + 1] = (Math.random() - 0.5) * range * 0.5;
      positions[i3 + 2] = (Math.random() - 0.5) * range;

      // Random light green color
      const color = GREEN_COLORS[Math.floor(Math.random() * GREEN_COLORS.length)];
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;

      // Store particle movement data for smoother motion
      data.push({
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * speed * 0.8, // Reduced for smoother motion
          (Math.random() - 0.5) * speed * 0.2, // Less vertical movement
          (Math.random() - 0.5) * speed * 0.8
        ),
        phase: Math.random() * Math.PI * 2, // Random phase for wave movement
        amplitude: 0.3 + Math.random() * 0.8, // Smoother amplitude range
        frequency: 0.4 + Math.random() * 0.6, // Slower frequency for smoothness
        baseOpacity: 0.4 + Math.random() * 0.5, // More consistent opacity
        smoothTarget: new THREE.Vector3(), // For smooth interpolation
      });
    }

    particleData.current = data;
    return { positions, colors };
  }, [count, range, speed]);

  // Set up instanced mesh
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Set instance count
    mesh.count = count;

    // Set initial matrices and colors
    const dummy = new THREE.Object3D();
    const { positions, colors } = particlePositions;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      
      dummy.position.set(
        positions[i3],
        positions[i3 + 1], 
        positions[i3 + 2]
      );
      dummy.scale.setScalar(0.8 + Math.random() * 0.4); // Random scale variation
      dummy.updateMatrix();
      
      mesh.setMatrixAt(i, dummy.matrix);
    }

    // Set colors
    mesh.geometry.setAttribute('color', new THREE.InstancedBufferAttribute(colors, 3));
    
    mesh.instanceMatrix.needsUpdate = true;
  }, [count, particlePositions]);

  // Ultra-optimized animation loop with frame skipping
  const frameSkipCounter = useRef(0);
  
  useFrame(({ clock, camera }) => {
    const mesh = meshRef.current;
    if (!mesh || !particleData.current || !camera) return;

    // Skip frames for better performance
    frameSkipCounter.current++;
    if (frameSkipCounter.current % UPDATE_SKIP_FRAMES !== 0) return;

    const time = clock.getElapsedTime();
    const deltaTime = (time - timeRef.current) * UPDATE_SKIP_FRAMES; // Compensate for skipped frames
    timeRef.current = time;

    const dummy = new THREE.Object3D();
    const cameraPosition = camera.position;
    
    // Process all particles for smoother motion
    for (let i = 0; i < count; i++) {
      const data = particleData.current[i];
      if (!data) continue;
      
      // Get current matrix
      mesh.getMatrixAt(i, dummy.matrix);
      dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

      // Smooth wave-like movement with improved interpolation
      const waveX = Math.sin(time * data.frequency + data.phase) * data.amplitude * 0.3;
      const waveY = Math.sin(time * data.frequency * 0.8 + data.phase + 1.0) * data.amplitude * 0.2;
      const waveZ = Math.cos(time * data.frequency * 0.6 + data.phase) * data.amplitude * 0.3;
      
      // Calculate smooth target position
      data.smoothTarget.copy(dummy.position);
      data.smoothTarget.x += (data.velocity.x * 2.0 + waveX) * deltaTime;
      data.smoothTarget.y += (data.velocity.y + waveY) * deltaTime;
      data.smoothTarget.z += (data.velocity.z * 2.0 + waveZ) * deltaTime;
      
      // Smooth interpolation for fluid movement
      dummy.position.lerp(data.smoothTarget, 0.1);

      // Smooth boundary wrapping for seamless infinite effect
      const halfRange = range / 2;
      const quarterRange = range / 4;
      
      if (Math.abs(dummy.position.x) > halfRange) {
        dummy.position.x = THREE.MathUtils.lerp(dummy.position.x, -dummy.position.x * 0.8, 0.1);
      }
      if (Math.abs(dummy.position.y) > quarterRange) {
        dummy.position.y = THREE.MathUtils.lerp(dummy.position.y, -dummy.position.y * 0.8, 0.1);
      }
      if (Math.abs(dummy.position.z) > halfRange) {
        dummy.position.z = THREE.MathUtils.lerp(dummy.position.z, -dummy.position.z * 0.8, 0.1);
      }

      // Smooth distance-based scaling and opacity
      const distance = dummy.position.distanceTo(cameraPosition);
      const fadeFactor = Math.max(0.1, 1 - distance / fadeDistance);
      const baseScale = 0.6 + fadeFactor * 0.4;
      const currentScale = dummy.scale.x;
      const targetScale = baseScale * (0.9 + Math.sin(time * 2 + data.phase) * 0.1);
      const smoothScale = THREE.MathUtils.lerp(currentScale, targetScale, 0.05);
      
      dummy.scale.setScalar(smoothScale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, count]}
      frustumCulled={false} // Prevent culling for better ambient effect
    />
  );
}