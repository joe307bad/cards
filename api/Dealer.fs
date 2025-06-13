// TODO this doesnt load anything that was persisted after server reboot and just recreates on boot every time
// TODO resume the last shuffled deck on reboot
// TODO Keep track of what card type is dealt so its a realistic 40,000 card deck
module HighSpeedCardDealer

open System
open LightningDB

// Card representation - simple int for maximum performance
type Card = int

// Dealer state
type DealerState =
    { Environment: LightningEnvironment
      Database: LightningDatabase
      ShuffledCards: Card[]
      mutable CurrentIndex: int
      mutable DealtCount: uint64 }

let totalCards = 2_080_000

let private createShuffledDeck () = // 40,000 decks
    let cards = Array.init totalCards id

    // Fisher-Yates shuffle for maximum randomness
    let rng = Random()

    for i = cards.Length - 1 downto 1 do
        let j = rng.Next(i + 1)
        let temp = cards.[i]
        cards.[i] <- cards.[j]
        cards.[j] <- temp

    cards

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

    // Immediate persistence - use WriteMap for maximum speed
    use txn = state.Environment.BeginTransaction(TransactionBeginFlags.NoSync)
    let key = BitConverter.GetBytes(state.DealtCount)
    let value = BitConverter.GetBytes(card)
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
