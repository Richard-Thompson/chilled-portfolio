import React from 'react';
import { EffectComposer, Bloom, SMAA } from '@react-three/postprocessing';
import { BlendFunction, KernelSize } from 'postprocessing';

/**
 * PostProcessing component that adds a bloom effect to the scene
 * Enhanced settings for maximum visibility
 */
const PostProcessing = React.memo(() => {
  return (
    <>
      {/* Test bloom object - bright emissive cube */}
      <mesh position={[3, 2, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      
      <EffectComposer>
        {/* Bloom effect with very visible settings for testing */}
        <Bloom
          intensity={1.20}        // High bloom intensity
          luminanceThreshold={0.1} // Very low threshold - almost everything will bloom
          luminanceSmoothing={0.6} // Smooth bloom transitions
          kernelSize={KernelSize.LARGE} // Large bloom radius
          blendFunction={BlendFunction.ADD} // Strong additive blending
          height={480} // Render resolution for bloom
        />
        
        {/* Anti-aliasing for smooth edges */}
        <SMAA />
      </EffectComposer>
    </>
  );
});

PostProcessing.displayName = 'PostProcessing';

export default PostProcessing;