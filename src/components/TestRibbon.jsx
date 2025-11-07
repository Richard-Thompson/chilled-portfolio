import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// Test ribbon that properly follows movement path
const TestRibbon = ({ spherePosition, enabled }) => {
  const groupRef = useRef();
  const cubesRef = useRef([]);
  const trailPositions = useRef([]);
  const lastPosition = useRef(new THREE.Vector3());

  useEffect(() => {
    if (spherePosition && enabled) {
      console.log('🔥 TestRibbon: Enabled with sphere position:', spherePosition);
      // Initialize with current position if first time
      if (trailPositions.current.length === 0) {
        trailPositions.current.push(spherePosition.clone());
        lastPosition.current.copy(spherePosition);
      }
    }
  }, [spherePosition, enabled]);

  useFrame(() => {
    if (!enabled || !spherePosition) return;

    // Check if sphere moved enough to add new trail point
    const distance = spherePosition.distanceTo(lastPosition.current);
    
    if (distance > 0.05) { // Only add points when sphere moves significantly
      // Add current position to trail
      trailPositions.current.unshift(spherePosition.clone());
      
      // Keep only last 8 positions for trail
      if (trailPositions.current.length > 8) {
        trailPositions.current = trailPositions.current.slice(0, 8);
      }
      
      lastPosition.current.copy(spherePosition);
      console.log('✅ TestRibbon: Trail updated, now has', trailPositions.current.length, 'positions');
    }

    // Update cube positions to follow trail
    cubesRef.current.forEach((cube, i) => {
      if (cube && trailPositions.current[i + 1]) { // Skip current position, start from trail
        const trailPos = trailPositions.current[i + 1];
        cube.position.set(
          trailPos.x,
          trailPos.y + 0.5, // Lift above ground
          trailPos.z
        );
        
        // Make cubes face the movement direction
        if (trailPositions.current[i]) {
          const direction = new THREE.Vector3()
            .subVectors(trailPositions.current[i], trailPos)
            .normalize();
          cube.lookAt(
            trailPos.x + direction.x,
            trailPos.y + direction.y,
            trailPos.z + direction.z
          );
        }
      }
    });
  });

  if (!enabled) return null;

  return (
    <group ref={groupRef}>
      {/* Trailing cubes that follow the actual movement path */}
      {Array.from({ length: 6 }).map((_, i) => (
        <mesh
          key={i}
          ref={el => cubesRef.current[i] = el}
          position={[0, 1, 0]} // Will be updated in useFrame
        >
          <boxGeometry args={[0.15, 0.15, 0.6]} /> {/* Elongated to show direction */}
          <meshBasicMaterial 
            color={new THREE.Color().setHSL(i * 0.15, 1.0, 0.6)} 
            transparent
            opacity={Math.max(0.2, 1.0 - (i * 0.12))}
          />
        </mesh>
      ))}
    </group>
  );
};

export default TestRibbon;