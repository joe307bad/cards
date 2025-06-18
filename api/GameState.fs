module GameState
open Types

type Game =
    { RoundActive: bool
      DealerCards: string list
      DealerTotal: int
      RoundStartTime: int64 option
      RoundEndTime: int64 option
      Results: PlayerCards list option }

let mutable gameState =
    { RoundActive = true
      RoundStartTime = Some 0
      RoundEndTime = Some 0
      DealerCards = []
      DealerTotal = 0
      Results = None }