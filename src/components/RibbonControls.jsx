import React from 'react';
import './RibbonControls.css';

const RibbonControls = ({ 
  ribbonMode, 
  onRibbonModeChange, 
  isVisible = true 
}) => {
  const modes = [
    { key: 'off', label: 'No Ribbons' },
    { key: 'basic', label: 'Basic Trails' },
    { key: 'speed', label: 'Speed Trails' },
    { key: 'both', label: 'Both Effects' }
  ];

  if (!isVisible) return null;

  return (
    <div className="ribbon-controls">
      <h3>Speed Ribbon Effects</h3>
      <div className="ribbon-mode-buttons">
        {modes.map(mode => (
          <button
            key={mode.key}
            className={`ribbon-mode-btn ${ribbonMode === mode.key ? 'active' : ''}`}
            onClick={() => onRibbonModeChange(mode.key)}
          >
            {mode.label}
          </button>
        ))}
      </div>
      <div className="ribbon-info">
        <p>
          {ribbonMode === 'off' && 'No ribbon effects active'}
          {ribbonMode === 'basic' && 'Simple trailing ribbons that follow the sphere\'s path'}
          {ribbonMode === 'speed' && 'Dynamic ribbons that spawn from the back of the sphere during movement'}
          {ribbonMode === 'both' && 'Both ribbon effects combined for maximum visual impact'}
        </p>
      </div>
    </div>
  );
};

export default RibbonControls;