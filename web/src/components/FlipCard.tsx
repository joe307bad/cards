import React, {useState, useRef, useMemo, useEffect} from 'react';
import {Canvas, useFrame} from '@react-three/fiber';
import {Text} from '@react-three/drei';
import * as THREE from 'three';
import { Button, Card as MTCard, Typography, Chip } from "@material-tailwind/react";
import {Vector3} from "three";

interface PlayingCard {
    value: string;
    suit: string;
    color: string;
    symbol: string;
}

interface CardProps {
    isFlipped: boolean;
    card: PlayingCard;
    position: [number, number, number];
    scale?: number;
    animateIn?: boolean;
}

interface Player {
    id: number;
    name: string;
    avatar: string;
    chips: number;
    status: 'playing' | 'folded' | 'waiting';
    currentBet: number;
}

function Card({isFlipped, card, position, scale = 1, animateIn = false}: CardProps) {
    const meshRef = useRef<THREE.Mesh>(null);
    const groupRef = useRef<THREE.Group>(null);
    const [hasAnimatedIn, setHasAnimatedIn] = useState(!animateIn);

    useFrame(() => {
        if (meshRef.current) {
            const targetRotation = isFlipped ? 0 : Math.PI;
            meshRef.current.rotation.y = THREE.MathUtils.lerp(
                meshRef.current.rotation.y,
                targetRotation,
                0.06
            );
        }

        // Animate card sliding in from the right
        if (groupRef.current && animateIn && !hasAnimatedIn) {
            const targetX = position[0];
            const currentX = groupRef.current.position.x;

            if (Math.abs(currentX - targetX) > 0.1) {
                groupRef.current.position.x = THREE.MathUtils.lerp(currentX, targetX, 0.08);
            } else {
                groupRef.current.position.x = targetX;
                setHasAnimatedIn(true);
            }
        }
    });

    // Set initial position for animation
    useEffect(() => {
        if (groupRef.current && animateIn) {
            groupRef.current.position.set(position[0] + 8, position[1], position[2]);
            setHasAnimatedIn(false);
        }
    }, [animateIn, position]);

    return (
        <group ref={groupRef} position={animateIn ? [position[0] + 8, position[1], position[2]] : position} scale={new Vector3(scale, scale, scale)}>
            <mesh ref={meshRef}>
                {/* Card thickness */}
                <boxGeometry args={[2.5, 3.5, 0.15]}/>
                <meshStandardMaterial color="black"/>

                {/* Front side - Card face */}
                <mesh position={[0, 0, 0.076]}>
                    <planeGeometry args={[2.5, 3.5]}/>
                    <meshStandardMaterial color="white" side={THREE.BackSide}/>
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
        </group>
    );
}

