import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

const PortalPlane = ({ position, rotation, size = [2, 2] }) => {
  const planeRef = useRef();
  const portalCamera = useRef();
  const renderTarget = useRef();
  const materialRef = useRef();
  const { gl, scene, camera } = useThree();

  // Create render target for portal effect
  const portalRenderTarget = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(512, 512, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      generateMipmaps: false,
      // Don't set colorSpace - let it inherit from renderer
      samples: 0, // No MSAA to avoid color differences
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    });
    
    // Configure texture for immediate updates
    rt.texture.needsUpdate = true;
    
    return rt;
  }, []);

  // Create portal camera - use perspective like main camera for exact matching
  const portalCameraObject = useMemo(() => {
    const cam = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    return cam;
  }, []);

  // Plane geometry and material with red border for debugging
  const planeGeometry = useMemo(() => new THREE.PlaneGeometry(...size), [size]);
  const planeMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      map: portalRenderTarget.texture,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
      alphaTest: 0.1, // Only render pixels with some opacity
    });
  }, [portalRenderTarget]);

  // Red border geometry and material for debugging
  const borderGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    const w = size[0] / 2;
    const h = size[1] / 2;
    const borderWidth = 0.05;
    
    // Outer rectangle
    shape.moveTo(-w, -h);
    shape.lineTo(w, -h);
    shape.lineTo(w, h);
    shape.lineTo(-w, h);
    shape.lineTo(-w, -h);
    
    // Inner rectangle (hole)
    const hole = new THREE.Path();
    hole.moveTo(-w + borderWidth, -h + borderWidth);
    hole.lineTo(-w + borderWidth, h - borderWidth);
    hole.lineTo(w - borderWidth, h - borderWidth);
    hole.lineTo(w - borderWidth, -h + borderWidth);
    hole.lineTo(-w + borderWidth, -h + borderWidth);
    shape.holes.push(hole);
    
    return new THREE.ShapeGeometry(shape);
  }, [size]);

  const borderMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: 0xff0000, // Red color
      side: THREE.DoubleSide,
      transparent: false,
    });
  }, []);

  useEffect(() => {
    portalCamera.current = portalCameraObject;
    renderTarget.current = portalRenderTarget;
    materialRef.current = planeMaterial;
  }, [portalCameraObject, portalRenderTarget, planeMaterial]);

  useFrame((state, delta) => {
    if (!planeRef.current || !portalCamera.current || !renderTarget.current) return;
    
    // Force update every frame for immediate response

    // Get plane world position and normal
    const planeWorldPosition = new THREE.Vector3();
    const planeNormal = new THREE.Vector3();
    planeRef.current.getWorldPosition(planeWorldPosition);
    planeRef.current.getWorldDirection(planeNormal);
    
    // Calculate portal view based on the plane's position relative to camera
    const cameraToPlane = new THREE.Vector3().subVectors(planeWorldPosition, camera.position);
    const distance = cameraToPlane.length();
    
    // Position portal camera at exact same location as main camera
    portalCamera.current.position.copy(camera.position);
    portalCamera.current.quaternion.copy(camera.quaternion);
    
    // Calculate the viewing frustum that corresponds to the portal plane
    const planeWidth = size[0];
    const planeHeight = size[1];
    
    // Project plane corners to camera space to get exact viewing bounds
    const halfWidth = planeWidth / 2;
    const halfHeight = planeHeight / 2;
    
    // Get plane's local coordinate system
    const planeRight = new THREE.Vector3(1, 0, 0).applyQuaternion(planeRef.current.quaternion);
    const planeUp = new THREE.Vector3(0, 1, 0).applyQuaternion(planeRef.current.quaternion);
    
    // Calculate plane corners in world space
    const corner1 = planeWorldPosition.clone().add(planeRight.clone().multiplyScalar(-halfWidth)).add(planeUp.clone().multiplyScalar(halfHeight));
    const corner2 = planeWorldPosition.clone().add(planeRight.clone().multiplyScalar(halfWidth)).add(planeUp.clone().multiplyScalar(halfHeight));
    const corner3 = planeWorldPosition.clone().add(planeRight.clone().multiplyScalar(-halfWidth)).add(planeUp.clone().multiplyScalar(-halfHeight));
    
    // Transform corners to camera space
    const camMatrix = camera.matrixWorldInverse;
    corner1.applyMatrix4(camMatrix);
    corner2.applyMatrix4(camMatrix);
    corner3.applyMatrix4(camMatrix);
    
    // Calculate frustum bounds
    const near = Math.max(0.1, Math.abs(corner1.z) - 0.1);
    const left = Math.min(corner1.x, corner3.x);
    const right = Math.max(corner2.x, corner1.x);
    const top = Math.max(corner1.y, corner2.y);
    const bottom = Math.min(corner3.y, corner1.y);
    
    // Set up camera with exact frustum
    portalCamera.current.near = near;
    portalCamera.current.far = camera.far;
    
    // Create custom projection matrix for the portal window
    const projMatrix = new THREE.Matrix4();
    projMatrix.makePerspective(left, right, top, bottom, near, camera.far);
    portalCamera.current.projectionMatrix.copy(projMatrix);
    portalCamera.current.projectionMatrixInverse.copy(projMatrix).invert();
    
    portalCamera.current.updateMatrixWorld();

    // For debugging, let's remove clipping for now and just render normally
    // This will help us see if the basic rendering works
    const originalClippingPlanes = gl.clippingPlanes;
    const originalLocalClippingEnabled = gl.localClippingEnabled;

    // Temporarily hide the plane to avoid rendering it in the portal view
    const originalVisible = planeRef.current.visible;
    planeRef.current.visible = false;

    // Save renderer state
    const originalRenderTarget = gl.getRenderTarget();
    const originalXrEnabled = gl.xr.enabled;
    const originalShadowAutoUpdate = gl.shadowMap.autoUpdate;
    
    // Configure renderer to match main renderer exactly
    gl.xr.enabled = false;
    gl.shadowMap.autoUpdate = false;
    // Keep original color space and tone mapping for exact match
    // Don't change: gl.outputColorSpace, gl.toneMapping
    
    // Set render target and clear with transparent background
    gl.setRenderTarget(renderTarget.current);
    gl.setClearColor(0x000000, 0); // Clear to transparent black
    gl.clear();
    
    // Create clipping plane based on the plane's actual orientation, not camera perspective
    const clipPlane = new THREE.Plane();
    
    // Use the plane's actual normal direction (the way it's facing)
    // This ensures the clipping plane aligns with the portal plane's surface
    const planeActualNormal = new THREE.Vector3();
    planeRef.current.getWorldDirection(planeActualNormal);
    
    // Ensure the normal points away from the camera side
    // If the dot product is positive, the normal is pointing toward camera, so flip it
    const cameraToPlaneForNormal = new THREE.Vector3().subVectors(planeWorldPosition, camera.position);
    if (planeActualNormal.dot(cameraToPlaneForNormal) < 0) {
        planeActualNormal.negate();
    }
    
    // Offset the clipping plane slightly behind the portal surface to avoid self-intersection
    const offsetPosition = planeWorldPosition.clone().add(planeActualNormal.clone().multiplyScalar(0.01));
    
    // Set clipping plane using the plane's actual surface orientation
    clipPlane.setFromNormalAndCoplanarPoint(planeActualNormal, offsetPosition);
    
    // Set up clipping for objects in front of the plane (use existing variables)
    gl.clippingPlanes = [clipPlane];
    gl.localClippingEnabled = true;
    
    // Save and modify scene background temporarily
    const originalBackground = scene.background;
    const originalEnvironment = scene.environment;
    
    // Remove background to avoid seeing sky/background through the portal
    scene.background = null;
    planeRef.current.visible = false;
    
    // Ensure all other objects are visible and have proper materials
    const hiddenObjects = [];
    scene.traverse((child) => {
      if (child !== planeRef.current && child.visible === false) {
        hiddenObjects.push({ object: child, wasVisible: false });
        child.visible = true;
      }
      
      // Handle instanced meshes specifically
      if (child.isInstancedMesh) {
        child.frustumCulled = false;
      }
      
      // Enable clipping on materials that support it
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(mat => {
            if (mat.clippingPlanes !== undefined) {
              mat.clippingPlanes = [clipPlane];
            }
          });
        } else if (child.material.clippingPlanes !== undefined) {
          child.material.clippingPlanes = [clipPlane];
        }
      }
    });
    
    // Render scene with clipping enabled
    gl.render(scene, portalCamera.current);
    
    // Restore clipping planes on materials
    scene.traverse((child) => {
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(mat => {
            if (mat.clippingPlanes !== undefined) {
              mat.clippingPlanes = [];
            }
          });
        } else if (child.material.clippingPlanes !== undefined) {
          child.material.clippingPlanes = [];
        }
      }
    });
    
    // Restore original visibility states
    hiddenObjects.forEach(({ object, wasVisible }) => {
      object.visible = wasVisible;
    });
    
    planeRef.current.visible = originalVisible;
    
    // Restore renderer clipping settings
    gl.clippingPlanes = originalClippingPlanes;
    gl.localClippingEnabled = originalLocalClippingEnabled;
    
    // Restore everything else
    scene.background = originalBackground;
    scene.environment = originalEnvironment;
    gl.xr.enabled = originalXrEnabled;
    gl.shadowMap.autoUpdate = originalShadowAutoUpdate;
    gl.setRenderTarget(originalRenderTarget);
    
    // Force immediate texture and material update
    if (materialRef.current?.map) {
      materialRef.current.map.needsUpdate = true;
      // Force material to update immediately
      materialRef.current.needsUpdate = true;
      // Mark the texture as modified this frame
      materialRef.current.map.version++;
    }
    
    // Force renderer to process updates immediately
    gl.compile(scene, portalCamera.current);
    
    // Additional force update for immediate visibility
    if (planeRef.current) {
      planeRef.current.material.needsUpdate = true;
    }
  });

  // Cleanup
  useEffect(() => {
    return () => {
      portalRenderTarget.dispose();
    };
  }, [portalRenderTarget]);

  return (
    <group position={position} rotation={rotation}>
      {/* Main portal plane */}
      <mesh
        ref={planeRef}
        geometry={planeGeometry}
        material={planeMaterial}
        castShadow
        receiveShadow
      />
      {/* Red border for debugging */}
      <mesh
        geometry={borderGeometry}
        material={borderMaterial}
        position={[0, 0, 0.001]} // Slightly in front to be visible
      />
    </group>
  );
};

export default PortalPlane;