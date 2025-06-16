// TODO this doesnt load anything that was persisted after server reboot and just recreates on boot every time
// TODO resume the last shuffled deck on reboot
// TODO Keep track of what card type is dealt so its a realistic 40,000 card deck
module HighSpeedCardDealer

open System
open LightningDB

type Card = string

type DealerState =
    { Environment: LightningEnvironment
      Database: LightningDatabase
      ShuffledCards: Card[]
      mutable CurrentIndex: int
      mutable DealtCount: uint64 }

let totalCards = 2_080_000

let private createSingleDeck () =
    let suits = ["H"; "D"; "C"; "S"]
    let ranks = ["A"; "2"; "3"; "4"; "5"; "6"; "7"; "8"; "9"; "10"; "J"; "Q"; "K"]
    [| for suit in suits do
           for rank in ranks do
               yield rank + suit |]

let private createShuffledDeck () = // 40,000 decks
    let singleDeck = createSingleDeck ()
    let cards = Array.init totalCards (fun i -> singleDeck.[i % 52])
    let rng = Random()
    for i = cards.Length - 1 downto 1 do
        let j = rng.Next(i + 1)
        let temp = cards.[i]
        cards.[i] <- cards.[j]
        cards.[j] <- temp
    cards

let calculateCardValue (cards: Card list) =
    let getCardValue (card: Card) =
        let rank = card.Substring(0, card.Length - 1)
        match rank with
        | "A" -> 11
        | "J" | "Q" | "K" -> 10
        | "10" -> 10
        | n -> int n
    
    let rec adjustForAces total aces =
        if total > 21 && aces > 0 then
            adjustForAces (total - 10) (aces - 1)
        else
            total
    
    let values = cards |> List.map getCardValue
    let total = List.sum values
    let aces = cards |> List.filter (fun c -> c.StartsWith("A")) |> List.length
    adjustForAces total aces

let initializeDealer (dbPath: string) =
    let env = new LightningEnvironment(dbPath)
    env.MaxDatabases <- 1
    env.MapSize <- 1073741824L // 1GB
    env.Open(EnvironmentOpenFlags.WriteMap ||| EnvironmentOpenFlags.MapAsync)
    
    let db =
        use txn = env.BeginTransaction()
        let database =
            txn.OpenDatabase(configuration = DatabaseConfiguration(Flags = DatabaseOpenFlags.Create))
        txn.Commit() |> ignore
        database
    
    { Environment = env
      Database = db
      ShuffledCards = createShuffledDeck ()
      CurrentIndex = 0
      DealtCount = 0UL }

let dealCard (state: DealerState) =
    if state.CurrentIndex >= state.ShuffledCards.Length then
        failwith "No more cards to deal"
    
    let card = state.ShuffledCards.[state.CurrentIndex]
    state.CurrentIndex <- state.CurrentIndex + 1
    state.DealtCount <- state.DealtCount + 1UL
    
    use txn = state.Environment.BeginTransaction(TransactionBeginFlags.NoSync)
    let key = BitConverter.GetBytes(state.DealtCount)
    let value = System.Text.Encoding.UTF8.GetBytes(card)
    txn.Put(state.Database, key, value, PutOptions.NoOverwrite) |> ignore
    txn.Commit() |> ignore
    
    card

let dealCards (state: DealerState) (count: int) =
    Array.init count (fun _ -> dealCard state)

let getRemainingCards (state: DealerState) =
    state.ShuffledCards.Length - state.CurrentIndex

let getDealtCount (state: DealerState) = state.DealtCount

let dispose (state: DealerState) =
    state.Database.Dispose()
    state.Environment.Dispose()