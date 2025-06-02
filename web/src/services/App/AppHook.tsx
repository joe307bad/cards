import React, { createContext, useContext, ReactNode } from "react"
import { Effect } from "effect"
import { useSnapshot } from "valtio"
import {
    BlackjackService,
    blackjackServiceLive,
    gameState,
    GameStateSnapshot,
} from "./AppService"

type BlackjackContextType = {
    service: BlackjackService
}

const BlackjackContext = createContext<BlackjackContextType | null>(null)

interface BlackjackProviderProps {
    children: ReactNode
}

export const BlackjackProvider: React.FC<BlackjackProviderProps> = ({ children }) => {
    const value: BlackjackContextType = {
        service: blackjackServiceLive
    }

    return (
        <BlackjackContext.Provider value={value}>
            {children}
        </BlackjackContext.Provider>
    )
}

const useBlackjackService = (): BlackjackService => {
    const context = useContext(BlackjackContext)
    if (!context) {
        throw new Error("useBlackjackService must be used within a BlackjackProvider")
    }
    return context.service
}

const useBlackjackState = (): GameStateSnapshot => {
    return useSnapshot(gameState)
}

const useBlackjackActions = () => {
    const service = useBlackjackService()

    const newGame = async () => {
        await Effect.runPromise(service.newGame())
    }

    const hit = async () => {
        await Effect.runPromise(service.hit())
    }

    const stand = async () => {
        await Effect.runPromise(service.stand())
    }

    return { newGame, hit, stand }
}

export { useBlackjackActions, useBlackjackState }