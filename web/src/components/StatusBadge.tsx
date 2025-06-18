import React from 'react';

export const StatusBadge = ({ offense, defense, gameState }) => {
  // Don't show badge during active gameplay
  if (gameState === 'playing') return null;

  const getBadgeConfig = () => {
    // Blackjack (21 with first two cards)
    if (offense === 21) {
      return { text: 'BLACKJACK!', style: 'yellow' };
    }
    
    // Push (tie)x
    if (offense === defense) {
      return { text: 'PUSH', style: 'blue' };
    }
    
    // Bust (over 21)
    if (offense > 21) {
      return { text: 'BUST', style: 'red' };
    }
    
    // Dealer bust - player wins
    if (defense > 21) {
      return { text: 'WIN', style: 'green' };
    }
    
    // Player closer to 21 - wins
    if (offense > defense) {
      return { text: 'WIN', style: 'green' };
    }
    
    // Player further from 21 - loses
    return { text: 'LOSS', style: 'red' };
  };

  const getStyleClasses = (style) => {
    const baseClasses = "inline-flex items-center px-1 py-1 rounded text-xs font-semibold";
    
    const styleMap = {
      yellow: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
      green: 'bg-green-100 text-green-800 border border-green-300',
      red: 'bg-red-100 text-red-800 border border-red-300',
      blue: 'bg-blue-100 text-blue-800 border border-blue-300'
    };

    return `${baseClasses} ${styleMap[style]}`;
  };

  const config = getBadgeConfig();
  
  return (
    <span className={getStyleClasses(config.style)}>
      {config.text}
    </span>
  );
};