module Blackjack

open System.IO
open LightningDB
open Newtonsoft.Json
open System

open Types
open Utils.calculateCardValue

type Round =
    { Environment: LightningEnvironment
      Database: LightningDatabase }

    interface IDisposable with
        member this.Dispose() =
            try
                this.Environment.Dispose()
            with ex ->
                printfn "Error disposing environment: %s" ex.Message

let getDbPath () =
        if Directory.Exists "/app/data/" then
            "/app/data/blackjack_db"
        else
            "./blackjack_db"

let userCardsKey (userId: string) = sprintf "user_cards_%s" userId

let env = new LightningEnvironment(getDbPath ())
env.MaxDatabases <- 1
env.MapSize <- 1073741824L
env.Open(EnvironmentOpenFlags.WriteMap ||| EnvironmentOpenFlags.MapAsync)

let db =
    use txn = env.BeginTransaction()

    let database =
        txn.OpenDatabase(configuration = DatabaseConfiguration(Flags = DatabaseOpenFlags.Create))

    txn.Commit() |> ignore
    database

let blackJackRound = { Environment = env; Database = db }

let clearBlackjackDatabase () =
    use txn = env.BeginTransaction()
    txn.TruncateDatabase db |> ignore
    txn.Commit() |> ignore

let savePlayerCards userId cards =
    use txn = env.BeginTransaction()
    use db = txn.OpenDatabase()

    let playerData =
        {   UserId = userId
            Cards = cards
            Total = calculateCardValue cards
            Result = None }

    let json = JsonConvert.SerializeObject playerData
    let keyBytes = System.Text.Encoding.UTF8.GetBytes(userCardsKey userId)
    let valueBytes = System.Text.Encoding.UTF8.GetBytes json
    txn.Put(db, keyBytes, valueBytes) |> ignore
    txn.Commit() |> ignore

let loadAllPlayerCards () =
    use txn = env.BeginTransaction()
    use cursor = txn.CreateCursor db
    let mutable playerCardsList: PlayerCards list = []

    let struct (firstResult, firstKey, firstValue) = cursor.First()

    if firstResult = MDBResultCode.Success then
        let valueBytes = firstValue.CopyToNewArray()

        if valueBytes.Length > 0 then
            let json = System.Text.Encoding.UTF8.GetString(valueBytes)
            let playerData = JsonConvert.DeserializeObject<PlayerCards> json
            playerCardsList <- playerData :: playerCardsList

        let mutable continue' = true

        while continue' do
            let struct (nextResult, nextKey, nextValue) = cursor.Next()

            if nextResult = MDBResultCode.Success then
                let valueBytes = nextValue.CopyToNewArray()

                if valueBytes.Length > 0 then
                    let json = System.Text.Encoding.UTF8.GetString(valueBytes)
                    let playerData = JsonConvert.DeserializeObject<PlayerCards> json
                    playerCardsList <- playerData :: playerCardsList
            else
                continue' <- false

    playerCardsList
let loadPlayerCards userId =
    try
        use txn =
            env.BeginTransaction(TransactionBeginFlags.ReadOnly)

        use db = txn.OpenDatabase()

        let keyBytes = System.Text.Encoding.UTF8.GetBytes(userCardsKey userId)
        let success, value = txn.TryGet(db, keyBytes)

        if success then
            let json = System.Text.Encoding.UTF8.GetString(value.AsSpan())
            JsonConvert.DeserializeObject<PlayerCards>(json) |> Some
        else
            None
    with _ ->
        None
