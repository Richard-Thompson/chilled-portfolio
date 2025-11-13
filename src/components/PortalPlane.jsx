import React, { useMemo } from 'react';
import * as THREE from 'three';

const PortalPlane = ({ position, rotation, size = [2, 2] }) => {
  // Simple plane geometry and material without portal rendering
  const planeGeometry = useMemo(() => new THREE.PlaneGeometry(...size), [size]);
  const planeMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: 0x888888, // Simple gray color
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
  }, []);

  // Red border geometry and material for debugging (keeping this for visibility)
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

  return (
    <group position={position} rotation={rotation}>
      {/* Simple plane without portal rendering */}
      <mesh
        geometry={planeGeometry}
        material={planeMaterial}
        castShadow
        receiveShadow
      />
      {/* Red border for debugging - keeping for visibility */}
      <mesh
        geometry={borderGeometry}
        material={borderMaterial}
        position={[0, 0, 0.001]} // Slightly in front to be visible
      />
    </group>
  );
};

export default PortalPlane;