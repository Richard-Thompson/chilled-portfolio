import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// Constants for ribbon behavior
const MAX_TRAIL_LENGTH = 15; // Maximum number of trail points
const RIBBON_WIDTH = 0.3; // Width of each ribbon (increased for visibility)
const RIBBON_COUNT = 4; // Number of ribbons around the sphere
const RIBBON_OFFSET = 1.2; // Distance from sphere center
const MOVEMENT_THRESHOLD = 0.01; // Minimum movement to add new trail point (lowered)
const TRAIL_LIFETIME = 4000; // How long trail points last in milliseconds

/**
 * SpeedRibbons Component
 * 
 * Creates trailing ribbons behind a moving sphere that show speed and direction.
 * The ribbons bend through space following the sphere's movement history.
 * When moving forward, ribbons are straight. When turning, ribbons show the curved path.
 */
const SpeedRibbons = ({ spherePosition, enabled = true }) => {
  const groupRef = useRef();
  const trailHistory = useRef([]);
  const lastPosition = useRef(new THREE.Vector3());
  const ribbonMeshes = useRef([]);
  
  // Create ribbon materials with different colors
  const ribbonData = useMemo(() => {
    const ribbons = [];
    
    for (let i = 0; i < RIBBON_COUNT; i++) {
      // Position ribbons around the back of the sphere
      const angle = (i / RIBBON_COUNT) * Math.PI * 2;
      const offsetX = Math.cos(angle) * RIBBON_OFFSET;
      const offsetZ = Math.sin(angle) * RIBBON_OFFSET;
      
      // Create geometry for this ribbon
      const geometry = new THREE.BufferGeometry();
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.1 + (i / RIBBON_COUNT) * 0.8, 1.0, 0.6),
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      
      ribbons.push({
        geometry,
        material,
        offsetX,
        offsetZ,
        angle,
      });
    }
    
    return ribbons;
  }, []);  // Initialize trail history when sphere position is first available
  useEffect(() => {
    if (spherePosition && trailHistory.current.length === 0) {
      console.log('🎀 SpeedRibbons: Initializing with position:', spherePosition);
      // Initialize with current position
      trailHistory.current.push({
        position: spherePosition.clone(),
        timestamp: Date.now()
      });
      lastPosition.current.copy(spherePosition);
    }
  }, [spherePosition]);

  // Update ribbon geometries based on trail history
  const updateRibbonGeometries = () => {
    const trail = trailHistory.current;
    if (trail.length < 2) return;

    console.log('🎨 SpeedRibbons: Updating geometries with', trail.length, 'trail points');

    ribbonData.forEach((ribbonInfo, ribbonIndex) => {
      const { geometry, offsetX, offsetZ } = ribbonInfo;
      const positions = [];
      const colors = [];
      const indices = [];

      // Create ribbon strip following the trail
      for (let i = 0; i < trail.length; i++) {
        const point = trail[i];
        const progress = i / (trail.length - 1);
        const fadeAlpha = Math.max(0.2, 1 - progress); // Keep some minimum opacity
        
        // Simple ribbon position - offset from sphere trail
        const ribbonCenter = point.position.clone();
        ribbonCenter.x += offsetX * 0.5; // Reduced offset for visibility
        ribbonCenter.z += offsetZ * 0.5;
        ribbonCenter.y += 0.2; // Lift ribbons slightly above ground

        // Simple forward direction
        let direction = new THREE.Vector3(0, 0, 1);
        if (i < trail.length - 1) {
          direction.subVectors(trail[i + 1].position, point.position).normalize();
        }

        // Calculate width vector
        const perpendicular = new THREE.Vector3()
          .crossVectors(direction, new THREE.Vector3(0, 1, 0))
          .normalize()
          .multiplyScalar(RIBBON_WIDTH * 0.5);

        // Create ribbon edges
        const leftPos = ribbonCenter.clone().sub(perpendicular);
        const rightPos = ribbonCenter.clone().add(perpendicular);

        const vertIndex = positions.length / 3;
        positions.push(leftPos.x, leftPos.y, leftPos.z);
        positions.push(rightPos.x, rightPos.y, rightPos.z);

        // Bright colors for visibility
        const hue = 0.1 + (ribbonIndex / RIBBON_COUNT) * 0.8;
        const color = new THREE.Color().setHSL(hue, 1.0, 0.6);
        
        colors.push(color.r, color.g, color.b);
        colors.push(color.r, color.g, color.b);

        // Create triangles
        if (i > 0) {
          const prevVertIndex = vertIndex - 2;
          
          // First triangle
          indices.push(prevVertIndex, prevVertIndex + 1, vertIndex);
          // Second triangle  
          indices.push(prevVertIndex + 1, vertIndex + 1, vertIndex);
        }
      }

      // Update geometry
      if (positions.length > 0) {
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        
        ribbonInfo.material.vertexColors = true;
        console.log('✅ Updated ribbon', ribbonIndex, 'with', positions.length / 3, 'vertices');
      }
    });
  };

  useFrame(() => {
    if (!enabled || !spherePosition) return;

    // Always update for real-time feedback - check if sphere position changed
    const distance = spherePosition.distanceTo(lastPosition.current);
    
    if (distance > MOVEMENT_THRESHOLD) {
      // Add new trail point
      trailHistory.current.unshift({
        position: spherePosition.clone(),
        timestamp: Date.now()
      });

      // Limit trail length
      if (trailHistory.current.length > MAX_TRAIL_LENGTH) {
        trailHistory.current = trailHistory.current.slice(0, MAX_TRAIL_LENGTH);
      }

      lastPosition.current.copy(spherePosition);
    }

    // Clean up old trail points
    const currentTime = Date.now();
    const previousLength = trailHistory.current.length;
    trailHistory.current = trailHistory.current.filter(point => {
      const age = currentTime - point.timestamp;
      return age < TRAIL_LIFETIME;
    });

    // Update geometries if we have trail points (always update for smooth fading)
    if (trailHistory.current.length >= 1) {
      updateRibbonGeometries();
    }
    
    // Force update if trail changed
    if (trailHistory.current.length !== previousLength || distance > 0) {
      updateRibbonGeometries();
    }
  });

  // Clear trail when disabled
  useEffect(() => {
    if (!enabled) {
      trailHistory.current = [];
      ribbonData.forEach(ribbonInfo => {
        ribbonInfo.geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
        ribbonInfo.geometry.setAttribute('color', new THREE.Float32BufferAttribute([], 3));
        ribbonInfo.geometry.setIndex([]);
      });
    }
  }, [enabled, ribbonData]);

  return (
    <group ref={groupRef}>
      {ribbonData.map((ribbonInfo, index) => (
        <mesh
          key={index}
          ref={el => ribbonMeshes.current[index] = el}
          geometry={ribbonInfo.geometry}
          material={ribbonInfo.material}
        />
      ))}
    </group>
  );
};

export default SpeedRibbons;