module BlackjackUserDb
open LightningDB
open System.Text
open System.Text.Json
open Newtonsoft.Json
open System.IO

type UserData = { Wins: int }

let private UserDataDbName = "user_data"
let private UserKeysDbName = "user_keys"

let getDbPath () =
        if Directory.Exists("/app/data/") then
            "/app/data/blackjack_user_db"
        else
            "./blackjack_user_db"

let private env =
    let e = new LightningEnvironment (getDbPath ())
    e.MaxDatabases <- 2
    e.Open()
    e

let private getDb (tx: LightningTransaction) (dbName: string) (create: bool) =
    if create then
        tx.OpenDatabase(dbName, DatabaseConfiguration(Flags = DatabaseOpenFlags.Create))
    else
        tx.OpenDatabase(dbName)

let saveUserKey (key: string) (value: string) =
    use tx = env.BeginTransaction()
    use db = getDb tx UserKeysDbName true
    tx.Put(db, Encoding.UTF8.GetBytes(key), Encoding.UTF8.GetBytes(value)) |> ignore
    tx.Commit()

let getUserKey (key: string) : string option =
    try
        use tx = env.BeginTransaction(TransactionBeginFlags.ReadOnly)
        use db = getDb tx UserKeysDbName false
        let keyBytes = System.Text.Encoding.UTF8.GetBytes(key)
        let success, value = tx.TryGet(db, keyBytes)
        if success then
            Some(System.Text.Encoding.UTF8.GetString(value))
        else
            None
    with 
    | :? LightningException -> None
    | _ -> None

let saveUserData (key: string) (userData: UserData) =
    use tx = env.BeginTransaction()
    use db = getDb tx UserDataDbName true
    let json = JsonConvert.SerializeObject(userData)
    tx.Put(db, Encoding.UTF8.GetBytes(key), Encoding.UTF8.GetBytes(json)) |> ignore
    tx.Commit()

let getUserData (key: string) : UserData option =
    try
        use tx = env.BeginTransaction(TransactionBeginFlags.ReadOnly)
        use db = getDb tx UserDataDbName false
        let keyBytes = System.Text.Encoding.UTF8.GetBytes key
        let success, value = tx.TryGet(db, keyBytes)
        if success then
            let json = System.Text.Encoding.UTF8.GetString(value)
            JsonConvert.DeserializeObject<UserData>(json) |> Some
        else
            None
    with 
    | :? LightningException -> None
    | _ -> None

let incrementWin (key: string) =
    let currentData = getUserData key |> Option.defaultValue { Wins = 0 }
    let updatedData =
        { currentData with
            Wins = currentData.Wins + 1 }
    saveUserData key updatedData |> ignore
    updatedData