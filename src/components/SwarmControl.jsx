import React from 'react';
import './SwarmControl.css';

const SwarmControl = ({ swarmMode, onModeChange }) => {
  const handleClick = () => {
    // Use the passed cycling function
    onModeChange();
  };

  const getModeText = () => {
    switch(swarmMode) {
      case 'swarm': return 'Reverse Swarm';
      case 'reverse': return 'Normal Mode';
      default: return 'Swarm Mode';
    }
  };

  const getModeClass = () => {
    switch(swarmMode) {
      case 'swarm': return 'swarm';
      case 'reverse': return 'reverse';
      default: return 'normal';
    }
  };

  return (
    <div className="swarm-control">
      <button 
        className={`swarm-button ${getModeClass()}`}
        onClick={handleClick}
        title="Click or press SPACE to toggle"
      >
        {getModeText()}
      </button>
      <div className="keyboard-hint">Press SPACE</div>
    </div>
  );
};

export default SwarmControl;