module Utils.createPlayerResponse

open Utils.calculateCardValue
open Types

let createPlayerResponse (userId: string option) (cards: Card list option) remainingCards totalCards=
    {| UserId = userId
       Cards = cards
       Total = cards |> Option.map calculateCardValue
       RemainingCards = remainingCards
       TotalStartingCards = totalCards |}