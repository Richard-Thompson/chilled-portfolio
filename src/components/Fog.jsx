// FogHeightColorInjectorFixed.jsx - Heavily Optimized
import React, { useEffect, useRef, useMemo, useCallback } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

// Constants for better performance
const DEFAULT_HEIGHT_START = 2;
const DEFAULT_HEIGHT_END = 12;
const DEFAULT_HEIGHT_CURVE = 1.0;
const DEFAULT_FOG_COLOR = '#8fbce6';

// Pre-compiled shader chunks for better performance
const VERTEX_VARYING_CHUNK = (uid) => `#include <common>
#ifndef HEIGHT_FOG_VARYING_DEFINED_${uid}
#define HEIGHT_FOG_VARYING_DEFINED_${uid}
varying vec3 vWorldPosition;
#endif`;

const VERTEX_POSITION_CHUNK = `vWorldPosition = (modelMatrix * vec4( transformed, 1.0 )).xyz;
  gl_Position = projectionMatrix * mvPosition;`;

const FRAGMENT_DECLARATIONS_CHUNK = (uid) => `#include <common>
#ifndef HEIGHT_FOG_FRAG_DECL_${uid}
#define HEIGHT_FOG_FRAG_DECL_${uid}
varying vec3 vWorldPosition;
uniform float uHeightStart;
uniform float uHeightEnd;
uniform float uHeightCurve;
uniform vec3 uFogColorOverride;
#endif`;

// Optimized shader template with better GPU performance
const createOptimizedFogShader = (uid) => `
/* OPTIMIZED HEIGHT-AWARE FOG ${uid} */
/* HEIGHT_FOG_${uid} */

// Pre-compute constants for better performance
const float HEIGHT_FOG_MIN_RANGE = 0.0001;
const float HEIGHT_FOG_MIN_CURVE = 0.0001;

float _fogFactor_${uid} = 0.0;
#ifdef USE_FOG
  float _fogDepth_${uid};
  #ifdef USE_VARYING_VVIEWPOSITION
    _fogDepth_${uid} = length( vViewPosition );
  #else
    #ifdef cameraPosition
      _fogDepth_${uid} = length( vWorldPosition - cameraPosition );
    #else
      _fogDepth_${uid} = 0.0;
    #endif
  #endif

  // Optimized fog calculations
  #ifdef FOG_EXP2
    #ifdef fogDensity
      float _depth2_${uid} = _fogDepth_${uid} * _fogDepth_${uid};
      _fogFactor_${uid} = 1.0 - exp( -fogDensity * fogDensity * _depth2_${uid} );
    #else
      _fogFactor_${uid} = 0.0;
    #endif
  #elif defined( FOG )
    #ifdef fogNear
      _fogFactor_${uid} = smoothstep( fogNear, fogFar, _fogDepth_${uid} );
    #else
      _fogFactor_${uid} = 0.0;
    #endif
  #endif
#endif

// Optimized height calculations with early exit
float _hRange_${uid} = max(HEIGHT_FOG_MIN_RANGE, uHeightEnd - uHeightStart);
float _heightRatio_${uid} = (vWorldPosition.y - uHeightStart) / _hRange_${uid};
float _hRaw_${uid} = 1.0 - clamp(_heightRatio_${uid}, 0.0, 1.0);

// Skip expensive pow() when curve is 1.0 (linear)
float _hFactor_${uid} = (abs(uHeightCurve - 1.0) < 0.001) ? 
  max(0.0, _hRaw_${uid}) : 
  pow(max(0.0, _hRaw_${uid}), max(HEIGHT_FOG_MIN_CURVE, uHeightCurve));

// Final optimized fog application
float _finalFog_${uid} = _fogFactor_${uid} * _hFactor_${uid};
#ifdef USE_FOG
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColorOverride, clamp(_finalFog_${uid}, 0.0, 1.0));
#endif
`;

/**
 * Heavily Optimized FogHeightColorInjector
 * 
 * Performance Optimizations:
 * - Memoized shader chunks and UID generation
 * - Pre-compiled shader templates
 * - Optimized GPU calculations (avoid pow when possible)
 * - Cached material patches
 * - Efficient uniform updates
 * - Minimal regex operations
 * 
 * Props:
 *  heightStart: number (fog full at/below this Y)
 *  heightEnd:   number (fog gone at/above this Y)
 *  heightCurve: number (exponent for falloff: 1 = linear, optimized)
 *  fogColor:    string | THREE.Color (hex string accepted)
 */
