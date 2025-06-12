module CardDealerPerformanceTest

open System
open System.Diagnostics
open System.IO
open HighSpeedCardDealer


let getDbSize (dbPath: string) =
    if Directory.Exists(dbPath) then
        let files = Directory.GetFiles(dbPath, "*", SearchOption.AllDirectories)
        let totalBytes = files |> Array.sumBy (fun f -> (FileInfo(f)).Length)
        if totalBytes > 1024L * 1024L * 1024L then
            sprintf "%.2f GB" (float totalBytes / 1024.0 / 1024.0 / 1024.0)
        elif totalBytes > 1024L * 1024L then
            sprintf "%.2f MB" (float totalBytes / 1024.0 / 1024.0)
        else
            sprintf "%.2f KB" (float totalBytes / 1024.0)
    else
        "0 KB"

let runPerformanceTest () =
    let dbPath = "performance_test.lmdb"
    
    // Clean up any existing test database
    if Directory.Exists(dbPath) then
        Directory.Delete(dbPath, true)
    
    printfn "Initializing dealer with 2.08M cards..."
    let dealer = initializeDealer dbPath
    let totalCards = getRemainingCards dealer
    
    printfn "Total cards to deal: %d" totalCards
    printfn "Starting performance test..."
    printfn "Dealing all cards with immediate persistence..."
    
    let stopwatch = Stopwatch.StartNew()
    let mutable cardsDealt = 0
    let reportInterval = 100_000 // Report every 100k cards
    
    try
        while getRemainingCards dealer > 0 do
            let _ = dealCard dealer
            cardsDealt <- cardsDealt + 1
            
            // Progress reporting
            if cardsDealt % reportInterval = 0 then
                let elapsed = stopwatch.Elapsed.TotalSeconds
                let currentRate = float cardsDealt / elapsed
                let remaining = totalCards - cardsDealt
                let eta = float remaining / currentRate
                
                printfn "Dealt: %d/%d cards | Rate: %.0f cards/sec | ETA: %.1f seconds" 
                    cardsDealt totalCards currentRate eta
        
        stopwatch.Stop()
        
        // Final results
        let totalTimeSeconds = stopwatch.Elapsed.TotalSeconds
        let cardsPerSecond = float totalCards / totalTimeSeconds
        
        printfn ""
        printfn "=== PERFORMANCE RESULTS ==="
        printfn "Total cards dealt: %d" totalCards
        printfn "Total time: %.2f seconds" totalTimeSeconds
        printfn "Average rate: %.0f cards per second" cardsPerSecond
        printfn "Target rate: 75,000 cards per second"
        
        if cardsPerSecond >= 75000.0 then
            printfn "✅ TARGET ACHIEVED! (%.1fx faster than required)" (cardsPerSecond / 75000.0)
        else
            printfn "❌ Target not met (%.1fx slower than required)" (75000.0 / cardsPerSecond)
        
        printfn ""
        printfn "Database size: %s" (getDbSize dbPath)
        printfn "Cards verified in DB: %d" (int (getDealtCount dealer))
        
    finally
        dispose dealer
        printfn "Test completed and resources cleaned up."

// Alternative batch performance test
let runBatchPerformanceTest () =
    let dbPath = "batch_test.lmdb"
    
    if Directory.Exists(dbPath) then
        Directory.Delete(dbPath, true)
    
    printfn "Running BATCH performance test..."
    let dealer = initializeDealer dbPath
    let totalCards = getRemainingCards dealer
    let batchSize = 10_0000
    
    let stopwatch = Stopwatch.StartNew()
    let mutable cardsDealt = 0
    
    try
        while getRemainingCards dealer >= batchSize do
            let _ = dealCards dealer batchSize
            cardsDealt <- cardsDealt + batchSize
            
            let elapsed = stopwatch.Elapsed.TotalSeconds
            let currentRate = float cardsDealt / elapsed
            printfn "Batch dealt: %d cards | Rate: %.0f cards/sec" cardsDealt currentRate
        
        // Deal remaining cards
        while getRemainingCards dealer > 0 do
            let _ = dealCard dealer
            cardsDealt <- cardsDealt + 1
        
        stopwatch.Stop()
        
        let totalTimeSeconds = stopwatch.Elapsed.TotalSeconds
        let cardsPerSecond = float cardsDealt / totalTimeSeconds
        
        printfn ""
        printfn "=== BATCH PERFORMANCE RESULTS ==="
        printfn "Batch size: %d cards" batchSize
        printfn "Total rate: %.0f cards per second" cardsPerSecond
        
    finally
        dispose dealer