export default function PlayingCardFlip() {
    const [dealerCards, setDealerCards] = useState<PlayingCard[]>([]);
    const [playerCards, setPlayerCards] = useState<PlayingCard[]>([]);
    const [playerFlippedCards, setPlayerFlippedCards] = useState<boolean[]>([]);
    const [showDealerCards, setShowDealerCards] = useState(false);
    const [gameStarted, setGameStarted] = useState(false);

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

    const dealCards = () => {
        const newDealerCards = [generateRandomCard(), generateRandomCard()];
        const newPlayerCards = [generateRandomCard(), generateRandomCard()];

        setDealerCards(newDealerCards);
        setPlayerCards(newPlayerCards);
        setPlayerFlippedCards([false, false]);
        setShowDealerCards(false);
        setGameStarted(true);

        // Flip player cards after a delay
        setTimeout(() => {
            setPlayerFlippedCards([true, false]);
            setTimeout(() => {
                setPlayerFlippedCards([true, true]);
            }, 500);
        }, 1000);
    };

    const hitPlayer = () => {
        if (playerCards.length < 5) { // Limit to 5 cards max
            const newCard = generateRandomCard();
            const newCards = [...playerCards, newCard];
            const newFlipped = [...playerFlippedCards, false]; // Start face-down

            setPlayerCards(newCards);
            setPlayerFlippedCards(newFlipped);

            // Flip the new card after slide-in animation completes
            setTimeout(() => {
                const updatedFlipped = [...newFlipped];
                updatedFlipped[updatedFlipped.length - 1] = true;
                setPlayerFlippedCards(updatedFlipped);
            }, 1200); // Longer delay to let slide animation finish first
        }
    };

    const stand = () => {
        setShowDealerCards(true);
    };

    const [otherPlayers] = useState<Player[]>([
        { id: 1, name: "Sarah Chen", avatar: "SC", chips: 2500, status: 'playing', currentBet: 100 },
        { id: 2, name: "Mike Johnson", avatar: "MJ", chips: 1800, status: 'playing', currentBet: 150 },
        { id: 3, name: "Emma Wilson", avatar: "EW", chips: 3200, status: 'folded', currentBet: 0 },
        { id: 4, name: "Alex Rodriguez", avatar: "AR", chips: 900, status: 'playing', currentBet: 200 },
        { id: 5, name: "Lisa Park", avatar: "LP", chips: 4100, status: 'waiting', currentBet: 0 },
        { id: 6, name: "David Kim", avatar: "DK", chips: 1500, status: 'playing', currentBet: 100 }
    ]);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'playing': return 'green';
            case 'folded': return 'red';
            case 'waiting': return 'blue-gray';
            default: return 'gray';
        }
    };

    useEffect(() => {
        dealCards();
    }, []);

    return (
        <div className="w-full h-screen bg-gradient-to-br from-green-800 to-green-900 flex">
            {/* Game Area - 2/3 of screen */}
            <div className="w-2/3 relative">
                {/* Control Buttons */}
                <div className="absolute top-4 left-4 z-10 flex gap-3">
                    <Button
                        onClick={dealCards}
                        color="green"
                        variant="filled"
                        size="md"
                        className="shadow-lg"
                    >
                        Deal Cards
                    </Button>
                    {gameStarted && (
                        <>
                            <Button
                                onClick={hitPlayer}
                                color="blue"
                                variant="filled"
                                size="md"
                                className="shadow-lg"
                                disabled={playerCards.length >= 5}
                            >
                                Hit
                            </Button>
                            <Button
                                onClick={stand}
                                color="red"
                                variant="filled"
                                size="md"
                                className="shadow-lg"
                            >
                                Stand
                            </Button>
                        </>
                    )}
                </div>

                {/* Game Info */}
                <div className="absolute top-4 right-4 z-10">
                    <MTCard className="bg-white/20 backdrop-blur-sm px-4 py-3">
                        <Typography variant="small" className="font-medium mb-1 text-white">
                            Blackjack Table
                        </Typography>
                        <Typography variant="h6" className="font-bold text-white">
                            Dealer vs Player
                        </Typography>
                    </MTCard>
                </div>

                {/* 3D Card Scene */}
                <Canvas camera={{position: [0, 0, 12]}}>
                    <ambientLight intensity={0.4}/>
                    <pointLight position={[10, 10, 10]} intensity={0.8}/>
                    <pointLight position={[-10, -10, 5]} intensity={0.3}/>

                    {/* Dealer's Cards (top) */}
                    {dealerCards.map((card, index) => (
                        <Card
                            key={`dealer-${index}`}
                            isFlipped={index === 0 ? showDealerCards : false}
                            card={card}
                            position={[index * 3 - 1.5, 3, 0]}
                            scale={0.8}
                        />
                    ))}

                    {/* Player's Cards (bottom) */}
                    {playerCards.map((card, index) => (
                        <Card
                            key={`player-${index}-${card.value}-${card.suit}`}
                            isFlipped={playerFlippedCards[index] || false}
                            card={card}
                            position={[index * 2.5 - (playerCards.length - 1) * 1.25, -3, 0]}
                            scale={0.8}
                            animateIn={index >= 2} // Only animate cards after the initial 2
                        />
                    ))}

                    {/* Table Labels */}
                    <Text
                        position={[0, 5, 0]}
                        fontSize={0.8}
                        color="white"
                        anchorX="center"
                        anchorY="middle"
                    >
                        DEALER
                    </Text>
                    <Text
                        position={[0, -5.5, 0]}
                        fontSize={0.8}
                        color="white"
                        anchorX="center"
                        anchorY="middle"
                    >
                        PLAYER
                    </Text>
                </Canvas>
            </div>

            {/* Players List - 1/3 of screen */}
            <div className="w-1/3 bg-black/20 backdrop-blur-sm border-l border-white/20 p-4">
                <Typography variant="h5" className="text-white font-bold mb-6 text-center">
                    Other Players
                </Typography>

                <div className="space-y-4">
                    {otherPlayers.map((player) => (
                        <MTCard key={player.id} className="bg-white/10 backdrop-blur-sm p-4 hover:bg-white/20 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                                    {player.avatar}
                                </div>

                                <div className="flex-1">
                                    <Typography variant="h6" className="text-white font-semibold mb-1">
                                        {player.name}
                                    </Typography>

                                    <div className="flex items-center justify-between mb-2">
                                        <Typography variant="small" className="text-gray-300">
                                            Chips: ${player.chips.toLocaleString()}
                                        </Typography>
                                        <Chip
                                            value={player.status}
                                            color={getStatusColor(player.status)}
                                            size="sm"
                                        />
                                    </div>

                                    {player.currentBet > 0 && (
                                        <Typography variant="small" className="text-yellow-300 font-medium">
                                            Current Bet: ${player.currentBet}
                                        </Typography>
                                    )}
                                </div>
                            </div>
                        </MTCard>
                    ))}
                </div>

                <div className="mt-6 pt-4 border-t border-white/20">
                    <Typography variant="small" className="text-gray-400 text-center">
                        {otherPlayers.filter(p => p.status === 'playing').length} players active
                    </Typography>
                </div>
            </div>
        </div>
    );
}