import React, { useRef, useState, useEffect } from 'react';

/**
 * Lightweight Performance Monitor (Outside Canvas)
 * 
 * Tracks FPS using requestAnimationFrame and provides automatic performance scaling
 * Displays performance stats in the top-right corner
 */

const PERFORMANCE_THRESHOLDS = {
  EXCELLENT: 55, // Above 55 FPS
  GOOD: 40,      // 40-55 FPS  
  POOR: 25,      // 25-40 FPS
  CRITICAL: 15   // Below 25 FPS
};

export default function PerformanceMonitor({ 
  onPerformanceChange,
  showStats = process.env.NODE_ENV === 'development'
}) {
  const [fps, setFps] = useState(60);
  const [performanceLevel, setPerformanceLevel] = useState('EXCELLENT');
  
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const fpsArray = useRef([]);
  const animationId = useRef();
  
  useEffect(() => {
    const measureFPS = () => {
      frameCount.current++;
      
      // Update FPS every 30 frames for stability
      if (frameCount.current % 30 === 0) {
        const now = performance.now();
        const delta = now - lastTime.current;
        const currentFps = Math.round((30 * 1000) / delta);
        
        // Keep rolling average of last 10 FPS measurements
        fpsArray.current.push(currentFps);
        if (fpsArray.current.length > 10) {
          fpsArray.current.shift();
        }
        
        const averageFps = Math.round(
          fpsArray.current.reduce((a, b) => a + b, 0) / fpsArray.current.length
        );
        
        setFps(averageFps);
        lastTime.current = now;
        
        // Determine performance level
        let newLevel = 'CRITICAL';
        if (averageFps >= PERFORMANCE_THRESHOLDS.EXCELLENT) newLevel = 'EXCELLENT';
        else if (averageFps >= PERFORMANCE_THRESHOLDS.GOOD) newLevel = 'GOOD';
        else if (averageFps >= PERFORMANCE_THRESHOLDS.POOR) newLevel = 'POOR';
        
        if (newLevel !== performanceLevel) {
          setPerformanceLevel(newLevel);
          if (onPerformanceChange) {
            onPerformanceChange(newLevel, averageFps);
          }
        }
      }
      
      animationId.current = requestAnimationFrame(measureFPS);
    };
    
    animationId.current = requestAnimationFrame(measureFPS);
    
    return () => {
      if (animationId.current) {
        cancelAnimationFrame(animationId.current);
      }
    };
  }, [performanceLevel, onPerformanceChange]);

  if (!showStats) return null;

  const getColor = () => {
    switch (performanceLevel) {
      case 'EXCELLENT': return '#00ff00';
      case 'GOOD': return '#ffff00';
      case 'POOR': return '#ff8800';
      case 'CRITICAL': return '#ff0000';
      default: return '#ffffff';
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      backgroundColor: 'rgba(0,0,0,0.7)',
      color: getColor(),
      padding: '8px 12px',
      borderRadius: '4px',
      fontFamily: 'monospace',
      fontSize: '12px',
      zIndex: 1000,
      border: `1px solid ${getColor()}`
    }}>
      <div>FPS: {fps}</div>
      <div>Performance: {performanceLevel}</div>
    </div>
  );
}

// Export performance utility functions
export const getPerformanceSettings = (level) => {
  switch (level) {
    case 'EXCELLENT':
      return {
        particleCount: 120,
        instanceLimit: 12000,
        updateFrequency: 1,
        enableAdvancedEffects: true
      };
    case 'GOOD':
      return {
        particleCount: 80,
        instanceLimit: 8000,
        updateFrequency: 2,
        enableAdvancedEffects: true
      };
    case 'POOR':
      return {
        particleCount: 40,
        instanceLimit: 5000,
        updateFrequency: 3,
        enableAdvancedEffects: false
      };
    case 'CRITICAL':
      return {
        particleCount: 20,
        instanceLimit: 3000,
        updateFrequency: 4,
        enableAdvancedEffects: false
      };
    default:
      return {
        particleCount: 80,
        instanceLimit: 8000,
        updateFrequency: 2,
        enableAdvancedEffects: true
      };
  }
};