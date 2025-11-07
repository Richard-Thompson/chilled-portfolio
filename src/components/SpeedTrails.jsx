import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// Constants for speed trail effect
const MAX_TRAIL_POINTS = 25;
const RIBBON_COUNT = 8;
const RIBBON_WIDTH = 0.2;
const SPAWN_DISTANCE = 1.1; // Distance from sphere center where ribbons spawn
const TRAIL_LIFETIME = 2500;
const MIN_SPEED_FOR_TRAILS = 0.02; // Minimum movement speed to show trails

/**
 * Enhanced SpeedTrails Component
 * 
 * Creates dynamic ribbons that spawn from the back of the sphere relative to movement direction.
 * Shows curved trails when turning and straight trails when moving forward.
 */
const SpeedTrails = ({ spherePosition, enabled = true }) => {
  const groupRef = useRef();
  const trailHistory = useRef([]);
  const lastPosition = useRef(new THREE.Vector3());
  const currentVelocity = useRef(new THREE.Vector3());
  const ribbonMeshes = useRef([]);
  
  // Create ribbon materials with different colors
  const ribbonMaterials = useMemo(() => {
    const materials = [];
    for (let i = 0; i < RIBBON_COUNT; i++) {
      const hue = 0.15 + (i / RIBBON_COUNT) * 0.7; // Orange to cyan range
      materials.push(new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(hue, 0.9, 0.6),
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
    }
    return materials;
  }, []);

  // Initialize position tracking
  useEffect(() => {
    if (spherePosition && trailHistory.current.length === 0) {
      lastPosition.current.copy(spherePosition);
      trailHistory.current.push({
        position: spherePosition.clone(),
        velocity: new THREE.Vector3(),
        timestamp: Date.now()
      });
    }
  }, [spherePosition]);

  // Create spawn points around the back of the sphere
  const getSpawnPoints = (position, velocity, count) => {
    const spawnPoints = [];
    
    // If no velocity, create points around sphere randomly
    if (velocity.length() < 0.001) {
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const x = Math.cos(angle) * SPAWN_DISTANCE;
        const z = Math.sin(angle) * SPAWN_DISTANCE;
        spawnPoints.push(position.clone().add(new THREE.Vector3(x, 0, z)));
      }
      return spawnPoints;
    }

    // Calculate backward direction (opposite to velocity)
    const backwardDir = velocity.clone().normalize().negate();
    
    // Create points in a ring at the back of the sphere
    const rightDir = new THREE.Vector3().crossVectors(backwardDir, new THREE.Vector3(0, 1, 0)).normalize();
    const upDir = new THREE.Vector3().crossVectors(rightDir, backwardDir).normalize();
    
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = SPAWN_DISTANCE;
      
      const ringOffset = rightDir.clone().multiplyScalar(Math.cos(angle) * radius)
        .add(upDir.clone().multiplyScalar(Math.sin(angle) * radius * 0.5)); // Flatten vertically
      
      const spawnPoint = position.clone()
        .add(backwardDir.clone().multiplyScalar(radius * 0.8)) // Move behind sphere
        .add(ringOffset);
        
      spawnPoints.push(spawnPoint);
    }
    
    return spawnPoints;
  };

  // Update trail ribbons
  const updateTrailRibbons = () => {
    const trail = trailHistory.current;
    if (trail.length < 2) return;

    ribbonMeshes.current.forEach((mesh, ribbonIndex) => {
      if (!mesh) return;
      
      const geometry = new THREE.BufferGeometry();
      const positions = [];
      const colors = [];
      const indices = [];
      
      // Create ribbon following one specific path
      const ribbonPath = [];
      
      for (let i = 0; i < trail.length; i++) {
        const point = trail[i];
        const spawnPoints = getSpawnPoints(point.position, point.velocity, RIBBON_COUNT);
        
        if (spawnPoints[ribbonIndex]) {
          ribbonPath.push({
            position: spawnPoints[ribbonIndex],
            timestamp: point.timestamp,
            velocity: point.velocity.clone()
          });
        }
      }
      
      // Build ribbon geometry from path
      for (let i = 0; i < ribbonPath.length; i++) {
        const pathPoint = ribbonPath[i];
        const progress = i / (ribbonPath.length - 1);
        
        // Calculate fade based on position in trail and age
        const currentTime = Date.now();
        const age = currentTime - pathPoint.timestamp;
        const ageFade = Math.max(0, 1 - (age / TRAIL_LIFETIME));
        const positionFade = Math.max(0, 1 - progress * 1.2);
        const alpha = ageFade * positionFade * 0.8;
        
        if (alpha <= 0.01) continue;
        
        // Calculate ribbon direction
        let direction = new THREE.Vector3();
        if (i < ribbonPath.length - 1) {
          direction.subVectors(ribbonPath[i + 1].position, pathPoint.position).normalize();
        } else if (i > 0) {
          direction.subVectors(pathPoint.position, ribbonPath[i - 1].position).normalize();
        } else {
          direction.copy(pathPoint.velocity).normalize();
        }
        
        // Calculate width vector perpendicular to direction
        const width = new THREE.Vector3()
          .crossVectors(direction, new THREE.Vector3(0, 1, 0))
          .normalize()
          .multiplyScalar(RIBBON_WIDTH * 0.5 * (1 - progress * 0.5)); // Taper width
        
        // Create ribbon edges
        const leftEdge = pathPoint.position.clone().sub(width);
        const rightEdge = pathPoint.position.clone().add(width);
        
        positions.push(leftEdge.x, leftEdge.y, leftEdge.z);
        positions.push(rightEdge.x, rightEdge.y, rightEdge.z);
        
        // Set colors with fade
        const material = ribbonMaterials[ribbonIndex];
        const color = material.color.clone().multiplyScalar(alpha);
        
        colors.push(color.r, color.g, color.b);
        colors.push(color.r, color.g, color.b);
        
        // Create triangles for ribbon strip
        if (i < ribbonPath.length - 1 && positions.length >= 4) {
          const baseIndex = (positions.length / 3) - 2;
          
          // First triangle
          indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
          // Second triangle
          indices.push(baseIndex + 1, baseIndex + 3, baseIndex + 2);
        }
      }
      
      // Update geometry
      if (positions.length > 0) {
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        
        mesh.geometry.dispose(); // Clean up old geometry
        mesh.geometry = geometry;
      }
    });
  };

  useFrame((state, delta) => {
    if (!enabled || !spherePosition) return;

    // Calculate current velocity and distance moved
    const distance = spherePosition.distanceTo(lastPosition.current);
    
    if (distance > 0.001) {
      // Calculate velocity
      if (delta > 0) {
        currentVelocity.current.subVectors(spherePosition, lastPosition.current).divideScalar(delta);
      }
      
      // Add trail points for any movement (not just fast movement)
      trailHistory.current.unshift({
        position: spherePosition.clone(),
        velocity: currentVelocity.current.clone(),
        timestamp: Date.now()
      });
      
      // Limit trail length
      if (trailHistory.current.length > MAX_TRAIL_POINTS) {
        trailHistory.current = trailHistory.current.slice(0, MAX_TRAIL_POINTS);
      }
      
      lastPosition.current.copy(spherePosition);
    }

    // Clean up old trail points
    const currentTime = Date.now();
    trailHistory.current = trailHistory.current.filter(point => {
      return currentTime - point.timestamp < TRAIL_LIFETIME;
    });
    
    // Always update ribbon geometries for smooth rendering
    updateTrailRibbons();
  });

  // Clear trails when disabled
  useEffect(() => {
    if (!enabled) {
      trailHistory.current = [];
      ribbonMeshes.current.forEach(mesh => {
        if (mesh && mesh.geometry) {
          mesh.geometry.dispose();
          mesh.geometry = new THREE.BufferGeometry();
        }
      });
    }
  }, [enabled]);

  return (
    <group ref={groupRef}>
      {Array.from({ length: RIBBON_COUNT }).map((_, index) => (
        <mesh
          key={index}
          ref={el => ribbonMeshes.current[index] = el}
          material={ribbonMaterials[index]}
        >
          <bufferGeometry />
        </mesh>
      ))}
    </group>
  );
};

export default SpeedTrails;