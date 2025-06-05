## Example game state ws message

```
{"timestamp":1749132879,"playerHands":{"player-1":{"cards":[{"suit":"diamonds","rank":"5","value":5}],"score":5,"state":"standing","result":{"Case":"Some","Fields":["loss"]}}},"dealerHand":[{"suit":"hearts","rank":"7","value":7},{"suit":"hearts","rank":"K","value":10}],"dealerScore":17,"deck":[{"suit":"diamonds","rank":"7","value":7},{"suit":"spades","rank":"A","value":11},{"suit":"diamonds","rank":"K","value":10},{"suit":"spades","rank":"Q","value":10},{"suit":"diamonds","rank":"4","value":4},{"suit":"spades","rank":"J","value":10},{"suit":"hearts","rank":"3","value":3},{"suit":"clubs","rank":"3","value":3},{"suit":"clubs","rank":"9","value":9},{"suit":"diamonds","rank":"6","value":6},{"suit":"diamonds","rank":"3","value":3},{"suit":"hearts","rank":"8","value":8},{"suit":"hearts","rank":"2","value":2},{"suit":"diamonds","rank":"8","value":8},{"suit":"hearts","rank":"10","value":10},{"suit":"spades","rank":"3","value":3},{"suit":"diamonds","rank":"2","value":2},{"suit":"diamonds","rank":"Q","value":10},{"suit":"diamonds","rank":"10","value":10},{"suit":"clubs","rank":"2","value":2},{"suit":"hearts","rank":"6","value":6},{"suit":"clubs","rank":"K","value":10},{"suit":"diamonds","rank":"J","value":10},{"suit":"hearts","rank":"J","value":10},{"suit":"clubs","rank":"7","value":7},{"suit":"hearts","rank":"4","value":4},{"suit":"spades","rank":"5","value":5},{"suit":"clubs","rank":"J","value":10},{"suit":"clubs","rank":"10","value":10},{"suit":"spades","rank":"2","value":2},{"suit":"spades","rank":"4","value":4},{"suit":"spades","rank":"6","value":6},{"suit":"spades","rank":"K","value":10},{"suit":"clubs","rank":"8","value":8},{"suit":"clubs","rank":"A","value":11},{"suit":"hearts","rank":"A","value":11},{"suit":"hearts","rank":"Q","value":10},{"suit":"spades","rank":"7","value":7},{"suit":"hearts","rank":"5","value":5},{"suit":"diamonds","rank":"9","value":9},{"suit":"clubs","rank":"6","value":6},{"suit":"clubs","rank":"4","value":4},{"suit":"hearts","rank":"9","value":9},{"suit":"diamonds","rank":"A","value":11},{"suit":"spades","rank":"10","value":10},{"suit":"spades","rank":"9","value":9},{"suit":"clubs","rank":"5","value":5},{"suit":"clubs","rank":"Q","value":10},{"suit":"spades","rank":"8","value":8}],"gameStatus":"game_ended","roundStartTime":1749132865,"roundEndTime":{"Case":"Some","Fields":[1749132875]}}
```

## curl commands to hit/stay

```
curl -X POST http://localhost:8080/game-action \
  -H "Content-Type: application/json" \
  -d '{"type": "hit", "userId": "player1"}'
```

```
curl -X POST http://localhost:8080/game-action \
  -H "Content-Type: application/json" \
  -d '{"type": "stay", "userId": "player1"}'
```