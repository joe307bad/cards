// TODO this doesnt load anything that was persisted after server reboot and just recreates on boot every time
// TODO resume the last shuffled deck on reboot
// TODO Keep track of what card type is dealt so its a realistic 40,000 card deck
module Dealer

open System
open LightningDB
open Types
open System.IO

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


let getDbPath () =
        if Directory.Exists("/app/data/") then
            "/app/data/blackjack_dealer_db"
        else
            "./blackjack_dealer_db"

let env = new LightningEnvironment(getDbPath ())
env.MaxDatabases <- 1
env.MapSize <- 1073741824L // 1GB
env.Open(EnvironmentOpenFlags.WriteMap ||| EnvironmentOpenFlags.MapAsync)

let db =
    use txn = env.BeginTransaction()
    let database =
        txn.OpenDatabase(configuration = DatabaseConfiguration(Flags = DatabaseOpenFlags.Create))
    txn.Commit() |> ignore
    database
    
let shuffledCards = createShuffledDeck ()
let mutable currentIndex = 0
let mutable dealtCount = 0UL

let dealCard () =
    if currentIndex >= shuffledCards.Length then
        failwith "No more cards to deal"
    
    let card = shuffledCards.[currentIndex]
    currentIndex <- currentIndex + 1
    dealtCount <- dealtCount + 1UL
    
    use txn = env.BeginTransaction(TransactionBeginFlags.NoSync)
    let key = BitConverter.GetBytes(dealtCount)
    let value = System.Text.Encoding.UTF8.GetBytes(card)
    txn.Put(db, key, value, PutOptions.NoOverwrite) |> ignore
    txn.Commit() |> ignore
    
    card

let dealCards count =
    Array.init count (fun _ -> dealCard)

let getRemainingCards () =
    shuffledCards.Length - currentIndex

let getDealtCount (state: DealerState) = state.DealtCount

let dispose (state: DealerState) =
    state.Database.Dispose()
    state.Environment.Dispose()