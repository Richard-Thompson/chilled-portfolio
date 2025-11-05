import React from 'react';
import './ParticleControls.css';

const ParticleControls = ({ 
  controls, 
  onControlChange, 
  isVisible = true 
}) => {
  const handleSliderChange = (key, value) => {
    onControlChange({
      ...controls,
      [key]: parseFloat(value)
    });
  };

  if (!isVisible) return null;

  return (
    <div className="particle-controls">
      <h3>Particle Controls</h3>
      
      <div className="control-group">
        <label>Speed</label>
        <div className="slider-container">
          <input
            type="range"
            min="0.1"
            max="3.0"
            step="0.1"
            value={controls.speed}
            onChange={(e) => handleSliderChange('speed', e.target.value)}
            className="slider"
          />
          <span className="value">{controls.speed.toFixed(1)}</span>
        </div>
      </div>

      <div className="control-group">
        <label>Chaos</label>
        <div className="slider-container">
          <input
            type="range"
            min="0.1"
            max="5.0"
            step="0.1"
            value={controls.chaos}
            onChange={(e) => handleSliderChange('chaos', e.target.value)}
            className="slider"
          />
          <span className="value">{controls.chaos.toFixed(1)}</span>
        </div>
      </div>

      <div className="control-group">
        <label>Orbit Size</label>
        <div className="slider-container">
          <input
            type="range"
            min="0.5"
            max="8.0"
            step="0.1"
            value={controls.orbitSize}
            onChange={(e) => handleSliderChange('orbitSize', e.target.value)}
            className="slider"
          />
          <span className="value">{controls.orbitSize.toFixed(1)}</span>
        </div>
      </div>

      <div className="control-group">
        <label>Attraction Force</label>
        <div className="slider-container">
          <input
            type="range"
            min="0.1"
            max="2.0"
            step="0.1"
            value={controls.attraction}
            onChange={(e) => handleSliderChange('attraction', e.target.value)}
            className="slider"
          />
          <span className="value">{controls.attraction.toFixed(1)}</span>
        </div>
      </div>

      <div className="control-group">
        <label>Orbital Complexity</label>
        <div className="slider-container">
          <input
            type="range"
            min="0.1"
            max="3.0"
            step="0.1"
            value={controls.complexity}
            onChange={(e) => handleSliderChange('complexity', e.target.value)}
            className="slider"
          />
          <span className="value">{controls.complexity.toFixed(1)}</span>
        </div>
      </div>

      <div className="control-group">
        <label>Pulse Intensity</label>
        <div className="slider-container">
          <input
            type="range"
            min="0.0"
            max="1.0"
            step="0.05"
            value={controls.pulse}
            onChange={(e) => handleSliderChange('pulse', e.target.value)}
            className="slider"
          />
          <span className="value">{controls.pulse.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};

export default ParticleControls;