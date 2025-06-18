module WebSocketHandler

open Giraffe
open Socket
open System.Net.WebSockets
open System
open System.Threading
open Newtonsoft.Json

let websocketHandler: HttpHandler =
    fun next ctx ->
        task {
            if ctx.WebSockets.IsWebSocketRequest then
                let! webSocket = ctx.WebSockets.AcceptWebSocketAsync()
                webSockets.Add webSocket

                let buffer = Array.zeroCreate 4096

                try
                    while webSocket.State = WebSocketState.Open do
                        let! result = webSocket.ReceiveAsync(ArraySegment buffer, CancellationToken.None)

                        if result.MessageType = WebSocketMessageType.Text then
                            let message = System.Text.Encoding.UTF8.GetString(buffer, 0, result.Count)

                            try
                                let data = JsonConvert.DeserializeObject<{| UserId: string |}> message
                                webSocketUsers.TryAdd(webSocket, data.UserId) |> ignore
                            with _ ->
                                ()
                        elif result.MessageType = WebSocketMessageType.Close then
                            do! webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None)
                with _ ->
                    ()

                webSocketUsers.TryRemove(webSocket) |> ignore

                return Some ctx
            else
                return! next ctx
        }