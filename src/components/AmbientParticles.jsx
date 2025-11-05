import React, { useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { ShaderMaterial, WebGLRenderTarget, PlaneGeometry, Mesh, DataTexture, FloatType, RGBAFormat, UnsignedByteType, NearestFilter, LinearFilter, Color } from 'three';
import * as THREE from 'three';
// Vertex shader that passes through texture coordinates
const vertexShader = `
  varying vec2 texCoord;
  void main() {
    texCoord = (position.xy + 1.0) / 2.0;
    gl_Position = vec4(position, 1.0);
  }
`;

// Simulation Shader
const simulationShader = {
  uniforms: {
    particleData: { value: null }
  },
  vertexShader,
  fragmentShader: `
    precision highp float;
    uniform sampler2D particleData;
    varying vec2 texCoord;
    void main() {
      vec4 pos = texture2D(particleData, texCoord);
      float velocity = 1.0;
      vec3 newPos = pos.xyz + pos.xyz * 0.8;
      gl_FragColor = vec4(newPos, velocity);
    }
  `,
};

const rVertexShader = `
  varying vec2 texCoord;
  uniform sampler2D particleData;

  void main() {
    texCoord = (position.xy + 1.0) / 2.0;
    vec4 pos = texture(particleData, texCoord);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 10.0;
  }
`;

// Render Shader
const renderShader = {
  uniforms: {
    particleData: { value: null },
    cameraWorldMatrix: { value: null },
    cameraProjectionMatrixInverse: { value: null },
    uResolution: { value: null },
  },
  vertexShader: rVertexShader,
  fragmentShader: `
precision highp float;

uniform sampler2D particleData;
uniform mat4 cameraWorldMatrix;
uniform mat4 cameraProjectionMatrixInverse;
uniform vec2 uResolution;
varying vec2 texCoord;

void main() {
  vec2 uv =( gl_FragCoord.xy * 2.0 - (uResolution - vec2(0.5,0.5)) ) / uResolution;

  vec4 pos = texture2D(particleData, texCoord);

  gl_FragColor = vec4(1.0, 0.0, 0.0,1.0);
}
  `,
};

const ParticleSimulation = () => {
  const simulationMaterialRef = useRef();
  const particleTextureRef = useRef();
  const renderTargetRef = useRef();
  const planeMeshRef = useRef();
  const shaderRef = useRef();
  const { size } = useThree();

  useEffect(() => {
    const width = 512;
    const height = 512;

    // Generate random particle data
    const size = width * height;
    const data = new Float32Array(size * 4); // RGBA
    for (let i = 0; i < size; i++) {
      data[i * 4] = Math.random() * 20.0; // x position in range [-1, 1]
      data[i * 4 + 1] = Math.random() * 20.0; // y position in range [-1, 1]
      data[i * 4 + 2] = Math.random() * 20.0; // x velocity in range [-1, 1]
      data[i * 4 + 3] = Math.random() * 20.0; // y velocity in range [-1, 1]
    }

    const particleTexture = new DataTexture(data, width, height, RGBAFormat, FloatType);
    particleTexture.needsUpdate = true;
    particleTexture.minFilter = NearestFilter;  // Ensure accurate sampling
    particleTexture.magFilter = NearestFilter;
    particleTextureRef.current = particleTexture;

    // Create render target for the simulation
    const renderTarget = new WebGLRenderTarget(width, height);
    renderTargetRef.current = renderTarget;
  }, []);

  const orthoCamera = new THREE.OrthographicCamera(
    -1,
    1,
    1,
    -1,
    1 / Math.pow(2, 53),
    1
  );

  const sceneRtt = new THREE.Scene();

  const [geometry] = React.useMemo(() => {
    const geometry = new THREE.BufferGeometry();

    // Create two triangles for a full-screen quad
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([
          -1, -1, 0,  // bottom-left
           1, -1, 0,  // bottom-right
           1,  1, 0,  // top-right
          -1, -1, 0,  // bottom-left
           1,  1, 0,  // top-right
          -1,  1, 0,  // top-left
        ]),
        3
      )
    );
    geometry.setAttribute(
      "uv",
      new THREE.BufferAttribute(
        new Float32Array([
          0, 0,  // bottom-left
          1, 0,  // bottom-right
          1, 1,  // top-right
          0, 0,  // bottom-left
          1, 1,  // top-right
          0, 1,  // top-left
        ]),
        2
      )
    );

    return [geometry];
  }, []);

  const simShader = new THREE.ShaderMaterial(simulationShader)

  sceneRtt.add(new THREE.Mesh(geometry, simShader));
  sceneRtt.add(orthoCamera);

  useFrame(({ gl, scene, camera }) => {
    if (!particleTextureRef.current || !renderTargetRef.current || !planeMeshRef.current) {
      return;
    }

    // Render simulation pass
    simShader.uniforms.particleData.value = particleTextureRef.current;
    gl.setRenderTarget(renderTargetRef.current);
    gl.clear();
    gl.render(sceneRtt, orthoCamera);

    // Render to the screen
    shaderRef.current.uniforms.particleData.value = renderTargetRef.current.texture;
    shaderRef.current.uniforms.cameraWorldMatrix.value =
        camera.matrixWorld.clone();
    shaderRef.current.uniforms.cameraProjectionMatrixInverse.value = new THREE.Matrix4().copy(camera.projectionMatrix.clone()).invert();
    shaderRef.current.uniforms.uResolution.value = new THREE.Vector2(size.width, size.height);


    if (planeMeshRef.current) {
    //   planeMeshRef.current.material = renderPass;
      gl.setRenderTarget(null);
      gl.clear();
      gl.render(scene, camera);
    }
  });

    const positions = useMemo(() => {
        const count = 12000;
        const distance = 2.0;
        const positions = new Float32Array(count * 3); // 3 values per point (x, y, z)

        for (let i = 0; i < count; i++) {
        const x = (Math.random() - 0.5) * 3.0;
        const y = (Math.random() - 0.5) * 3.0;
        const z = (Math.random() - 0.5) * 3.0;

        positions.set([x, y, z], i * 3);
    }

    return positions;
  }, []);

  return (
    <points>
        <bufferGeometry>
            <bufferAttribute
                attach="attributes-position"
                array={positions}
                itemSize={3}
                count={positions.length / 3}
                needsUpdate={true}
            />
        </bufferGeometry>
        <shaderMaterial ref={shaderRef} attach="material" args={[renderShader]} />
    </points>
  );
  

//   return (
//     <>
//         <color attach="background" args={['black']} />
//      <points>
//         <bufferGeometry attach="geometry">
//           <bufferAttribute
//             attachObject={["attributes", "position"]}
//             count={positions.length / 4}
//             itemSize={4}
//             array={positions}
//           />
//         </bufferGeometry>       
//         <pointsMaterial color="red" size={10}/>
//       {/* <shaderMaterial attach="material" args={[renderShader]} /> */}
//       </points>
//       <OrbitControls />
//     </>
//   );
};

export default ParticleSimulation;











