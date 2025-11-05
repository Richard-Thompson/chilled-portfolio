import { useRef, useEffect } from "react";
import { useKeyboardControls } from "@react-three/drei";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";

/**
 * XZ-Plane Movement Controls with Limited Pitch
 * 
 * Features:
 * - XZ plane movement constrained to base mesh surface
 * - Mouse controls for yaw (left/right) and limited pitch (up/down)
 * - WASD/Arrow keys for forward/backward/strafe movement
 * - Automatic height adjustment to stay above ground
 * - Limited pitch rotation to look slightly up/down at mesh
 * - Smooth camera movement and rotation
 */

// Movement and camera constants
const SPEED = 5; // Movement speed
const DAMPING = 0.25; // Movement damping
const MIN_SPEED = 1.1;
const ACCELERATION = 3.4;
const MAX_XY_DISTANCE = 100.0; // Maximum distance from XY plane
const CAMERA_HEIGHT = 2.0; // Always stay 2.0 units above base mesh
const BASE_MESH_HEIGHT = 0.35; // Base mesh height offset

// Mouse controls
const MOUSE_SENSITIVITY = 0.002; // Mouse sensitivity
const MAX_PITCH = Math.PI / 6; // 30 degrees max pitch up/down
const PITCH_DAMPING = 0.95; // Pitch smoothing

// Reusable objects to avoid creating new objects every frame
const forwardDirection = new THREE.Vector3();
const rightDirection = new THREE.Vector3();
const tempVector = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const rayDirection = new THREE.Vector3(0, -1, 0);

const FPSControls = () => {
  const [, getKeys] = useKeyboardControls();
  const { camera, scene, gl } = useThree();
  
  // Movement and rotation state
  const velocityRef = useRef(new THREE.Vector3());
  const yawRef = useRef(0); // Horizontal rotation
  const pitchRef = useRef(0); // Vertical rotation (limited)
  const groundMeshRef = useRef(null);
  const isMouseLockedRef = useRef(false);
  const mouseDeltaRef = useRef({ x: 0, y: 0 });

  // Mouse controls setup
  useEffect(() => {
    const canvas = gl.domElement;
    
    const handleMouseMove = (event) => {
      if (!isMouseLockedRef.current) return;
      
      mouseDeltaRef.current.x += event.movementX * MOUSE_SENSITIVITY;
      mouseDeltaRef.current.y += event.movementY * MOUSE_SENSITIVITY;
    };
    
    const handleClick = () => {
      if (!isMouseLockedRef.current) {
        canvas.requestPointerLock();
      }
    };
    
    const handlePointerLockChange = () => {
      isMouseLockedRef.current = document.pointerLockElement === canvas;
    };
    
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    
    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
    };
  }, [gl]);

  useFrame((state, delta) => {
    if (!camera || !scene) return;

    // Find ground mesh if not already cached
    if (!groundMeshRef.current) {
      scene.traverse((child) => {
        if (child.isMesh && child.geometry && child.name !== 'grass') {
          groundMeshRef.current = child;
        }
      });
    }

    // Handle mouse rotation
    if (isMouseLockedRef.current) {
      yawRef.current -= mouseDeltaRef.current.x;
      pitchRef.current -= mouseDeltaRef.current.y;
      
      // Constrain pitch to limited range
      pitchRef.current = THREE.MathUtils.clamp(pitchRef.current, -MAX_PITCH, MAX_PITCH);
      
      // Apply pitch damping for smoother movement
      pitchRef.current *= PITCH_DAMPING;
      
      // Reset mouse delta
      mouseDeltaRef.current.x = 0;
      mouseDeltaRef.current.y = 0;
    }

    // Get input keys
    const {
      forwardKeyPressed,   // W key
      rightKeyPressed,     // D key  
      backwardKeyPressed,  // S key
      leftKeyPressed,      // A key
      shiftKeyPressed
    } = getKeys();

    const currentVelocity = velocityRef.current;
    
    // Calculate forward and right directions in XY plane
    forwardDirection.set(
      Math.sin(yawRef.current), // X direction
      Math.cos(yawRef.current), // Y direction  
      0 // No Z component for XY movement
    ).normalize();
    
    rightDirection.set(
      Math.cos(yawRef.current), // X direction
      -Math.sin(yawRef.current), // Y direction
      0 // No Z component for XY movement
    ).normalize();

    // Calculate desired movement direction - standard WASD controls
    tempVector.set(0, 0, 0);
    
    if (forwardKeyPressed) {    // W - forward
      tempVector.add(forwardDirection);
    }
    if (backwardKeyPressed) {   // S - backward
      tempVector.sub(forwardDirection);
    }
    if (rightKeyPressed) {      // D - right
      tempVector.add(rightDirection);
    }
    if (leftKeyPressed) {       // A - left
      tempVector.sub(rightDirection);
    }

    // Apply movement speed (with shift for faster movement)
    const currentSpeed = shiftKeyPressed ? SPEED * 1.5 : SPEED;
    
    if (tempVector.length() > 0) {
      tempVector.normalize().multiplyScalar(currentSpeed * delta);
      currentVelocity.lerp(tempVector, ACCELERATION);
    } else {
      currentVelocity.multiplyScalar(DAMPING);
      
      if (currentVelocity.length() < MIN_SPEED) {
        currentVelocity.set(0, 0, 0);
      }
    }

    // Calculate new position with constraints
    const newPosition = camera.position.clone();
    
    // Apply XY movement with 1.0 unit constraint from origin
    newPosition.x += currentVelocity.x;
    newPosition.y += currentVelocity.y;
    
    // Constrain to 1.0 units from XY plane origin
    const xyDistance = Math.sqrt(newPosition.x * newPosition.x + newPosition.y * newPosition.y);
    if (xyDistance > MAX_XY_DISTANCE) {
      const scale = MAX_XY_DISTANCE / xyDistance;
      newPosition.x *= scale;
      newPosition.y *= scale;
    }
    
    // Set Z position to always stay 2.0 units above base mesh
    let targetZ = BASE_MESH_HEIGHT + CAMERA_HEIGHT;
    
    if (groundMeshRef.current) {
      raycaster.set(
        new THREE.Vector3(newPosition.x, newPosition.y, newPosition.z + 5),
        rayDirection
      );
      
      const intersects = raycaster.intersectObject(groundMeshRef.current, false);
      
      if (intersects.length > 0) {
        const groundZ = intersects[0].point.z;
        targetZ = Math.max(groundZ, BASE_MESH_HEIGHT) + CAMERA_HEIGHT;
      }
    }
    
    // Always maintain 2.0 units above base mesh
    newPosition.z = targetZ;
    
    // Apply position and rotation
    camera.position.copy(newPosition);
    camera.rotation.set(pitchRef.current, yawRef.current, 0);
  });

  // No visual component needed - this is just a controller
  return null;
};

export default FPSControls;