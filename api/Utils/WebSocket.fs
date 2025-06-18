module Socket

open System.Collections.Concurrent
open System.Net.WebSockets
open Newtonsoft.Json
open System
open System.Threading

let webSocketUsers = new ConcurrentDictionary<WebSocket, string>()

let webSockets: ConcurrentBag<WebSocket> = new ConcurrentBag<WebSocket>()

let broadcastMessage message =
    let data = System.Text.Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(message))

    webSockets
    |> Seq.filter (fun ws -> ws.State = WebSocketState.Open)
    |> Seq.iter (fun ws ->
        try
            ws.SendAsync(ArraySegment data, WebSocketMessageType.Text, true, CancellationToken.None)
            |> ignore
        with _ ->
            ())
