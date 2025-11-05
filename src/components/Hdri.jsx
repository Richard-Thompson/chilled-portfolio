import React, { useEffect, useCallback, useRef } from 'react';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { PMREMGenerator, TextureLoader, EquirectangularReflectionMapping } from 'three';
import { useThree } from '@react-three/fiber';

/**
 * Smart Environment Map Component - Handles both HDR and PNG files
 * 
 * Props:
 * @param {string} texturePath - Path to the environment texture (.hdr, .exr, .png, .jpg)
 * @param {number} intensity - Environment map intensity (default: 1.0)
 * @param {function} onLoad - Callback when texture loads successfully
 * @param {function} onError - Callback when texture fails to load
 */
export default function EnvironmentMap({ 
  texturePath = '/sky_19_2k.png',
  intensity = 1.0,
  onLoad,
  onError 
}) {
  const { gl, scene } = useThree();
  const pmremGeneratorRef = useRef();
  const envMapRef = useRef();

  // Cleanup function to properly dispose resources
  const cleanup = useCallback(() => {
    if (pmremGeneratorRef.current) {
      pmremGeneratorRef.current.dispose();
      pmremGeneratorRef.current = null;
    }
    if (envMapRef.current) {
      envMapRef.current.dispose();
      envMapRef.current = null;
    }
  }, []);

  // Helper function to detect file type
  const getFileExtension = useCallback((path) => {
    return path.split('.').pop()?.toLowerCase();
  }, []);

  // Helper function to determine if file is HDR format
  const isHDRFormat = useCallback((path) => {
    const ext = getFileExtension(path);
    return ['hdr', 'exr'].includes(ext);
  }, [getFileExtension]);

  useEffect(() => {
    if (!gl || !scene) return;

    // Clean up previous resources
    cleanup();

    const pmremGenerator = new PMREMGenerator(gl);
    pmremGenerator.compileEquirectangularShader();
    pmremGeneratorRef.current = pmremGenerator;

    // Choose appropriate loader based on file type
    const isHDR = isHDRFormat(texturePath);
    const loader = isHDR ? new RGBELoader() : new TextureLoader();
    
    console.log(`Loading ${isHDR ? 'HDR' : 'LDR'} environment texture: ${texturePath}`);

    // Set loading manager for better error handling
    loader.load(
      texturePath,
      // Success callback
      (texture) => {
        try {
          let envMap;
          
          if (isHDR) {
            // For HDR files, use PMREM generator
            envMap = pmremGenerator.fromEquirectangular(texture).texture;
            texture.dispose(); // Dispose original HDR texture to free memory
          } else {
            // For PNG/JPG files, set up as equirectangular mapping
            texture.mapping = EquirectangularReflectionMapping;
            texture.needsUpdate = true;
            
            // Generate environment map from regular texture
            envMap = pmremGenerator.fromEquirectangular(texture).texture;
            // Note: Don't dispose the original texture immediately for PNG/JPG
          }
          
          // Apply intensity if specified
          if (intensity !== 1.0) {
            envMap.intensity = intensity;
          }
          
          // Set environment map
          scene.environment = envMap;
          scene.background = envMap;
          envMapRef.current = envMap;
          
          // Call success callback
          if (onLoad) {
            onLoad(envMap);
          }
          
          console.log(`Environment texture loaded successfully: ${texturePath}`);
        } catch (error) {
          console.error('Error processing environment texture:', error);
          if (onError) {
            onError(error);
          }
        }
      },
      // Progress callback
      (progress) => {
        if (progress.total > 0) {
          console.log('Environment loading progress:', Math.round((progress.loaded / progress.total) * 100) + '%');
        }
      },
      // Error callback
      (error) => {
        console.error('Error loading environment texture:', error);
        if (onError) {
          onError(error);
        }
      }
    );

    // Cleanup function
    return cleanup;
  }, [gl, scene, texturePath, intensity, cleanup, onLoad, onError, isHDRFormat]);

  return null;
}