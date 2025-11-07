import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// Constants
const RIBBON_COUNT = 6;
const MAX_TRAIL_LENGTH = 15;
const RIBBON_WIDTH = 0.2;
const MOVEMENT_THRESHOLD = 0.02;
const TRAIL_LIFETIME = 3000;

/**
 * ProperRibbons - Ribbons that spawn from sphere's back and bend through space
 */
const ProperRibbons = ({ spherePosition, enabled = true }) => {
  const groupRef = useRef();
  const ribbonMeshes = useRef([]);
  const trailHistory = useRef([]);
  const lastPosition = useRef(new THREE.Vector3());
  const lastVelocity = useRef(new THREE.Vector3());

  // Create ribbon materials
  const ribbonMaterials = useMemo(() => {
    const materials = [];
    for (let i = 0; i < RIBBON_COUNT; i++) {
      materials.push(new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.05 + (i / RIBBON_COUNT) * 0.9, 1.0, 0.6),
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
    }
    return materials;
  }, []);

  // Initialize trail
  useEffect(() => {
    if (spherePosition && trailHistory.current.length === 0) {
      trailHistory.current.push({
        position: spherePosition.clone(),
        velocity: new THREE.Vector3(),
        timestamp: Date.now(),
      });
      lastPosition.current.copy(spherePosition);
      console.log('🎀 ProperRibbons: Initialized with sphere position');
    }
  }, [spherePosition]);

  // Get spawn points from the back of the sphere
  const getBackSpawnPoints = (position, velocity) => {
    const spawnPoints = [];
    
    // Calculate backward direction (opposite to velocity)
    let backDirection = new THREE.Vector3(0, 0, -1); // Default backward
    if (velocity.length() > 0.001) {
      backDirection = velocity.clone().normalize().negate();
    }
    
    // Create ring of spawn points at the back of the sphere
    const rightVector = new THREE.Vector3().crossVectors(backDirection, new THREE.Vector3(0, 1, 0)).normalize();
    const upVector = new THREE.Vector3().crossVectors(rightVector, backDirection).normalize();
    
    for (let i = 0; i < RIBBON_COUNT; i++) {
      const angle = (i / RIBBON_COUNT) * Math.PI * 2;
      const radius = 1.1; // Distance from sphere center
      
      // Create offset in a circle behind the sphere
      const offset = rightVector.clone().multiplyScalar(Math.cos(angle) * radius * 0.7)
        .add(upVector.clone().multiplyScalar(Math.sin(angle) * radius * 0.4));
      
      // Position at the back of the sphere
      const spawnPoint = position.clone()
        .add(backDirection.clone().multiplyScalar(radius * 0.8))
        .add(offset);
      
      spawnPoints.push(spawnPoint);
    }
    
    return spawnPoints;
  };

  // Update ribbon geometries
  const updateRibbons = () => {
    const trail = trailHistory.current;
    if (trail.length < 2) return;

    console.log('🎨 ProperRibbons: Updating', RIBBON_COUNT, 'ribbons with', trail.length, 'trail points');

    ribbonMeshes.current.forEach((mesh, ribbonIndex) => {
      if (!mesh) return;

      const geometry = new THREE.BufferGeometry();
      const positions = [];
      const colors = [];
      const indices = [];

      // Build the path for this specific ribbon
      const ribbonPath = [];
      
      for (let i = 0; i < trail.length; i++) {
        const trailPoint = trail[i];
        const backPoints = getBackSpawnPoints(trailPoint.position, trailPoint.velocity);
        
        if (backPoints[ribbonIndex]) {
          ribbonPath.push({
            position: backPoints[ribbonIndex],
            timestamp: trailPoint.timestamp,
          });
        }
      }

      // Create ribbon mesh from path
      for (let i = 0; i < ribbonPath.length; i++) {
        const pathPoint = ribbonPath[i];
        const progress = i / (ribbonPath.length - 1);
        
        // Calculate fade
        const currentTime = Date.now();
        const age = currentTime - pathPoint.timestamp;
        const ageFade = Math.max(0, 1 - (age / TRAIL_LIFETIME));
        const positionFade = Math.max(0.1, 1 - progress * 0.8);
        const alpha = ageFade * positionFade;
        
        if (alpha < 0.01) continue;

        // Calculate direction for ribbon orientation
        let direction = new THREE.Vector3(0, 0, 1);
        if (i < ribbonPath.length - 1) {
          direction.subVectors(ribbonPath[i + 1].position, pathPoint.position).normalize();
        } else if (i > 0) {
          direction.subVectors(pathPoint.position, ribbonPath[i - 1].position).normalize();
        }

        // Create width perpendicular to direction
        const width = new THREE.Vector3()
          .crossVectors(direction, new THREE.Vector3(0, 1, 0))
          .normalize()
          .multiplyScalar(RIBBON_WIDTH * 0.5 * (1 - progress * 0.3)); // Taper

        // Create ribbon vertices
        const leftEdge = pathPoint.position.clone().sub(width);
        const rightEdge = pathPoint.position.clone().add(width);

        const vertIndex = positions.length / 3;
        positions.push(leftEdge.x, leftEdge.y, leftEdge.z);
        positions.push(rightEdge.x, rightEdge.y, rightEdge.z);

        // Set colors
        const material = ribbonMaterials[ribbonIndex];
        const color = material.color.clone().multiplyScalar(alpha);
        
        colors.push(color.r, color.g, color.b);
        colors.push(color.r, color.g, color.b);

        // Create triangles
        if (i > 0) {
          const prevIndex = vertIndex - 2;
          
          // First triangle
          indices.push(prevIndex, prevIndex + 1, vertIndex);
          // Second triangle
          indices.push(prevIndex + 1, vertIndex + 1, vertIndex);
        }
      }

      // Update geometry
      if (positions.length > 0) {
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        mesh.geometry.dispose();
        mesh.geometry = geometry;
        mesh.material.vertexColors = true;
        
        console.log('✅ Updated ribbon', ribbonIndex, 'with', positions.length / 3, 'vertices');
      }
    });
  };

  useFrame((state, delta) => {
    if (!enabled || !spherePosition) return;

    // Calculate velocity
    const distance = spherePosition.distanceTo(lastPosition.current);
    
    if (distance > MOVEMENT_THRESHOLD) {
      // Calculate velocity
      let velocity = new THREE.Vector3();
      if (delta > 0) {
        velocity.subVectors(spherePosition, lastPosition.current).divideScalar(delta);
      }
      
      // Add new trail point
      trailHistory.current.unshift({
        position: spherePosition.clone(),
        velocity: velocity.clone(),
        timestamp: Date.now(),
      });

      // Limit trail length
      if (trailHistory.current.length > MAX_TRAIL_LENGTH) {
        trailHistory.current = trailHistory.current.slice(0, MAX_TRAIL_LENGTH);
      }

      lastPosition.current.copy(spherePosition);
      lastVelocity.current.copy(velocity);
      
      console.log('🚀 ProperRibbons: Added trail point, velocity:', velocity.length().toFixed(3));
    }

    // Clean old trail points
    const currentTime = Date.now();
    trailHistory.current = trailHistory.current.filter(point => {
      return currentTime - point.timestamp < TRAIL_LIFETIME;
    });

    // Update ribbons
    if (trailHistory.current.length >= 2) {
      updateRibbons();
    }
  });

  // Clear when disabled
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

export default ProperRibbons;