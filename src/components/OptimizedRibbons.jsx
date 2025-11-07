import React, { useRef, useMemo, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// Performance-optimized constants
const RIBBON_COUNT = 4; // Four corner ribbons: top-right, top-left, bottom-left, bottom-right
const MAX_TRAIL_POINTS = 20; // Increased for longer ribbons
const RIBBON_WIDTH = 0.25;
const SPAWN_DISTANCE = 1.0;
const TRAIL_LIFETIME = 3500; // Increased for longer ribbons
const MOVEMENT_THRESHOLD = 0.03; // Increased to reduce updates
const UPDATE_FREQUENCY = 3; // Update every 3rd frame for 60fps target

// Pre-allocated objects to avoid garbage collection
const tempVector3 = new THREE.Vector3();
const tempVector3_2 = new THREE.Vector3();
const tempVector3_3 = new THREE.Vector3();
const tempColor = new THREE.Color();

/**
 * Heavily Optimized Ribbon System
 * 
 * Performance optimizations:
 * - Single ribbon system replaces 3 separate ones
 * - Geometry pooling prevents constant create/dispose cycles
 * - Frame-rate aware updates (every 3rd frame)
 * - Pre-allocated objects reduce garbage collection
 * - Simplified geometry creation
 * - Removed expensive operations like computeVertexNormals()
 */
const OptimizedRibbons = ({ sphereRef, enabled = true, mode = 'both' }) => {
  const groupRef = useRef();
  const ribbonMeshes = useRef([]);
  const ribbonGeometries = useRef([]);
  
  // Trail tracking with pre-allocated arrays
  const trailHistory = useRef([]);
  const lastPosition = useRef(new THREE.Vector3());
  const lastVelocity = useRef(new THREE.Vector3());
  const frameCounter = useRef(0);
  
  // Pre-allocated geometry buffers for performance (updated for longer ribbons)
  const geometryBuffers = useRef({
    positions: new Float32Array(MAX_TRAIL_POINTS * 6 * 3), // 6 vertices per segment, 3 components each
    colors: new Float32Array(MAX_TRAIL_POINTS * 6 * 3),
    indices: new Uint16Array(MAX_TRAIL_POINTS * 6)
  });

  // Optimized ribbon materials - created once and reused
  const ribbonMaterials = useMemo(() => {
    const materials = [];
    for (let i = 0; i < RIBBON_COUNT; i++) {
      // Off-white color with subtle variations
      const offWhiteColor = new THREE.Color(0.95, 0.93, 0.88); // Warm off-white
      // Add very subtle color variation per ribbon
      const variation = (i / RIBBON_COUNT) * 0.05;
      offWhiteColor.r += variation * 0.02;
      offWhiteColor.g += variation * 0.01;
      offWhiteColor.b -= variation * 0.01;
      
      materials.push(new THREE.MeshBasicMaterial({
        color: offWhiteColor,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexColors: true
      }));
    }
    return materials;
  }, []);

  // Create ribbon spawn angles for four corners: top-right, top-left, bottom-left, bottom-right
  const spawnAngles = useMemo(() => {
    // Define the four corner positions in 3D space around the back of the sphere
    return [
      { angle: Math.PI * 1.25, height: 0.3, label: 'top-right' },    // 225° - back right, elevated
      { angle: Math.PI * 0.75, height: 0.3, label: 'top-left' },     // 135° - back left, elevated  
      { angle: Math.PI * 0.75, height: -0.2, label: 'bottom-left' }, // 135° - back left, lowered
      { angle: Math.PI * 1.25, height: -0.2, label: 'bottom-right' } // 225° - back right, lowered
    ];
  }, []);

  // Initialize geometries once
  useEffect(() => {
    ribbonGeometries.current = [];
    for (let i = 0; i < RIBBON_COUNT; i++) {
      const geometry = new THREE.BufferGeometry();
      
      // Pre-allocate attribute buffers
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_TRAIL_POINTS * 6 * 3), 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_TRAIL_POINTS * 6 * 3), 3));
      geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(MAX_TRAIL_POINTS * 6), 1));
      
      ribbonGeometries.current.push(geometry);
    }
  }, []);

  // Optimized trail position tracking
  const updateTrailHistory = useCallback((newPosition, delta) => {
    if (!newPosition) return false;
    
    const distance = newPosition.distanceTo(lastPosition.current);
    if (distance < MOVEMENT_THRESHOLD) return false;

    // Calculate velocity efficiently
    tempVector3.subVectors(newPosition, lastPosition.current);
    if (delta > 0) tempVector3.divideScalar(delta);
    
    // Add new trail point
    trailHistory.current.unshift({
      position: newPosition.clone(),
      velocity: tempVector3.clone(),
      timestamp: performance.now()
    });
    
    // Trail updated successfully

    // Limit trail length (more efficient than slice)
    if (trailHistory.current.length > MAX_TRAIL_POINTS) {
      trailHistory.current.length = MAX_TRAIL_POINTS;
    }

    lastPosition.current.copy(newPosition);
    lastVelocity.current.copy(tempVector3);
    
    return true;
  }, []);

  // Calculate spawn offset for four corner ribbons
  const calculateSpawnOffset = useCallback((velocity, ribbonIndex) => {
    // Get the corner definition for this ribbon
    const corner = spawnAngles[ribbonIndex];
    const { angle, height } = corner;
    
    // Base spawn distance
    const spawnDistance = SPAWN_DISTANCE;
    
    // Calculate velocity strength for smooth interpolation
    const velocityLength = velocity.length();
    const velocityStrength = Math.min(velocityLength / 0.1, 1.0); // Normalize to 0-1 over 0.1 units/sec
    
    // Static corner position (default state)
    const staticX = Math.cos(angle) * spawnDistance;
    const staticZ = Math.sin(angle) * spawnDistance;
    
    if (velocityLength > 0.001) {
      // When moving, rotate the corner pattern to align with movement direction
      const velNorm = velocity.clone().normalize();
      
      // Calculate rotation angle to align pattern with movement
      const movementYaw = Math.atan2(velNorm.x, velNorm.z);
      
      // Calculate position in local space (corner position)
      const localX = Math.cos(angle) * spawnDistance;
      const localZ = Math.sin(angle) * spawnDistance;
      
      // Rotate the pattern to face away from movement direction
      const rotatedX = localX * Math.cos(movementYaw) - localZ * Math.sin(movementYaw);
      const rotatedZ = localX * Math.sin(movementYaw) + localZ * Math.cos(movementYaw);
      
      // Smoothly interpolate between static and dynamic positioning
      const finalX = THREE.MathUtils.lerp(staticX, rotatedX, velocityStrength);
      const finalZ = THREE.MathUtils.lerp(staticZ, rotatedZ, velocityStrength);
      
      return new THREE.Vector3(
        finalX,
        height, // Use the corner-specific height (positive = top, negative = bottom)
        finalZ
      );
    } else {
      // No velocity - static corner positioning
      return new THREE.Vector3(
        staticX,
        height, // Use the corner-specific height
        staticZ
      );
    }
  }, [spawnAngles]);

  // Highly optimized geometry update
  const updateRibbonGeometry = useCallback((ribbonIndex) => {
    const trail = trailHistory.current;
    if (trail.length < 2) return;

    const geometry = ribbonGeometries.current[ribbonIndex];
    const currentTime = performance.now();
    
    const positions = geometryBuffers.current.positions;
    const colors = geometryBuffers.current.colors;
    const indices = geometryBuffers.current.indices;
    
    let vertexCount = 0;
    let indexCount = 0;

    // Build ribbon geometry efficiently
    for (let i = 0; i < trail.length - 1; i++) {
      const point = trail[i];
      const nextPoint = trail[i + 1];
      
      // Debug: Log high Y positions
      if (point.position.y > 2 && ribbonIndex === 0 && Math.random() < 0.05) {
        console.log('🎀 Processing high Y trail point:', {
          y: point.position.y.toFixed(2),
          trailIndex: i,
          age: (currentTime - point.timestamp).toFixed(0)
        });
      }
      
      // Age-based fade
      const age = currentTime - point.timestamp;
      const ageFade = Math.max(0, 1 - (age / TRAIL_LIFETIME));
      if (ageFade <= 0.01) continue;

      // Position fade
      const progress = i / (trail.length - 1);
      const positionFade = Math.max(0.1, 1 - progress * 0.8);
      const alpha = ageFade * positionFade * 0.8;

      // Calculate dynamic spawn offset based on velocity
      const spawnOffset = calculateSpawnOffset(point.velocity, ribbonIndex);
      
      // Calculate ribbon center with dynamic offset
      tempVector3.copy(point.position).add(spawnOffset);
      
      // For next point, use its velocity too for smooth transitions
      const nextSpawnOffset = calculateSpawnOffset(nextPoint.velocity, ribbonIndex);
      tempVector3_2.copy(nextPoint.position).add(nextSpawnOffset);

      // Calculate direction and width vector efficiently
      tempVector3_3.subVectors(tempVector3_2, tempVector3).normalize();
      
      // Width perpendicular to direction
      const width = RIBBON_WIDTH * 0.5 * (1 - progress * 0.3);
      const widthX = tempVector3_3.z * width;
      const widthZ = -tempVector3_3.x * width;

      // Create ribbon segment (2 triangles, 4 vertices)
      const baseIndex = vertexCount;
      
      // Left edge current
      positions[vertexCount * 3] = tempVector3.x - widthX;
      positions[vertexCount * 3 + 1] = tempVector3.y;
      positions[vertexCount * 3 + 2] = tempVector3.z - widthZ;
      
      // Right edge current
      positions[(vertexCount + 1) * 3] = tempVector3.x + widthX;
      positions[(vertexCount + 1) * 3 + 1] = tempVector3.y;
      positions[(vertexCount + 1) * 3 + 2] = tempVector3.z + widthZ;
      
      // Left edge next
      positions[(vertexCount + 2) * 3] = tempVector3_2.x - widthX;
      positions[(vertexCount + 2) * 3 + 1] = tempVector3_2.y;
      positions[(vertexCount + 2) * 3 + 2] = tempVector3_2.z - widthZ;
      
      // Right edge next
      positions[(vertexCount + 3) * 3] = tempVector3_2.x + widthX;
      positions[(vertexCount + 3) * 3 + 1] = tempVector3_2.y;
      positions[(vertexCount + 3) * 3 + 2] = tempVector3_2.z + widthZ;

      // Set colors efficiently with off-white base and fade
      tempColor.copy(ribbonMaterials[ribbonIndex].color).multiplyScalar(alpha);
      for (let v = 0; v < 4; v++) {
        colors[(vertexCount + v) * 3] = tempColor.r;
        colors[(vertexCount + v) * 3 + 1] = tempColor.g;
        colors[(vertexCount + v) * 3 + 2] = tempColor.b;
      }

      // Create indices for 2 triangles
      indices[indexCount] = baseIndex;
      indices[indexCount + 1] = baseIndex + 1;
      indices[indexCount + 2] = baseIndex + 2;
      indices[indexCount + 3] = baseIndex + 1;
      indices[indexCount + 4] = baseIndex + 3;
      indices[indexCount + 5] = baseIndex + 2;

      vertexCount += 4;
      indexCount += 6;
    }

    // Update geometry attributes efficiently
    if (vertexCount > 0) {
      geometry.attributes.position.array.set(positions.subarray(0, vertexCount * 3));
      geometry.attributes.color.array.set(colors.subarray(0, vertexCount * 3));
      geometry.index.array.set(indices.subarray(0, indexCount));
      
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
      geometry.index.needsUpdate = true;
      
      // Ensure proper bounding box calculation for high altitude positions
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      
      geometry.setDrawRange(0, indexCount);
    } else {
      // No geometry to draw
      geometry.setDrawRange(0, 0);
    }
  }, [calculateSpawnOffset, ribbonMaterials]);

  // Initialize trail (will be done in useFrame now)
  const isInitialized = useRef(false);

  // Optimized frame loop with reduced update frequency
  useFrame((state, delta) => {
    if (!enabled || !sphereRef?.current || mode === 'off') return;

    const currentSpherePosition = sphereRef.current.position;
    
    // Debug: Check if ribbons are being disabled due to height
    if (currentSpherePosition.y > 2 && Math.random() < 0.1) {
      console.log('🎀 Ribbon system at high Y:', {
        y: currentSpherePosition.y.toFixed(2),
        trailCount: trailHistory.current.length,
        enabled: enabled,
        mode: mode
      });
    }
    
    // Initialize on first run
    if (!isInitialized.current && currentSpherePosition) {
      // Ribbon system initialized
      trailHistory.current.push({
        position: currentSpherePosition.clone(),
        velocity: new THREE.Vector3(),
        timestamp: performance.now()
      });
      lastPosition.current.copy(currentSpherePosition);
      isInitialized.current = true;
      return;
    }

    frameCounter.current++;
    
    // Update trail history every frame for smooth movement tracking
    const trailUpdated = updateTrailHistory(currentSpherePosition, delta);
    
    // Update geometries less frequently for performance
    if (frameCounter.current % UPDATE_FREQUENCY === 0 || trailUpdated) {
      // Clean old trail points
      const currentTime = performance.now();
      const originalLength = trailHistory.current.length;
      trailHistory.current = trailHistory.current.filter(point => 
        currentTime - point.timestamp < TRAIL_LIFETIME
      );
      
      // Update all ribbon geometries
      for (let i = 0; i < RIBBON_COUNT; i++) {
        updateRibbonGeometry(i);
      }
    }
  });

  // Clear when disabled
  useEffect(() => {
    if (!enabled || mode === 'off') {
      trailHistory.current = [];
      ribbonGeometries.current.forEach(geometry => {
        if (geometry) {
          geometry.setDrawRange(0, 0);
        }
      });
    }
  }, [enabled, mode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      ribbonGeometries.current.forEach(geometry => {
        if (geometry) {
          geometry.dispose();
        }
      });
      ribbonMaterials.forEach(material => {
        material.dispose();
      });
    };
  }, [ribbonMaterials]);

  if (!enabled || mode === 'off') return null;

  return (
    <group ref={groupRef}>
      {ribbonGeometries.current.map((geometry, index) => (
        <mesh
          key={index}
          ref={el => ribbonMeshes.current[index] = el}
          geometry={geometry}
          material={ribbonMaterials[index]}
        />
      ))}
    </group>
  );
};

export default OptimizedRibbons;