import React, { useEffect } from "react";
import { useBlackjackActions, useBlackjackState } from "../services/App/AppHook";

export function GameDebugger() {
    const actions = useBlackjackActions();
    const state = useBlackjackState();

    useEffect(() => {
        console.log("------------")
        console.log("dealer hand")
        console.dir(Array.from(state.dealerHand.map(c => ({ ...c }))))
        console.log("dealer score", state.dealerScore)
        console.log("---")
        console.log("player hand")
        console.dir(Array.from(state.playerHand.map(c => ({ ...c }))))
        console.log("player score", state.playerScore)
        console.log("---")
        console.log("game state", state.gameStatus)
        console.log("-----------")
    }, [state.playerHand, state.dealerHand])

    return (
        <>
            <button className="border-1 p-5 m-5" onClick={actions.newGame}>New Game</button>
            <button className="border-1 p-5 m-5" onClick={actions.hit}>Hit</button>
            <button className="border-1 p-5 m-5" onClick={actions.stand}>Stay</button>
        </>
    )
}