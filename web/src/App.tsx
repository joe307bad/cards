import React, { useEffect, useState } from "react";
import { useBlackjackActions, useBlackjackState, usePlayerName, useWsService } from "./services/App/AppHook";
import MinimalTable from "./components/MinimalTable";
import { GetUserCardsResponse } from "./services/App/AppService";

export function App() {
	const actions = useBlackjackActions();
	const state = useBlackjackState();
	const ws = useWsService();
	const playerName = usePlayerName();
	const [initialState, setInitialState] = useState<GetUserCardsResponse | null>(null);
	console.log({ initialState })

	useEffect(() => {
		if (!playerName) {
			actions.get(playerName).then(r => {
				ws.connect()
				setInitialState(r)
			});
		}
	}, [playerName])

	return (
		<MinimalTable hit={actions.hit} gameState={state} />
	)
}