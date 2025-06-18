module Utils.calculateCardValue

open Types

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
