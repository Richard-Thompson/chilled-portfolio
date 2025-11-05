import React from 'react';
import './SwarmControl.css';

const SwarmControl = ({ swarmMode, onModeChange }) => {
  const handleClick = () => {
    // Cycle through: normal -> swarm -> reverse -> normal
    const modes = ['normal', 'swarm', 'reverse'];
    const currentIndex = modes.indexOf(swarmMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    onModeChange(modes[nextIndex]);
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
      >
        {getModeText()}
      </button>
    </div>
  );
};

export default SwarmControl;