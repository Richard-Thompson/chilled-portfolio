// FogHeightColorInjectorFixed.jsx
import React, { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * FogHeightColorInjectorFixed
 * - Adds height-aware fog fade to scene fog (FogExp2 or Fog).
 * - Allows overriding fog color with `fogColor`.
 * - Avoids reserved '__' identifiers in GLSL.
 *
 * Props:
 *  heightStart: number (fog full at/below this Y)
 *  heightEnd:   number (fog gone at/above this Y)
 *  heightCurve: number (exponent for falloff: 1 = linear)
 *  fogColor:    string | THREE.Color (hex string accepted)
 */
export default function FogHeightColorInjectorFixed({
  heightStart = 2,
  heightEnd = 12,
  heightCurve = 1.0,
  fogColor = '#8fbce6',
}) {
  const { scene } = useThree()
  const uidRef = useRef(Math.floor(Math.random() * 0xffff).toString(16))

  useEffect(() => {
    if (!scene) return
    const uid = uidRef.current
    const token = `/* HEIGHT_FOG_${uid} */`

    const patchMaterial = (mat) => {
      if (!mat || typeof mat.onBeforeCompile !== 'function') return

      const original = mat.onBeforeCompile

      mat.onBeforeCompile = (shader, renderer) => {
        // add or update uniforms
        shader.uniforms.uHeightStart = shader.uniforms.uHeightStart || { value: heightStart }
        shader.uniforms.uHeightEnd = shader.uniforms.uHeightEnd || { value: heightEnd }
        shader.uniforms.uHeightCurve = shader.uniforms.uHeightCurve || { value: heightCurve }
        shader.uniforms.uFogColorOverride = shader.uniforms.uFogColorOverride || { value: new THREE.Color(fogColor) }

        shader.uniforms.uHeightStart.value = heightStart
        shader.uniforms.uHeightEnd.value = heightEnd
        shader.uniforms.uHeightCurve.value = heightCurve
        shader.uniforms.uFogColorOverride.value = new THREE.Color(fogColor)

        // --- VERTEX: add varying vWorldPosition if not present ---
        if (!/vWorldPosition/.test(shader.vertexShader)) {
          shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `#include <common>\n#ifndef HEIGHT_FOG_VARYING_DEFINED_${uid}\n#define HEIGHT_FOG_VARYING_DEFINED_${uid}\nvarying vec3 vWorldPosition;\n#endif`
          )

          shader.vertexShader = shader.vertexShader.replace(
            /gl_Position\s*=\s*projectionMatrix\s*\*\s*mvPosition\s*;/,
            `vWorldPosition = (modelMatrix * vec4( transformed, 1.0 )).xyz;\n  gl_Position = projectionMatrix * mvPosition;`
          )
        } else {
          // if it's declared but not written, try to write it
          if (!/vWorldPosition\s*=/.test(shader.vertexShader)) {
            shader.vertexShader = shader.vertexShader.replace(
              /gl_Position\s*=\s*projectionMatrix\s*\*\s*mvPosition\s*;/,
              `vWorldPosition = (modelMatrix * vec4( transformed, 1.0 )).xyz;\n  gl_Position = projectionMatrix * mvPosition;`
            )
          }
        }

        // --- FRAGMENT: add guarded declarations ---
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>\n#ifndef HEIGHT_FOG_FRAG_DECL_${uid}\n#define HEIGHT_FOG_FRAG_DECL_${uid}\nvarying vec3 vWorldPosition;\nuniform float uHeightStart;\nuniform float uHeightEnd;\nuniform float uHeightCurve;\nuniform vec3 uFogColorOverride;\n#endif`
        )

        // Replace fog_fragment include with an augmented block only once (guard by token)
        if (!shader.fragmentShader.includes(token)) {
          const replacement = `
/* BEGIN HEIGHT-AWARE FOG ${uid} */
${token}

// compute a local fog factor (supports FogExp2 and linear Fog)
float _fogFactor_local_${uid} = 0.0;
#ifdef USE_FOG
  float _fogDepth_${uid} = 0.0;
  #ifdef USE_VARYING_VVIEWPOSITION
    _fogDepth_${uid} = length( vViewPosition );
  #else
    #ifdef cameraPosition
      _fogDepth_${uid} = length( vWorldPosition - cameraPosition );
    #else
      _fogDepth_${uid} = 0.0;
    #endif
  #endif

  #if defined( FOG_EXP2 )
    #ifdef fogDensity
      _fogFactor_local_${uid} = 1.0 - exp( - fogDensity * fogDensity * _fogDepth_${uid} * _fogDepth_${uid} );
    #else
      _fogFactor_local_${uid} = 0.0;
    #endif
  #elif defined( FOG )
    #ifdef fogNear
      _fogFactor_local_${uid} = smoothstep( fogNear, fogFar, _fogDepth_${uid} );
    #else
      _fogFactor_local_${uid} = 0.0;
    #endif
  #endif
#endif

// height falloff (1.0 at/below uHeightStart, 0.0 at/above uHeightEnd)
float _hRange_${uid} = max(0.0001, uHeightEnd - uHeightStart);
float _hRaw_${uid} = 1.0 - clamp((vWorldPosition.y - uHeightStart) / _hRange_${uid}, 0.0, 1.0);
float _hFactor_${uid} = pow(max(0.0, _hRaw_${uid}), max(0.0001, uHeightCurve));

// final fog factor after height modulation
float _finalFog_${uid} = clamp(_fogFactor_local_${uid} * _hFactor_${uid}, 0.0, 1.0);

// apply mix only if fog is enabled; use override color when provided
#ifdef USE_FOG
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColorOverride, _finalFog_${uid});
#endif

/* END HEIGHT-AWARE FOG ${uid} */
`

          shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', replacement + '\n#include <fog_fragment>')
        }

        // Call original hook if present
        if (typeof original === 'function') {
          try { original(shader, renderer) } catch (e) { /* ignore to remain robust */ }
        }
      } // end onBeforeCompile

      mat.needsUpdate = true
    }

    // traverse and patch materials
    scene.traverse((o) => {
      if (!o.isMesh) return
      const mat = o.material
      if (Array.isArray(mat)) mat.forEach(patchMaterial)
      else patchMaterial(mat)
    })

    // cleanup: mark materials for recompile on unmount
    return () => {
      scene.traverse((o) => {
        if (!o.isMesh) return
        const mat = o.material
        if (Array.isArray(mat)) mat.forEach((m) => m && (m.needsUpdate = true))
        else mat && (mat.needsUpdate = true)
      })
    }
  }, [scene, heightStart, heightEnd, heightCurve, fogColor])

  return null
}
