import React, { useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

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
const MovingSphere = React.forwardRef(({ onSphereMove }, ref) => {
  const sphereRef = useRef();
  const { camera, scene } = useThree();
  
  // State for target positions
  const sphereTargetRef = useRef(new THREE.Vector3(0, 1.2, 0)); // Start at 1.2 height
  const cameraOffsetRef = useRef(new THREE.Vector3(-CAMERA_DISTANCE, 0, 0));
  const isInitializedRef = useRef(false);
  const baseMeshRef = useRef(null);

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
    
    // Update sphere target position - only update X and Z coordinates
    sphereTargetRef.current.x = hitPoint.x;
    sphereTargetRef.current.z = hitPoint.z;
    // Y will be calculated dynamically based on current position
    
    // Calculate direction from intersection point to current camera position
    // This helps maintain camera behind sphere relative to movement direction
    tempVector.subVectors(camera.position, hitPoint).normalize();
    tempVector.y = 0; // Keep in XZ plane
    tempVector.multiplyScalar(CAMERA_DISTANCE);
    
    // Update camera offset to stay behind sphere
    cameraOffsetRef.current.copy(tempVector);
    
    // Notify parent component of sphere movement
    if (onSphereMove) {
      onSphereMove(sphereTargetRef.current.clone());
    }
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
        if (child.isMesh && child.geometry) {
          // Look for the Ground mesh from the base model
          if (child.geometry.type === 'BufferGeometry' && !child.name.includes('grass')) {
            // console.log('Found base mesh:', child);
            baseMeshRef.current = child;
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
    let nextYHeight = 1.2; // Default fallback height (1.2 above origin)
    
    if (baseMeshRef.current) {
      // Raycast from high above the next XZ position to find ground height
      raycaster.set(
        new THREE.Vector3(nextX, 100, nextZ),
        rayDirection
      );
      
      const intersects = raycaster.intersectObject(baseMeshRef.current, false);
      
      if (intersects.length > 0) {
        const groundHeight = intersects[0].point.y;
        nextYHeight = groundHeight + 1.2; // 1.2 units above the actual ground surface
        
        // Debug logging to verify correct height calculation
        // console.log(`XZ: (${nextX.toFixed(2)}, ${nextZ.toFixed(2)}), Ground: ${groundHeight.toFixed(3)}, Sphere: ${nextYHeight.toFixed(3)}`);
      } else {
        console.log(`No raycast hit at XZ: (${nextX.toFixed(2)}, ${nextZ.toFixed(2)})`);
      }
    }
    
    // Set the sphere position including the calculated Y height
    sphereRef.current.position.x = nextX;
    sphereRef.current.position.z = nextZ;
    sphereRef.current.position.y = nextYHeight;

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
    <mesh
      ref={sphereRef}
      geometry={sphereGeometry}
      material={sphereMaterial}
      castShadow
      receiveShadow
    />
  );
});

MovingSphere.displayName = 'MovingSphere';

export default MovingSphere;
