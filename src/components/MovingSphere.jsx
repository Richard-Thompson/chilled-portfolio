import React, { useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import SpeedRibbons from './SpeedRibbons';
import SpeedTrails from './SpeedTrails';
import TestRibbon from './TestRibbon';
import ProperRibbons from './ProperRibbons';

// Constants for smooth movement and camera behavior
const SPHERE_MOVE_SPEED = 0.01; // How fast sphere moves to target
const CAMERA_FOLLOW_SPEED = 0.01; // How fast camera follows sphere
const CAMERA_DISTANCE = 5.0; // Distance camera stays behind sphere
const CAMERA_HEIGHT_OFFSET = 1.2; // Height offset above surface
const SPHERE_HEIGHT_OFFSET = 1.2; // Height of sphere above surface (changed to 1.2 as requested)

// Reusable vectors to avoid object creation in render loop
const tempVector = new THREE.Vector3();
const cameraTargetPosition = new THREE.Vector3();
const lookAtTarget = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const rayDirection = new THREE.Vector3(0, -1, 0);

/**
 * MovingSphere Component
 * 
 * Features:
 * - Sphere that moves to raycasted positions on base mesh
 * - Smooth interpolation to target positions
 * - Camera follows behind sphere in XZ plane
 * - Camera maintains fixed height offset above surface
 * - Responds to onPointerMove events from base mesh
 */
const MovingSphere = React.forwardRef(({ onSphereMove, ribbonMode = 'both' }, ref) => {
  const sphereRef = useRef();
  const { camera, scene } = useThree();
  
  // State for target positions
  const sphereTargetRef = useRef(new THREE.Vector3(0, SPHERE_HEIGHT_OFFSET, 0)); // Start at 1.2 height
  const cameraOffsetRef = useRef(new THREE.Vector3(-CAMERA_DISTANCE, 0, 0));
  const isInitializedRef = useRef(false);
  const baseMeshRef = useRef(null);
  const [currentPosition, setCurrentPosition] = React.useState(new THREE.Vector3(0, SPHERE_HEIGHT_OFFSET, 0)); // Use state for ribbons

  // Initialize sphere and camera positions
  const initializePositions = useCallback(() => {
    if (!isInitializedRef.current && sphereRef.current) {
      sphereRef.current.position.copy(sphereTargetRef.current);
      
      // Set initial camera position behind sphere
      cameraTargetPosition.copy(sphereTargetRef.current);
      cameraTargetPosition.add(cameraOffsetRef.current);
      cameraTargetPosition.y += CAMERA_HEIGHT_OFFSET;
      camera.position.copy(cameraTargetPosition);
      
      isInitializedRef.current = true;
    }
  }, [camera]);

  // Handle pointer move events from base mesh
  const handlePointerMove = useCallback((event) => {
    if (!event.intersections || event.intersections.length === 0) return;
    
    const intersection = event.intersections[0];
    const hitPoint = intersection.point;
    
    // Update sphere target position - set X and Z coordinates
    sphereTargetRef.current.x = hitPoint.x;
    sphereTargetRef.current.z = hitPoint.z;
    // Set initial target Y - it will be refined by raycast in the frame loop
    // Use the hit point Y plus offset as a good starting estimate
    sphereTargetRef.current.y = hitPoint.y + SPHERE_HEIGHT_OFFSET;
    
    // Calculate direction from intersection point to current camera position
    // This helps maintain camera behind sphere relative to movement direction
    tempVector.subVectors(camera.position, hitPoint).normalize();
    tempVector.y = 0; // Keep in XZ plane
    tempVector.multiplyScalar(CAMERA_DISTANCE);
    
    // Update camera offset to stay behind sphere
    cameraOffsetRef.current.copy(tempVector);
    
    // Don't notify parent here - wait until sphere actually moves in useFrame
    // This prevents grass bending at cursor position instead of sphere position
  }, [camera, onSphereMove]);

  // Expose the pointer move handler to parent components
  React.useImperativeHandle(ref, () => ({
    handlePointerMove
  }));

  // Animation loop for smooth movement
  useFrame((state, delta) => {
    if (!sphereRef.current || !isInitializedRef.current) {
      initializePositions();
      return;
    }

    // Find base mesh if not cached - look for the Ground mesh specifically
    if (!baseMeshRef.current && scene) {
      scene.traverse((child) => {
        if (child.isMesh && child.geometry && child.geometry.type === 'BufferGeometry') {
          // Look for the first non-grass, non-instanced mesh which should be our ground
          // Also make sure it's not a ribbon or particle system
          const childName = child.name || '';
          const isNotGrass = !childName.includes('grass');
          const isNotInstanced = !childName.includes('instance');
          const isNotRibbon = !childName.includes('ribbon') && !childName.includes('trail');
          const isNotParticle = !childName.includes('particle') && !childName.includes('point');
          
          if (isNotGrass && isNotInstanced && isNotRibbon && isNotParticle) {
            console.log('✅ Found base mesh:', childName || 'unnamed', 'geometry vertices:', child.geometry.attributes.position?.count);
            baseMeshRef.current = child;
            return; // Stop searching once we find it
          }
        }
      });
    }

    // Calculate the next XZ position for the sphere
    const nextX = THREE.MathUtils.lerp(
      sphereRef.current.position.x, 
      sphereTargetRef.current.x, 
      SPHERE_MOVE_SPEED
    );
    const nextZ = THREE.MathUtils.lerp(
      sphereRef.current.position.z, 
      sphereTargetRef.current.z, 
      SPHERE_MOVE_SPEED
    );

    // Raycast down from the NEXT position to find ground height there
    let nextYHeight = SPHERE_HEIGHT_OFFSET; // Default fallback height using constant
    
    if (baseMeshRef.current) {
      // Raycast from high above the next XZ position to find ground height
      // Start from a very high position to ensure we're above any terrain
      const rayStartPos = new THREE.Vector3(nextX, 200, nextZ);
      raycaster.set(rayStartPos, rayDirection);
      
      // Make sure raycast can detect the mesh by checking both the mesh and its children
      const intersects = raycaster.intersectObject(baseMeshRef.current, true);
      
      if (intersects.length > 0) {
        const groundHeight = intersects[0].point.y;
        nextYHeight = groundHeight + SPHERE_HEIGHT_OFFSET; // Always 1.2 units above the ground at current XZ position
        
        // Debug logging to verify correct height calculation (reduced frequency)
        if (Math.random() < 0.02) { // Only log 2% of the time to reduce console spam
          console.log(`✅ Raycast hit - XZ: (${nextX.toFixed(2)}, ${nextZ.toFixed(2)}), Ground: ${groundHeight.toFixed(3)}, Sphere: ${nextYHeight.toFixed(3)} (Ground + ${SPHERE_HEIGHT_OFFSET})`);
        }
      } else {
        // If raycast fails, try to interpolate Y position smoothly to avoid jumps
        const targetY = THREE.MathUtils.lerp(
          sphereRef.current.position.y, 
          sphereTargetRef.current.y, 
          SPHERE_MOVE_SPEED
        );
        nextYHeight = targetY;
        
        if (Math.random() < 0.1) { // Log raycast failures more frequently to debug
          console.log(`❌ No raycast hit at XZ: (${nextX.toFixed(2)}, ${nextZ.toFixed(2)}), using interpolated Y: ${nextYHeight.toFixed(3)}`);
          console.log(`   Base mesh:`, baseMeshRef.current.name || 'unnamed', 'vertices:', baseMeshRef.current.geometry?.attributes.position?.count);
        }
      }
    } else {
      // No base mesh found yet, use smooth interpolation to target
      const targetY = THREE.MathUtils.lerp(
        sphereRef.current.position.y, 
        sphereTargetRef.current.y, 
        SPHERE_MOVE_SPEED
      );
      nextYHeight = targetY;
      console.log(`❌ No base mesh found yet, using interpolated Y: ${nextYHeight.toFixed(3)}`);
    }
    
    // Set the sphere position with the calculated height at the current XZ position
    // The sphere should always be exactly 1.2 units above the ground at its current XZ position
    sphereRef.current.position.x = nextX;
    sphereRef.current.position.z = nextZ;
    sphereRef.current.position.y = nextYHeight; // Use the calculated height directly, no interpolation

    // Update current position state for ribbons
    setCurrentPosition(sphereRef.current.position.clone());

    // Notify parent of the sphere's current actual position every frame
    if (onSphereMove) {
      onSphereMove(sphereRef.current.position.clone());
    }

    // Calculate camera target position
    cameraTargetPosition.copy(sphereRef.current.position);
    cameraTargetPosition.add(cameraOffsetRef.current);
    cameraTargetPosition.y = sphereRef.current.position.y + CAMERA_HEIGHT_OFFSET;

    // Smooth camera movement
    camera.position.lerp(cameraTargetPosition, CAMERA_FOLLOW_SPEED);

    // Make camera look at sphere
    lookAtTarget.copy(sphereRef.current.position);
    lookAtTarget.y += 0.5; // Look slightly above sphere center
    camera.lookAt(lookAtTarget);

    // console.log({sphereTargetRef: sphereTargetRef.current.x})
    // No floating animation - maintain exact 1.2 height above ground
  });

  // Memoized sphere geometry and material for performance
  const sphereGeometry = useMemo(() => new THREE.SphereGeometry(0.9, 16, 12), []);
  const sphereMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#fff',
    metalness: 1.0,
    roughness: 0.0,
    emissive: '#fff',
    emissiveIntensity: 0.5  // Increased for better bloom visibility
  }), []);

  return (
    <group>
      <mesh
        ref={sphereRef}
        geometry={sphereGeometry}
        material={sphereMaterial}
        castShadow
        receiveShadow
      />
      <TestRibbon 
        spherePosition={currentPosition}
        enabled={ribbonMode !== 'off'}
      />
      <ProperRibbons 
        spherePosition={currentPosition}
        enabled={ribbonMode === 'basic' || ribbonMode === 'both'}
      />
      <SpeedTrails 
        spherePosition={currentPosition} 
        enabled={ribbonMode === 'speed' || ribbonMode === 'both'}
      />
    </group>
  );
});

MovingSphere.displayName = 'MovingSphere';

export default MovingSphere;
