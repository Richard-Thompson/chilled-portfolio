import { useLoader, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'

export default function InstancesFromImage({ pngUrl }) {
  const meshRef = useRef()
  const texture = useLoader(THREE.TextureLoader, pngUrl)
 

  const instancePositions = useMemo(() => {
    if (!texture.image) return []

    const width = 639;
    const height = 639;
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(texture.image, 0, 0)
    const pixels = ctx.getImageData(0, 0, width, height).data

    const positions = []
    const min_bbox = [-99.99952, -99.99994, 0.0]
    const max_bbox = [99.99974, 99.99867, 9.200001]
    const min = new THREE.Vector3(...min_bbox)
    const max = new THREE.Vector3(...max_bbox)
    const size = new THREE.Vector3().subVectors(max, min)

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i] / 255
      const g = pixels[i+1] / 255
      const b = pixels[i+2] / 255
      // Decode normalized 0-1 to world-space
      const pos = new THREE.Vector3(
        r * size.x + min.x,
        g * size.y + min.y,
        b * size.z + min.z
      )
      positions.push(pos)
    }
    return positions
  }, [texture.image])

  useEffect(() => {
    if (!meshRef.current || instancePositions.length === 0) return
    const dummy = new THREE.Object3D()
    instancePositions.forEach((pos, i) => {
      dummy.position.copy(pos)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [instancePositions])

  return (
    <instancedMesh ref={meshRef} args={[null, null, instancePositions.length]}>
      <boxGeometry args={[0.1, 0.1, 0.1]} />
      <meshStandardMaterial color="orange" />
    </instancedMesh>
  )
}
