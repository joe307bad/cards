import React, { createContext, useContext, ReactNode, useState, useEffect } from "react"
import { Effect } from "effect"
import { useSnapshot } from "valtio"
import {
    BlackjackService,
    blackjackServiceLive
} from "./AppService"
import {
    GameWebSocketService,
    gameWebSocketServiceLive,
    gameWebSocketState,
} from '../WebSocketService'

// Random name generator
const generateRandomName = (): string => {
    const adjectives = [
        'Lucky', 'Bold', 'Swift', 'Clever', 'Mighty', 'Sharp', 'Brave', 'Cool',
        'Royal', 'Smooth', 'Quick', 'Wild', 'Fierce', 'Noble', 'Wise', 'Elite'
    ]

    const nouns = [
        'Ace', 'King', 'Queen', 'Jack', 'Diamond', 'Spade', 'Heart', 'Club',
        'Player', 'Gambler', 'Winner', 'Champion', 'Master', 'Legend', 'Hero', 'Star'
    ]

    const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)]
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)]
    const randomNumber = Math.floor(Math.random() * 1000)

    return `${randomAdjective}${randomNoun}${randomNumber}`
}

const getStoredPlayerName = (): string | null => {
    return localStorage.getItem('blackjack-player-name')
}

const storePlayerName = (name: string): void => {
    localStorage.setItem('blackjack-player-name', name)
}

type BlackjackContextType = {
    blackjack: BlackjackService
    ws: GameWebSocketService
    playerName: string
}

const BlackjackContext = createContext<BlackjackContextType | null>(null)

interface BlackjackProviderProps {
    children: ReactNode
}

export const BlackjackProvider: React.FC<BlackjackProviderProps> = ({ children }) => {
    const [playerName, setPlayerName] = useState<string>('')

    useEffect(() => {
        let storedName = getStoredPlayerName()

        if (!storedName) {
            storedName = generateRandomName()
            storePlayerName(storedName)
        }

        setPlayerName(storedName)
    }, [])

    const value: BlackjackContextType = {
        blackjack: blackjackServiceLive,
        ws: gameWebSocketServiceLive,
        playerName
    }

    return (
        <BlackjackContext.Provider value={value}>
            {children}
        </BlackjackContext.Provider>
    )
}

const useWsService = () => {
    const context = useContext(BlackjackContext)
    if (!context) {
        throw new Error("useWsService must be used within a BlackjackProvider")
    }

    const connect = async () => {
        await Effect.runPromise(context.ws.connect())
    }

    return { connect }
}

const useBlackjackService = (): BlackjackService => {
    const context = useContext(BlackjackContext)
    if (!context) {
        throw new Error("useBlackjackService must be used within a BlackjackProvider")
    }
    return context.blackjack
}

const useBlackjackState = () => {
    return useSnapshot(gameWebSocketState)
}

const useBlackjackActions = () => {
    const context = useContext(BlackjackContext)
    const service = useBlackjackService()

    if (!context) {
        throw new Error("useBlackjackActions must be used within a BlackjackProvider")
    }

    const hit = async () => {
        await Effect.runPromise(service.hit(context.playerName))
    }

    return {
        hit,
        playerName: context.playerName
    }
}

const usePlayerName = (): string => {
    const context = useContext(BlackjackContext)
    if (!context) {
        throw new Error("usePlayerName must be used within a BlackjackProvider")
    }
    return context.playerName
}

export {
    useBlackjackActions,
    useBlackjackState,
    useWsService,
    usePlayerName
}