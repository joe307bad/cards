module GetUserCardsHandler

open Giraffe
open Saturn

open Utils.createPlayerResponse
open Utils.calculateCardValue
open Utils.isBlackjack
open Types
open Blackjack
open GameState
open Dealer
open Player

type LoadRoundData =
    { UserId: string
      Cards: string array
      Total: int
      RemainingCards: int
      TotalStartingCards: int
      CurrentlyConnectedPlayers:
          array<
              {| Cards: string list
                 Total: int
                 UserId: string |}
           >
      FirstDealerCard: string
      RoundEndTime: int64
      DealerTotal: int
      Wins: int
      IsBlackjack: bool }

type LoadResultsData =
    { UserId: string
      Cards: string array
      Total: int
      RemainingCards: int
      TotalStartingCards: int
      CurrentlyConnectedPlayers:
          array<
              {| Cards: string list
                 Total: int
                 UserId: string |}
           >
      AllDealerCards: string array
      DealerTotal: int
      PlayerResults:
          array<
              {| Cards: string list
                 Total: int
                 UserId: string
                 Result: string |}
           >
      RoundStartTime: int64
      Wins: int
      IsBlackJack: bool }

type GameResponse =
    | LOAD_ROUND of LoadRoundData
    | LOAD_RESULTS of LoadResultsData

let convertPlayerCards
    (playerCardsOpt: option<list<PlayerCards>>)
    : array<
          {| Cards: string list
             Total: int
             UserId: string
             Result: string |}
       >
    =
    match playerCardsOpt with
    | None -> [||]
    | Some playerCardsList ->
        playerCardsList
        |> List.map (fun pc ->
            {| Cards = pc.Cards
               Total = pc.Total
               UserId = pc.UserId
               Result =
                match pc.Result with
                | Some result -> result.ToString()
                | None -> null |})
        |> List.toArray


let getUserCardsHandler userId : HttpHandler =
    fun next ctx ->
        task {
            let playerCards = loadPlayerCards userId

            let remainingCards = getRemainingCards ()

            let response =
                createPlayerResponse (Some userId) (playerCards |> Option.map (fun pc -> pc.Cards )) remainingCards totalCards

            let wins: int = 
                    response.UserId
                    |> Option.bind getUserData
                    |> Option.map (fun x -> x.Wins)
                    |> Option.defaultValue 0

            let players =
                loadAllPlayerCards ()
                |> List.map (fun (player: PlayerCards) ->
                    {| Cards = player.Cards
                       UserId = player.UserId
                       Total = calculateCardValue player.Cards |})
                |> List.toArray

            let commonFields =
                {| UserId = response.UserId |> Option.defaultValue null
                   Cards = response.Cards |> Option.map Array.ofList |> Option.defaultValue null
                   Total = response.Total |> Option.defaultValue 0
                   RemainingCards = response.RemainingCards
                   TotalStartingCards = response.TotalStartingCards
                   DealerTotal = gameState.DealerTotal
                   IsBlackjack = isBlackjack (response.Cards |> Option.defaultValue List.empty) |}

            let gameResponse =
                if gameState.RoundActive then
                    LOAD_ROUND
                        { UserId = commonFields.UserId
                          Cards = commonFields.Cards
                          Total = commonFields.Total
                          RemainingCards = commonFields.RemainingCards
                          TotalStartingCards = commonFields.TotalStartingCards
                          CurrentlyConnectedPlayers = players
                          Wins = wins
                          IsBlackjack = commonFields.IsBlackjack

                          DealerTotal =
                            if gameState.DealerCards.IsEmpty then
                                0
                            else
                                calculateCardValue [ (List.last gameState.DealerCards) ]
                          FirstDealerCard =
                            if gameState.DealerCards.IsEmpty then
                                null
                            else
                                List.last gameState.DealerCards
                          RoundEndTime = gameState.RoundEndTime |> Option.defaultValue 0L }
                else
                    LOAD_RESULTS
                        { UserId = commonFields.UserId
                          Cards = commonFields.Cards
                          Total = commonFields.Total
                          RemainingCards = commonFields.RemainingCards
                          TotalStartingCards = commonFields.TotalStartingCards
                          CurrentlyConnectedPlayers = players
                          DealerTotal = commonFields.DealerTotal
                          Wins = wins
                          IsBlackJack = commonFields.IsBlackjack

                          AllDealerCards = gameState.DealerCards |> List.toArray
                          PlayerResults = convertPlayerCards gameState.Results
                          RoundStartTime = gameState.RoundStartTime |> Option.defaultValue 0L }

            return! json gameResponse next ctx
        }
