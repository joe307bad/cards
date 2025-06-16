import { useState, useEffect } from 'react';

export default function CardDeck({
  cards = [],
}: {
  cards: readonly { readonly rank: string; readonly suit: string }[];
}) {
  const [visibleCards, setVisibleCards] = useState([]);

  useEffect(() => {
    if (cards.length > visibleCards.length) {
      const timer = setTimeout(() => {
        setVisibleCards(cards.slice(0, visibleCards.length + 1));
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setVisibleCards(cards);
    }
  }, [cards, visibleCards.length]);

  const getSuitSymbol = suit => {
    const symbols = {
      hearts: '♥',
      diamonds: '♦',
      clubs: '♣',
      spades: '♠',
    };
    return symbols[suit.toLowerCase()] || suit;
  };

  const getSuitColor = suit => {
    return ['hearts', 'diamonds'].includes(suit.toLowerCase())
      ? 'text-red-500'
      : 'text-black';
  };

  return (
    <div className="flex gap-2">
      {visibleCards.map((card, index) => (
        <div
          key={`${card.suit}-${card.rank}-${index}`}
          className="relative w-14 h-20 preserve-3d"
          style={{
            transformStyle: 'preserve-3d',
            animation: 'flip 0.6s ease-in-out forwards',
          }}
        >
          {/* Card Back */}
          <div
            className="absolute inset-0 w-full h-full bg-blue-800 rounded-lg border-2 border-gray-300 flex items-center justify-center backface-hidden"
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(0deg)',
            }}
          >
            <div className="text-white text-xs">🂠</div>
          </div>

          {/* Card Front */}
          <div
            className={`absolute inset-0 w-full h-full bg-white rounded-lg border-2 border-gray-300 flex flex-col items-center justify-between p-1 backface-hidden ${getSuitColor(card.suit)}`}
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
            }}
          >
            <div className="text-xs font-bold">{card.rank}</div>
            <div className="text-lg">{getSuitSymbol(card.suit)}</div>
            <div className="text-xs font-bold rotate-180">{card.rank}</div>
          </div>
        </div>
      ))}

      <style jsx>{`
        @keyframes flip {
          0% {
            transform: rotateY(0deg);
          }
          100% {
            transform: rotateY(180deg);
          }
        }
        .preserve-3d {
          transform-style: preserve-3d;
        }
        .backface-hidden {
          backface-visibility: hidden;
        }
      `}</style>
    </div>
  );
}
