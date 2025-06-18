open System
open System.Threading
open Microsoft.AspNetCore.Builder
open Microsoft.Extensions.DependencyInjection
open Giraffe
open Saturn
open Newtonsoft.Json

open Socket
open Utils.OptionConverter
open Utils.calculateCardValue

open GameState

open Types
open Dealer
open Player
open Blackjack

open HitHandler
open GetUserCardsHandler
open WebSocketHandler

let totalStartingCards = totalCards
let roundCountdown = 10
let nextRoundWaitTime = 5
let mutable _roundCountdown = roundCountdown
let mutable _nextRoundWaitTime = 0

let playDealerHand providedCards =
    let rec dealerPlay cards =
        let total = calculateCardValue cards

        if total < 17 then
            let newCard = dealCard ()
            dealerPlay (newCard :: cards)
        else
            cards

    dealerPlay providedCards

let startNewRound () =
    printfn "🎲 NEW ROUND STARTING!"

    // Clear the database instead of creating a new environment
    clearBlackjackDatabase ()

    let card1 = dealCard ()
    let card2 = dealCard ()
    let cards = [ card1; card2 ]
    let dealerTotal = calculateCardValue cards
    printfn "🎰 DEALER STARTING HAND: %A (Total: %d)" cards dealerTotal

    let roundEndTime =
        DateTimeOffset.UtcNow.AddSeconds(roundCountdown).ToUnixTimeSeconds()

    gameState <-
        { RoundActive = true
          DealerCards = cards
          DealerTotal = calculateCardValue [ card1; card2 ]
          RoundStartTime = None
          RoundEndTime = Some roundEndTime
          Results = None }

    _roundCountdown <- roundCountdown
    _nextRoundWaitTime <- 0

    broadcastMessage
        {| Type = "new_round"
           RoundEndTime = roundEndTime
           DealerCards = [ card2 ]
           DealerTotal = calculateCardValue [ card2 ] |}

let endRound () =
    printfn "⏰ Round ending! Dealer playing..."

    let dealerFinalCards = playDealerHand gameState.DealerCards
    let dealerTotal = calculateCardValue dealerFinalCards

    printfn "🎰 DEALER FINAL HAND: %A (Total: %d)" dealerFinalCards dealerTotal

    let players = loadAllPlayerCards ()

    let results =
        players
        |> List.map (fun (player: PlayerCards) ->
            let playerTotal = calculateCardValue player.Cards

            let blackjackResult =
                if playerTotal > 21 then Loss
                elif dealerTotal > 21 then Win
                elif playerTotal > dealerTotal then Win
                elif playerTotal = dealerTotal then Push
                else Loss

            let resultText =
                match blackjackResult with
                | Win -> "WIN"
                | Loss -> "LOSS"
                | Push -> "PUSH"

            let result: PlayerCards =
                { UserId = player.UserId
                  Cards = player.Cards
                  Total = playerTotal
                  Result = Some blackjackResult }

            match blackjackResult with
            | Win -> incrementWin player.UserId |> ignore
            | _ -> ()

            printfn "👤 Player %s: %A (Total: %d) - %s" player.UserId player.Cards playerTotal resultText

            result)

    let roundStartTime =
        DateTimeOffset.UtcNow.AddSeconds(nextRoundWaitTime).ToUnixTimeSeconds()

    gameState <-
        { gameState with
            RoundStartTime = Some roundStartTime
            RoundActive = false
            DealerCards = dealerFinalCards
            Results = Some results }

    broadcastMessage
        {| Type = "round_results"
           DealerCards = dealerFinalCards
           DealerTotal = dealerTotal
           RoundStartTime = roundStartTime
           Results = convertPlayerCards (Some results) |}

    _nextRoundWaitTime <- nextRoundWaitTime

let gameTimer =
    new Timer(
        fun _ ->
            try
                if gameState.RoundActive then
                    printfn "⌛ Round active - %d seconds remaining..." _roundCountdown
                    _roundCountdown <- _roundCountdown - 1

                    if _roundCountdown <= 0 then
                        endRound ()
                elif _nextRoundWaitTime > 0 then
                    printfn "🕐 Next round starts in %d seconds..." _nextRoundWaitTime
                    _nextRoundWaitTime <- _nextRoundWaitTime - 1

                    if _nextRoundWaitTime = 0 then
                        startNewRound ()
            with ex ->
                printfn "Timer error: %s" ex.Message
        , null
        , 1000
        , 1000
    )

let webApp =
    router {
        post "/hit" hitHandler
        getf "/cards/%s" getUserCardsHandler
        get "/ws" websocketHandler

        get "/health" (fun _ ctx ->
            ctx.WriteJsonAsync
                {| status = "healthy"
                   timestamp = DateTime.UtcNow |})
    }

JsonConvert.DefaultSettings <-
    fun () ->
        let settings = JsonSerializerSettings()
        settings.Converters.Add(OptionConverter())
        settings

let configureServices (services: IServiceCollection) =
    services.AddCors(fun options ->
        options.AddPolicy(
            "AllowAll",
            fun builder -> builder.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader() |> ignore
        ))
    |> ignore

    services

let app =
    application {
        use_router webApp
        url "http://0.0.0.0:5001"
        use_static "wwwroot"
        service_config (fun services -> configureServices (services))

        app_config (fun app ->
            app.UseCors(fun builder -> builder.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader() |> ignore)
            |> ignore

            app.UseWebSockets())
    }

[<EntryPoint>]
let main args =
    printfn "🎲 Blackjack server starting..."
    startNewRound ()

    // Register cleanup handler
    AppDomain.CurrentDomain.ProcessExit.Add(fun _ ->
        printfn "🛑 Server shutting down, cleaning up resources..."

        try
            gameTimer.Dispose()
            (blackJackRound :> IDisposable).Dispose()
        with ex ->
            printfn "Error during cleanup: %s" ex.Message)

    run app
    0