import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

// Playing card data
const suits = ['H', 'D', 'C', 'S']; // Hearts, Diamonds, Clubs, Spades
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const suitSymbols = {
  'H': '\u2665', // ♥ Hearts
  'D': '\u2666', // ♦ Diamonds  
  'C': '\u2663', // ♣ Clubs
  'S': '\u2660'  // ♠ Spades
};
const suitColors = {
	'H': '#dc2626', // red
	'D': '#dc2626', // red
	'C': '#1f2937', // black
	'S': '#1f2937' // black
};

function generateRandomCard() {
	const suit = suits[Math.floor(Math.random() * suits.length)];
	const rank = ranks[Math.floor(Math.random() * ranks.length)];
	return rank + suit;
}

function parseCard(cardType) {
	const suit = cardType.slice(-1);
	const rank = cardType.slice(0, -1);
	return { suit, rank };
}

function PlayingCard({ cardType }) {
	const { suit, rank } = parseCard(cardType);
	const symbol = suitSymbols[suit];
	const color = suitColors[suit];

	return (
		<>
			{/* Card Face */}
			<mesh position={[0, 0, 0.01]}>
				<planeGeometry args={[2.5, 3.5]} />
				<meshStandardMaterial color="white" />
			</mesh>

			{/* Card Border */}
			<mesh position={[0, 0, 0.005]}>
				<planeGeometry args={[2.6, 3.6]} />
				<meshStandardMaterial color="#1f2937" />
			</mesh>

			{/* Main Rank and Suit */}
			<Text
				position={[-0.8, 1.3, 0.02]}
				fontSize={0.4}
				color={color}
				anchorX="center"
				anchorY="middle"
			>
				{rank}
			</Text>
			<Text
				position={[-0.8, 0.8, 0.02]}
				fontSize={0.5}
				color={color}
				anchorX="center"
				anchorY="middle"
			>
				{symbol}
			</Text>

			{/* Center Symbol */}
			<Text
				position={[0, 0, 0.02]}
				fontSize={1.2}
				color={color}
				anchorX="center"
				anchorY="middle"
			>
				{symbol}
			</Text>

			{/* Bottom right (upside down) */}
			<Text
				position={[0.8, -1.3, 0.02]}
				fontSize={0.4}
				color={color}
				anchorX="center"
				anchorY="middle"
				rotation={[0, 0, Math.PI]}
			>
				{rank}
			</Text>
			<Text
				position={[0.8, -0.8, 0.02]}
				fontSize={0.5}
				color={color}
				anchorX="center"
				anchorY="middle"
				rotation={[0, 0, Math.PI]}
			>
				{symbol}
			</Text>
		</>
	);
}

function CardBack() {
	return (
		<>
			{/* Card Back */}
			<mesh position={[0, 0, -0.01]} rotation={[0, Math.PI, 0]}>
				<planeGeometry args={[2.5, 3.5]} />
				<meshStandardMaterial color="#1e40af" />
			</mesh>

			{/* Back Border */}
			<mesh position={[0, 0, -0.005]} rotation={[0, Math.PI, 0]}>
				<planeGeometry args={[2.6, 3.6]} />
				<meshStandardMaterial color="#1f2937" />
			</mesh>

			{/* Back Pattern */}
			<Text
				position={[0, 0, -0.02]}
				rotation={[0, Math.PI, 0]}
				fontSize={0.3}
				color="white"
				anchorX="center"
				anchorY="middle"
			>
				{'\u2660\u2665\u2663\u2666'}
			</Text>
		</>
	);
}

function FlipCard({ initialCard = "AS" }) {
	const cardRef = useRef<THREE.Group>(null);
	const [currentCard, setCurrentCard] = useState(initialCard);
	const [targetRotation, setTargetRotation] = useState(Math.PI); // Start back up

	// Flip once to show the card face
	useEffect(() => {
		const timer = setTimeout(() => {
			setTargetRotation(0); // Flip to show face
		}, 500); // Short delay before flipping
		return () => clearTimeout(timer);
	}, []);

	// Smooth rotation animation
	useFrame(() => {
		if (cardRef.current) {
			cardRef.current.rotation.y = THREE.MathUtils.lerp(
				cardRef.current.rotation.y,
				targetRotation,
				0.1
			);
		}
	});

	return (
		<group ref={cardRef} rotation={[0, Math.PI, 0]}>
			<PlayingCard cardType={currentCard} />
			<CardBack />
		</group>
	);
}

export function PlayCard({ card }) {
	return (
		<div className="w-15 h-20">
			<Canvas camera={{ position: [0, 0, 4], fov: 50 }}>
				<ambientLight intensity={5} />
				<pointLight position={[5, 5, 5]} intensity={1} />
				<FlipCard initialCard={card} />
			</Canvas>
		</div>
	);
}