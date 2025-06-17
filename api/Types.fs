namespace Types

type Card = string

type BlackjackResult =
    | Push
    | Win
    | Loss

type PlayerCards =
    { UserId: string
      Cards: string list
      Total: int
      Result: BlackjackResult option }