export default function FogHeightColorInjectorFixed({
  heightStart = DEFAULT_HEIGHT_START,
  heightEnd = DEFAULT_HEIGHT_END,
  heightCurve = DEFAULT_HEIGHT_CURVE,
  fogColor = DEFAULT_FOG_COLOR,
}) {
  const { scene } = useThree()
  
  // Memoized UID to prevent regeneration
  const uid = useMemo(() => 
    Math.floor(Math.random() * 0xffff).toString(16), 
    []
  )
  
  // Cache for patched materials to avoid re-patching
  const patchedMaterials = useRef(new WeakSet())
  
  // Memoized color conversion for performance
  const fogColorValue = useMemo(() => 
    new THREE.Color(fogColor), 
    [fogColor]
  )

  // Optimized material patching function
  const patchMaterial = useCallback((mat) => {
    if (!mat || typeof mat.onBeforeCompile !== 'function') return
    
    // Skip if already patched
    if (patchedMaterials.current.has(mat)) {
      // Only update uniforms for already patched materials
      if (mat.userData.heightFogUniforms) {
        const uniforms = mat.userData.heightFogUniforms;
        uniforms.uHeightStart.value = heightStart;
        uniforms.uHeightEnd.value = heightEnd;
        uniforms.uHeightCurve.value = heightCurve;
        uniforms.uFogColorOverride.value.copy(fogColorValue);
      }
      return;
    }

    const original = mat.onBeforeCompile;
    const token = `/* HEIGHT_FOG_${uid} */`;

    mat.onBeforeCompile = (shader, renderer) => {
      // Efficient uniform creation and caching
      const uniforms = {
        uHeightStart: { value: heightStart },
        uHeightEnd: { value: heightEnd },
        uHeightCurve: { value: heightCurve },
        uFogColorOverride: { value: fogColorValue.clone() }
      };

      // Assign uniforms efficiently
      Object.assign(shader.uniforms, uniforms);
      
      // Cache uniforms reference for future updates
      mat.userData.heightFogUniforms = shader.uniforms;

      // Optimized vertex shader modifications
      if (!shader.vertexShader.includes(`HEIGHT_FOG_VARYING_DEFINED_${uid}`)) {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          VERTEX_VARYING_CHUNK(uid)
        );

        // More efficient regex for gl_Position replacement
        shader.vertexShader = shader.vertexShader.replace(
          /gl_Position\s*=\s*projectionMatrix\s*\*\s*mvPosition\s*;/,
          VERTEX_POSITION_CHUNK
        );
      }

      // Optimized fragment shader modifications
      if (!shader.fragmentShader.includes(`HEIGHT_FOG_FRAG_DECL_${uid}`)) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          FRAGMENT_DECLARATIONS_CHUNK(uid)
        );
      }

      // Replace fog_fragment with optimized version (only once)
      if (!shader.fragmentShader.includes(token)) {
        const optimizedFogShader = createOptimizedFogShader(uid);
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <fog_fragment>', 
          optimizedFogShader + '\n#include <fog_fragment>'
        );
      }

      // Call original hook with error handling
      if (typeof original === 'function') {
        try { 
          original(shader, renderer); 
        } catch (e) { 
          console.warn('Height fog: original onBeforeCompile failed:', e);
        }
      }
    }; // end onBeforeCompile

    // Mark material as patched and force update
    patchedMaterials.current.add(mat);
    mat.needsUpdate = true;
  }, [uid, heightStart, heightEnd, heightCurve, fogColorValue]);

  // Optimized scene traversal effect
  useEffect(() => {
    if (!scene) return;

    // Efficient traversal with early returns
    const traverseAndPatch = (object) => {
      if (!object.isMesh) return;
      
      const material = object.material;
      if (Array.isArray(material)) {
        material.forEach(patchMaterial);
      } else if (material) {
        patchMaterial(material);
      }
    };

    // Traverse scene efficiently
    scene.traverse(traverseAndPatch);

    // Cleanup function
    return () => {
      // Force recompilation of all patched materials
      patchedMaterials.current.forEach?.((mat) => {
        if (mat && mat.needsUpdate !== undefined) {
          mat.needsUpdate = true;
        }
      });
      
      // Clear the cache
      patchedMaterials.current.clear?.();
    };
  }, [scene, patchMaterial]);

  return null;
}
