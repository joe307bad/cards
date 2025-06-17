module HitHandler

open Giraffe
open Saturn
open Newtonsoft.Json
open GameState
open Blackjack
open BlackjackUserDb
open Types
open Utils.calculateCardValue
open Dealer
open Utils.createPlayerResponse
open Socket

let dealAndUpdate userId =
    let card1 = dealCard ()
    let card2 = dealCard ()
    let cards: Card list = [ card1; card2 ]
    savePlayerCards userId cards

    let playerCards =
        { UserId = userId
          Cards = cards
          Total = calculateCardValue cards
          Result = None }

    printfn "🆕 Player %s joined - Initial cards: %A (Total: %d)" userId cards (calculateCardValue cards)
    Some playerCards

let dealInitialCards userId secretKey =
    match getUserKey userId with
    | Some storedKey when storedKey = secretKey -> dealAndUpdate userId
    | Some _ -> None
    | None ->
        saveUserKey userId secretKey |> ignore
        dealAndUpdate userId

let hitAndUpdate userId =
    match loadPlayerCards userId with
    | Some(player: PlayerCards) ->
        let playerTotal = calculateCardValue player.Cards

        let blackjackResult: BlackjackResult option =
            if playerTotal > 21 then Some Loss
            elif playerTotal = 21 then Some Win
            else None

        match blackjackResult with
        | Some _ -> None
        | None ->
            let stopwatch = System.Diagnostics.Stopwatch.StartNew()
            let newCard = dealCard ()
            stopwatch.Stop()
            let updatedCards = newCard :: player.Cards
            savePlayerCards userId updatedCards
            let updatedPlayer = { player with Cards = updatedCards }

            printfn
                "🃏 Player %s hit - got card %s in %dms - Hand: %A (Total: %d)"
                userId
                newCard
                stopwatch.ElapsedMilliseconds
                updatedCards
                (calculateCardValue updatedCards)

            Some updatedPlayer
    | _ -> None

let hitPlayer userId secretKey =
    // First check if user exists and validate secret key
    match getUserKey userId with
    | Some storedKey when storedKey = secretKey ->
        // User exists and key matches, proceed with hit logic
        hitAndUpdate userId
    | _ -> None

let hitHandler: HttpHandler =
    fun next ctx ->
        task {
            let! body = ctx.ReadBodyFromRequestAsync()

            let data =
                JsonConvert.DeserializeObject<{| UserId: string; SecretKey: string |}> body

            if not gameState.RoundActive then
                return! json {| Error = "Round not active" |} next ctx
            else
                let result =
                    match loadPlayerCards data.UserId with
                    | Some existing -> hitPlayer data.UserId data.SecretKey
                    | None -> dealInitialCards data.UserId data.SecretKey
                let remainingCards = getRemainingCards ()

                match result with
                | Some cards ->
                    let response = createPlayerResponse (Some data.UserId) (Some cards.Cards) remainingCards totalCards

                    broadcastMessage
                        {| response with
                            Type = "player_cards" |}

                    return! json response next ctx
                | None -> return! json {| Error = "Cannot deal card" |} next ctx
        }
