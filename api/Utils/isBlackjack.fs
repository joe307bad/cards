module Utils.isBlackjack

open Types

let isBlackjack (cards: Card list) : bool =

    let parseCard (card: Card) =
        if card.StartsWith("A") then "A"
        elif card.StartsWith("K") || card.StartsWith("Q") || card.StartsWith("J") || card.StartsWith("10") then "10"
        else card.Substring(0, 1)
    
    match cards with
    | [card1; card2] ->
        let rank1 = parseCard card1
        let rank2 = parseCard card2
        (rank1 = "A" && rank2 = "10") || (rank1 = "10" && rank2 = "A")
    | _ -> false