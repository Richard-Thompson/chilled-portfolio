import React from 'react';
import './SwarmControl.css';

const SwarmControl = ({ swarmMode, onModeChange, disabled = false }) => {
  const handleClick = () => {
    if (!disabled) {
      onModeChange();
    }
  };

  const getModeText = () => {
    if (swarmMode === 'returning') {
      return 'Returning...';
    }
    return swarmMode === 'swarm' ? 'Swarm: ON' : 'Swarm: OFF';
  };

  const getModeClass = () => {
    if (disabled || swarmMode === 'returning') {
      return 'disabled';
    }
    return swarmMode === 'swarm' ? 'swarm' : 'normal';
  };

  return (
    <div className="swarm-control">
      <button 
        className={`swarm-button ${getModeClass()}`}
        onClick={handleClick}
        disabled={disabled}
        title={disabled ? "Particles returning to normal..." : "Click or press SPACE to toggle"}
      >
        {getModeText()}
      </button>
      <div className="keyboard-hint">Press SPACE</div>
      <div className="keyboard-hint">Press C for Controls</div>
    </div>
  );
};

export default SwarmControl;