import React, {useState, useRef, useMemo} from 'react';
import {Canvas, useFrame} from '@react-three/fiber';
import {Text} from '@react-three/drei';
import * as THREE from 'three';

interface PlayingCard {
    value: string;
    suit: string;
    color: string;
    symbol: string;
}

interface CardProps {
    isFlipped: boolean;
    card: PlayingCard;
}

function Card({isFlipped, card}: CardProps) {
    const meshRef = useRef<THREE.Mesh>(null);

    useFrame(() => {
        if (meshRef.current) {
            const targetRotation = isFlipped ? Math.PI : 0;
            meshRef.current.rotation.y = THREE.MathUtils.lerp(
                meshRef.current.rotation.y,
                targetRotation,
                0.1
            );
        }
    });

    return (
        <mesh ref={meshRef}>
            {/* Front side - Card face */}
            <planeGeometry args={[2.5, 3.5]}/>
            <meshStandardMaterial color="white" side={THREE.FrontSide}/>

            {/* Card border */}
            <mesh position={[0, 0, 0.001]}>
                <planeGeometry args={[2.4, 3.4]}/>
                <meshStandardMaterial color="#f8f8f8" side={THREE.FrontSide}/>
            </mesh>

            {/* Top left value and suit */}
            <Text
                position={[-0.9, 1.3, 0.002]}
                fontSize={0.3}
                color={card.color}
                anchorX="center"
                anchorY="middle"
            >
                {card.value}
            </Text>
            <Text
                position={[-0.9, 1, 0.002]}
                fontSize={0.4}
                color={card.color}
                anchorX="center"
                anchorY="middle"
            >
                {card.symbol}
            </Text>

            {/* Bottom right value and suit (rotated) */}
            <Text
                position={[0.9, -1.3, 0.002]}
                fontSize={0.3}
                color={card.color}
                anchorX="center"
                anchorY="middle"
                rotation={[0, 0, Math.PI]}
            >
                {card.value}
            </Text>
            <Text
                position={[0.9, -1, 0.002]}
                fontSize={0.4}
                color={card.color}
                anchorX="center"
                anchorY="middle"
                rotation={[0, 0, Math.PI]}
            >
                {card.symbol}
            </Text>

            {/* Center suit symbol */}
            <Text
                position={[0, 0, 0.002]}
                fontSize={1.2}
                color={card.color}
                anchorX="center"
                anchorY="middle"
            >
                {card.symbol}
            </Text>

            {/* Card name at bottom */}
            <Text
                position={[0, -0.5, 0.002]}
                fontSize={0.15}
                color="#666"
                anchorX="center"
                anchorY="middle"
            >
                {card.value} of {card.suit}
            </Text>

            {/* Back side - Card back */}
            <mesh position={[0, 0, -0.01]} rotation={[0, Math.PI, 0]}>
                <planeGeometry args={[2.5, 3.5]}/>
                <meshStandardMaterial color="#1e40af" side={THREE.FrontSide}/>

                {/* Decorative back pattern */}
                <mesh position={[0, 0, 0.001]}>
                    <planeGeometry args={[2.2, 3.2]}/>
                    <meshStandardMaterial color="#3b82f6" side={THREE.FrontSide}/>
                </mesh>

                <mesh position={[0, 0, 0.002]}>
                    <planeGeometry args={[1.8, 2.8]}/>
                    <meshStandardMaterial color="#1e40af" side={THREE.FrontSide}/>
                </mesh>

                {/* Decorative pattern */}
                <Text
                    position={[0, 0.5, 0.003]}
                    fontSize={0.3}
                    color="#60a5fa"
                    anchorX="center"
                    anchorY="middle"
                >
                    ♦ ♠ ♥ ♣
                </Text>
                <Text
                    position={[0, 0, 0.003]}
                    fontSize={0.4}
                    color="#93c5fd"
                    anchorX="center"
                    anchorY="middle"
                >
                    ★
                </Text>
                <Text
                    position={[0, -0.5, 0.003]}
                    fontSize={0.3}
                    color="#60a5fa"
                    anchorX="center"
                    anchorY="middle"
                >
                    ♣ ♥ ♠ ♦
                </Text>
            </mesh>
        </mesh>
    );
}

export default function PlayingCardFlip() {
    const [isFlipped, setIsFlipped] = useState(false);

    const generateRandomCard = (): PlayingCard => {
        const suits = [
            { name: 'Hearts', symbol: '♥', color: '#dc2626' },
            { name: 'Diamonds', symbol: '♦', color: '#dc2626' },
            { name: 'Clubs', symbol: '♣', color: '#000000' },
            { name: 'Spades', symbol: '♠', color: '#000000' }
        ];

        const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

        const randomSuit = suits[Math.floor(Math.random() * suits.length)];
        const randomValue = values[Math.floor(Math.random() * values.length)];

        return {
            value: randomValue,
            suit: randomSuit.name,
            color: randomSuit.color,
            symbol: randomSuit.symbol
        };
    };

    const [currentCard, setCurrentCard] = useState(() => generateRandomCard());

    const handleNewCard = () => {
        setCurrentCard(generateRandomCard());
        setIsFlipped(false);
    };

    return (
        <div className="w-full h-screen bg-gradient-to-br from-green-800 to-green-900">
            <div className="absolute top-4 left-4 z-10 space-x-3">
                <button
                    onClick={() => setIsFlipped(!isFlipped)}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-lg"
                >
                    {isFlipped ? 'Show Face' : 'Show Back'}
                </button>
                <button
                    onClick={handleNewCard}
                    className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium shadow-lg"
                >
                    New Card
                </button>
            </div>

            <div className="absolute top-4 right-4 z-10 bg-black bg-opacity-50 text-white px-4 py-2 rounded-lg">
                <div className="text-sm font-medium">Current Card:</div>
                <div className="text-lg" style={{color: currentCard.color}}>
                    {currentCard.value} of {currentCard.suit} {currentCard.symbol}
                </div>
            </div>

            <Canvas camera={{position: [0, 0, 8]}}>
                <ambientLight intensity={0.6}/>
                <pointLight position={[10, 10, 10]} intensity={0.8}/>
                <pointLight position={[-10, -10, 5]} intensity={0.3}/>
                <Card isFlipped={isFlipped} card={currentCard}/>
            </Canvas>
        </div>
    );
}