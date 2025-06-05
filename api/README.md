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