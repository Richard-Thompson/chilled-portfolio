import React, { useRef, useEffect, useState, useMemo } from "react";
import * as THREE from "three";
import { useLoader, useFrame } from "@react-three/fiber";
import { Model } from "./Base-mesh-final";
import { Perf } from "r3f-perf";

export default function PlaneInstancerWithColor({
  posBin = "/positions.bin",
  rotBin = "/rotations.bin",
  sclBin = "/scales.bin",
  colorBin = "/colors.bin",
  instanceCount = undefined,
  planeSize = 2.0,
  castShadow = false,
  receiveShadow = false,
}) {
  const meshRef = useRef();
  const [transforms, setTransforms] = useState(null);
  const [instanceColorArray, setInstanceColorArray] = useState(null);
  const [textureIndexArray, setTextureIndexArray] = useState(null);

  const needsNormalize = false;

  // Load individual alpha maps
  const alphaMap = useLoader(THREE.TextureLoader, "/alpha-map.png");
  const alphaMap1 = useLoader(THREE.TextureLoader, "/alpha-map1.png");
  const alphaMap2 = useLoader(THREE.TextureLoader, "/alpha-map2.png");
  const alphaMap3 = useLoader(THREE.TextureLoader, "/alpha-map3.png");
  const normalMap = useLoader(THREE.TextureLoader, "/normal-map.png");

  const shaderRef = useRef();

  // Load transform/color data
  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetch(posBin).then((r) => r.arrayBuffer()),
      fetch(rotBin).then((r) => r.arrayBuffer()),
      fetch(sclBin).then((r) => r.arrayBuffer()),
      fetch(colorBin).then((r) => r.arrayBuffer()),
    ]).then(([posBuf, rotBuf, sclBuf, colBuf]) => {
      if (!mounted) return;

      const positions = new Float32Array(posBuf);
      const rotations = new Float32Array(rotBuf);
      const scales = new Float32Array(sclBuf);
      const colors = new Float32Array(colBuf);

      const inferredCount = Math.floor(positions.length / 3);
      const count = instanceCount ? Math.min(instanceCount, inferredCount) : inferredCount;

      const transformArray = new Array(count);
      for (let i = 0; i < count; i++) {
        transformArray[i] = {
          position: [positions[i * 3 + 0] ?? 0, positions[i * 3 + 1] ?? 0, positions[i * 3 + 2] ?? 0],
          rotation: [rotations[i * 3 + 0] + 0.5 * Math.random(), rotations[i * 3 + 1] * Math.random(), rotations[i * 3 + 2] - 1 + 0.5 * Math.random()],
          scale: [scales[i * 3 + 0] ?? 1, scales[i * 3 + 1] ?? 1, scales[i * 3 + 2] ?? 1],
        };
      }

      const instColors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const base = i * 3;
        let r = colors[base + 0] ?? 0;
        let g = colors[base + 1] ?? 0;
        let b = colors[base + 2] ?? 0;
        if (needsNormalize) {
          r /= 255;
          g /= 255;
          b /= 255;
        }
        instColors[base + 0] = r;
        instColors[base + 1] = g;
        instColors[base + 2] = b;
      }

      const texIdxArr = new Float32Array(count);
      for (let i = 0; i < count; i++) texIdxArr[i] = Math.floor(Math.random() * 4);

      setTransforms(transformArray);
      setInstanceColorArray(instColors);
      setTextureIndexArray(texIdxArr);
    });

    return () => (mounted = false);
  }, [posBin, rotBin, sclBin, colorBin, instanceCount, needsNormalize]);

  const geometry = useMemo(() => new THREE.PlaneGeometry(planeSize, planeSize), [planeSize]);

  const material = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      vertexColors: true,
      transparent: false,
      depthWrite: true,
      alphaTest: true,
      alphaTest: 0.5,
      normalMap,
    });

    mat.onBeforeCompile = (shader) => {
      // Store shader reference in mesh userData

      shader.uniforms.alphaMap = { value: alphaMap };
      shader.uniforms.alphaMap1 = { value: alphaMap1 };
      shader.uniforms.alphaMap2 = { value: alphaMap2 };
      shader.uniforms.alphaMap3 = { value: alphaMap3 };
      shader.uniforms.time = { value: 0 };
      shader.uniforms.cameraPos = { value: new THREE.Vector3() };
      shader.uniforms.maxEffectDistance = { value: 10.0 };

      // Vertex shader: pass UV, position, and texture index
      shader.vertexShader = `
        attribute float aTextureIndex;
        varying float vTextureIndex;
        varying vec2 vUv;
        varying vec3 vPos;
        ${shader.vertexShader.replace(
          "#include <begin_vertex>",
          `
              #include <begin_vertex>
            vTextureIndex = aTextureIndex;
            vUv = uv;
            vec3 vPostemp = (instanceMatrix  * vec4(position, 1.0)).xyz;
            vPos = (modelMatrix * vec4(vPostemp, 1.0)).xyz;
         
        
          `
        )}
      `;

      // Fragment shader: cheap smooth noise + wavy effect
      shader.fragmentShader = `
        uniform float time;
        uniform vec3 cameraPos;
        varying float vTextureIndex;
        varying vec2 vUv;
        varying vec3 vPos;

        uniform sampler2D alphaMap;
        uniform sampler2D alphaMap1;
        uniform sampler2D alphaMap2;
        uniform sampler2D alphaMap3;

        float hash(float n) { return fract(sin(n)*43758.5453123); }
        float noise2d(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash(i.x + i.y*57.0);
          float b = hash(i.x+1.0 + i.y*57.0);
          float c = hash(i.x + (i.y+1.0)*57.0);
          float d = hash(i.x+1.0 + (i.y+1.0)*57.0);
          vec2 u = f*f*(3.0-2.0*f);
          return mix(a, b, u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
        }

        ${shader.fragmentShader.replace(
          "#include <map_fragment>",
          `
vec2 diff = vPos.xz - cameraPos.xz;
float radius = 18.0;
if(length(diff) > radius) discard;
if(length(diff) < -radius) discard;

               float idx = floor(vTextureIndex + 0.5);
        vec4 alphaSample;
        if (idx < 0.5) alphaSample = texture2D(alphaMap, vUv);
        else if (idx < 1.5) alphaSample = texture2D(alphaMap1, vUv);
        else if (idx < 2.5) alphaSample = texture2D(alphaMap2, vUv);
        else alphaSample = texture2D(alphaMap3, vUv);

        float n = noise2d(vPos.xz * 5.0 + time * 0.5);
        float wave = sin(vPos.y*3.0) * 0.03;
        vec2 wavyUv = vec2(vUv.x + n*0.02 + wave, vUv.y);


        vec4 color;
        if (idx < 0.5) {
          color = texture2D(alphaMap, wavyUv);
        } else if (idx < 1.5) {
          color = texture2D(alphaMap1, wavyUv);
        } else if (idx < 2.5) {
          color = texture2D(alphaMap2, wavyUv);
        } else {
          color = texture2D(alphaMap3, wavyUv);
        }
        
        diffuseColor.a = color.r;
          `
        )}
      `;
      shaderRef.current = shader;

    };

    return mat;
  }, [alphaMap, alphaMap1, alphaMap2, alphaMap3, normalMap]);

  // Update time uniform every frame safely
  useFrame(({ clock, camera }) => {
    if (shaderRef.current) {
      shaderRef.current.uniforms.time.value = clock.getElapsedTime() * 3.0;
        shaderRef.current.uniforms.cameraPos.value.copy(camera.position);
    }
  });

  // Populate instance matrices, colors, texture indices
  useEffect(() => {
    const inst = meshRef.current;
    if (!inst || !transforms || !instanceColorArray || !textureIndexArray) return;

    const tmp = new THREE.Object3D();
    transforms.forEach((t, i) => {
      tmp.position.set(...t.position);
      tmp.rotation.set(...t.rotation);
      tmp.scale.set(...t.scale);
      tmp.updateMatrix();
      inst.setMatrixAt(i, tmp.matrix);
    });

    inst.instanceMatrix.needsUpdate = true;
    inst.geometry.setAttribute("color", new THREE.InstancedBufferAttribute(instanceColorArray, 3));
    inst.geometry.setAttribute("aTextureIndex", new THREE.InstancedBufferAttribute(textureIndexArray, 1));
  }, [transforms, instanceColorArray, textureIndexArray]);

  const safeCount = transforms ? transforms.length : (instanceCount || 0);

  return (
    <>
      <Model />
      <axesHelper />
      <group rotation={[-Math.PI / 2, 0, 0]} position={[0.0, 0.35, 0.0]}>
        <instancedMesh
          ref={meshRef}
          args={[geometry, material, safeCount]}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
        />
      </group>
      <Perf position="top-left"/>
    </>
  );
}
