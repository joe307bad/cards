import React, {useState, useRef, useMemo, useEffect} from 'react';
import {Canvas, useFrame} from '@react-three/fiber';
import {Text} from '@react-three/drei';
import * as THREE from 'three';
import { Button, Card as MTCard, Typography } from "@material-tailwind/react";

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
                0.06
            );
        }
    });

    return (
        <mesh ref={meshRef}>
            {/* Card thickness - increased from 0.05 to 0.15 */}
            <boxGeometry args={[2.5, 3.5, 0.15]}/>
            <meshStandardMaterial color="black"/>

            {/* Front side - Card face */}
            <mesh position={[0, 0, 0.076]}>
                <planeGeometry args={[2.5, 3.5]}/>
                <meshStandardMaterial color="white" side={THREE.FrontSide}/>
            </mesh>

            {/* Top left value and suit */}
            <Text
                position={[-0.9, 1.3, 0.077]}
                fontSize={0.3}
                color={card.color}
                anchorX="center"
                anchorY="middle"
            >
                {card.value}
            </Text>
            <Text
                position={[-0.9, 0.9, 0.077]}
                fontSize={0.4}
                color={card.color}
                anchorX="center"
                anchorY="middle"
            >
                {card.symbol}
            </Text>

            {/* Bottom right value and suit (rotated) */}
            <Text
                position={[0.9, -1.3, 0.077]}
                fontSize={0.3}
                color={card.color}
                anchorX="center"
                anchorY="middle"
                rotation={[0, 0, Math.PI]}
            >
                {card.value}
            </Text>
            <Text
                position={[0.9, -0.9, 0.077]}
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
                position={[0, 0, 0.077]}
                fontSize={1.2}
                color={card.color}
                anchorX="center"
                anchorY="middle"
            >
                {card.symbol}
            </Text>

            {/* Back side - Card back */}
            <mesh position={[0, 0, -0.076]} rotation={[0, Math.PI, 0]}>
                <Text
                    position={[0, 0.5, 0.003]}
                    fontSize={0.25}
                    color="red"
                    anchorX="center"
                    anchorY="middle"
                >
                    ♦ ♠ ♥ ♣
                </Text>

                {/* Decorative pattern */}
                <Text
                    position={[0, 0, 0.003]}
                    fontSize={0.35}
                    color="red"
                    anchorX="center"
                    anchorY="middle"
                >
                    ★
                </Text>
                <Text
                    position={[0, -0.5, 0.003]}
                    fontSize={0.25}
                    color="red"
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
            <div className="absolute top-4 left-4 z-10 flex gap-3">
                <Button
                    onClick={() => setIsFlipped(!isFlipped)}
                    color="blue"
                    variant="filled"
                    size="md"
                    className="shadow-lg"
                >
                    {isFlipped ? 'Show Face' : 'Show Back'}
                </Button>
                <Button
                    onClick={handleNewCard}
                    color="purple"
                    variant="filled"
                    size="md"
                    className="shadow-lg"
                >
                    New Card
                </Button>
            </div>

            <div className="absolute top-4 right-4 z-10">
                <MTCard className="bg-white/50 backdrop-blur-sm px-4 py-3">
                    <Typography variant="small" className="font-medium mb-1 text-gray-800">
                        Current Card:
                    </Typography>
                    <Typography
                        variant="h6"
                        className="font-bold"
                        style={{color: currentCard.color}}
                    >
                        {currentCard.value} of {currentCard.suit} {currentCard.symbol}
                    </Typography>
                </MTCard>
            </div>

            <Canvas camera={{position: [0, 0, 8]}}>
                <ambientLight intensity={75}/>
                <pointLight position={[10, 10, 10]} intensity={0.8}/>
                <pointLight position={[-10, -10, 5]} intensity={0.3}/>
                <Card isFlipped={isFlipped} card={currentCard}/>
            </Canvas>
        </div>
    );
}