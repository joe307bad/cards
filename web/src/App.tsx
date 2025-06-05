import React, { useEffect } from "react";
import { useBlackjackActions, useBlackjackState, useWsService } from "./services/App/AppHook";
import MinimalTable from "./components/MinimalTable";

export function App() {
    const actions = useBlackjackActions();
    const state = useBlackjackState();
    const ws = useWsService();

    useEffect(() => {
        ws.connect()
    }, [])

    return (
        <MinimalTable hit={actions.hit} stand={actions.stand} gameState={state} />
    )
}