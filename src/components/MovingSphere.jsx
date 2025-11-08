import React, { useRef, useCallback, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import OptimizedRibbons from './OptimizedRibbons';
import PortalPlane from './PortalPlane';

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
  const previousPositionRef = useRef(new THREE.Vector3(0, SPHERE_HEIGHT_OFFSET, 0));
  const movementVectorRef = useRef(new THREE.Vector3(0, 0, 1)); // Default forward direction
  
  // State for portal plane
  const [planePosition, setPlanePosition] = useState([0, 1.2, 3]);
  const [planeRotation, setPlaneRotation] = useState([0, 0, 0]);

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
        if (child.isMesh && child.geometry && child.geometry.type === 'BufferGeometry' && child.geometry.attributes) {
          // Check if geometry has position attributes (required for raycasting)
          if (!child.geometry.attributes.position) return;
          
          // Look for the first non-grass, non-instanced mesh which should be our ground
          // Also make sure it's not a ribbon or particle system
          const childName = child.name || '';
          const isNotGrass = !childName.includes('grass');
          const isNotInstanced = !childName.includes('instance');
          const isNotRibbon = !childName.includes('ribbon') && !childName.includes('trail');
          const isNotParticle = !childName.includes('particle') && !childName.includes('point');
          
          if (isNotGrass && isNotInstanced && isNotRibbon && isNotParticle) {
            // Found base mesh (no logging for performance)
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

    // First, update sphere XZ position
    sphereRef.current.position.x = nextX;
    sphereRef.current.position.z = nextZ;

    // Calculate plane position based on current sphere position for this frame
    const currentPos = sphereRef.current.position.clone();
    const targetPos = sphereTargetRef.current.clone();
    
    // Calculate front vector from current position toward target
    let frontVector = new THREE.Vector3();
    frontVector.subVectors(targetPos, currentPos);
    
    // If the sphere is close to target or not moving, use previous movement direction
    if (frontVector.length() < 0.1) {
      frontVector.copy(movementVectorRef.current);
    } else {
      frontVector.normalize();
      // Update movement vector for future use
      movementVectorRef.current.copy(frontVector);
    }
    
    // Position the plane 3 units in front of the sphere (using current XZ, but we'll calculate Y)
    const planeXZ = currentPos.clone().add(frontVector.multiplyScalar(10));
    
    // Calculate plane Y position based on ground at plane XZ location
    let planeYHeight = 0; // Default ground level fallback
    
    if (baseMeshRef.current && baseMeshRef.current.geometry && baseMeshRef.current.geometry.attributes) {
      // Additional safety check for geometry attributes
      if (baseMeshRef.current.geometry.attributes.position) {
        try {
          // Raycast down from plane position to find ground height there
          const rayStartPos = new THREE.Vector3(planeXZ.x, 200, planeXZ.z);
          raycaster.set(rayStartPos, rayDirection);
          
          const intersects = raycaster.intersectObject(baseMeshRef.current, true);
          
          if (intersects.length > 0) {
            planeYHeight = Math.max(0, intersects[0].point.y); // Ensure never below Y=0
          } else {
            // Raycast failed - try using sphere's current ground level as fallback
            const sphereRayStart = new THREE.Vector3(sphereRef.current.position.x, 200, sphereRef.current.position.z);
            raycaster.set(sphereRayStart, rayDirection);
            const sphereIntersects = raycaster.intersectObject(baseMeshRef.current, true);
            
            if (sphereIntersects.length > 0) {
              planeYHeight = Math.max(0, sphereIntersects[0].point.y);
            }
          }
        } catch (error) {
          // Silently handle raycast errors and use ground level fallback
          planeYHeight = 0;
        }
      }
    }
    
    // Calculate target sphere Y position based on ground at sphere location
    let targetSphereY = SPHERE_HEIGHT_OFFSET; // Default fallback
    
    if (baseMeshRef.current && baseMeshRef.current.geometry && baseMeshRef.current.geometry.attributes) {
      // Additional safety check for geometry attributes
      if (baseMeshRef.current.geometry.attributes.position) {
        try {
          // Raycast from sphere's current XZ position to find ground height
          const sphereRayStart = new THREE.Vector3(sphereRef.current.position.x, 200, sphereRef.current.position.z);
          raycaster.set(sphereRayStart, rayDirection);
          const sphereIntersects = raycaster.intersectObject(baseMeshRef.current, true);
          
          if (sphereIntersects.length > 0) {
            const groundHeight = Math.max(0, sphereIntersects[0].point.y);
            targetSphereY = groundHeight + SPHERE_HEIGHT_OFFSET;
          } else {
            // Fallback: smooth interpolation to target if raycast fails
            targetSphereY = THREE.MathUtils.lerp(
              sphereRef.current.position.y,
              sphereTargetRef.current.y,
              SPHERE_MOVE_SPEED
            );
          }
        } catch (error) {
          // Silently handle raycast errors and use fallback
          targetSphereY = THREE.MathUtils.lerp(
            sphereRef.current.position.y,
            sphereTargetRef.current.y,
            SPHERE_MOVE_SPEED
          );
        }
      }
    }
    
    // Set sphere Y position directly to maintain precise 1.2 unit offset
    sphereRef.current.position.y = Math.max(1.2, targetSphereY);
    
    // Update plane position - position it 1.2 units above ground at its XZ location
    const newPlanePosition = new THREE.Vector3(planeXZ.x, planeYHeight + 1.2, planeXZ.z);
    setPlanePosition([newPlanePosition.x, newPlanePosition.y, newPlanePosition.z]);
    
    // Calculate rotation to make plane perpendicular to front vector
    const tempObject = new THREE.Object3D();
    tempObject.position.copy(newPlanePosition);
    const lookTarget = newPlanePosition.clone().add(frontVector);
    tempObject.lookAt(lookTarget);
    setPlaneRotation([tempObject.rotation.x, tempObject.rotation.y, tempObject.rotation.z]);

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
      <PortalPlane 
        position={planePosition}
        rotation={planeRotation}
        size={[10,5]}
      />
      <OptimizedRibbons 
        sphereRef={sphereRef}
        enabled={ribbonMode !== 'off'}
        mode={ribbonMode}
      />
    </group>
  );
});

MovingSphere.displayName = 'MovingSphere';

export default MovingSphere;
