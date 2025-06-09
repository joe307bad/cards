namespace ShoeManager
// Blackjack Pool System - Clean Implementation with SQLite Persistence

module BlackjackPools =
    
    open System.Threading
    open Microsoft.Data.Sqlite
    open System.IO
    
    // =================================================================
    // TYPES
    // =================================================================
    
    type CardSection = int[]  // 5 cards per section
    
    type Pool = {
        PoolId: int
        Sections: CardSection[]
        NextIndex: int32 ref
        TotalSections: int
    }
    
    type PoolSystem = {
        Pools: Pool[]
        PoolCount: int
        MasterSeed: int
        TotalCards: int
        CreatedAt: System.DateTime
    }
    
    // =================================================================
    // PERSISTENCE LAYER
    // =================================================================
    
    let private dbPath = "blackjack_state.sqlite"
    
    /// Initialize SQLite database with required tables
    let private initializeDatabase() =
        use connection = new SqliteConnection($"Data Source={dbPath}")
        connection.Open()
        
        let createTablesSql = """
            CREATE TABLE IF NOT EXISTS game_state (
                id INTEGER PRIMARY KEY,
                master_seed INTEGER NOT NULL,
                total_cards INTEGER NOT NULL,
                pool_count INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                saved_at TEXT NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS pool_states (
                pool_id INTEGER PRIMARY KEY,
                next_index INTEGER NOT NULL
            );
        """
        
        use cmd = new SqliteCommand(createTablesSql, connection)
        cmd.ExecuteNonQuery() |> ignore
    
    /// Save the current state to SQLite
    let saveState (poolSystem: PoolSystem) : unit =
        initializeDatabase()
        
        use connection = new SqliteConnection($"Data Source={dbPath}")
        connection.Open()
        use transaction = connection.BeginTransaction()
        
        try
            // Save game state
            let gameStateSql = """
                INSERT OR REPLACE INTO game_state (id, master_seed, total_cards, pool_count, created_at, saved_at)
                VALUES (1, @masterSeed, @totalCards, @poolCount, @createdAt, @savedAt)
            """
            
            use gameStateCmd = new SqliteCommand(gameStateSql, connection)
            gameStateCmd.Parameters.AddWithValue("@masterSeed", poolSystem.MasterSeed) |> ignore
            gameStateCmd.Parameters.AddWithValue("@totalCards", poolSystem.TotalCards) |> ignore
            gameStateCmd.Parameters.AddWithValue("@poolCount", poolSystem.PoolCount) |> ignore
            gameStateCmd.Parameters.AddWithValue("@createdAt", poolSystem.CreatedAt.ToString("yyyy-MM-dd HH:mm:ss")) |> ignore
            gameStateCmd.Parameters.AddWithValue("@savedAt", System.DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss")) |> ignore
            gameStateCmd.ExecuteNonQuery() |> ignore
            
            // Clear existing pool states
            let clearPoolsSql = "DELETE FROM pool_states"
            use clearCmd = new SqliteCommand(clearPoolsSql, connection)
            clearCmd.ExecuteNonQuery() |> ignore
            
            // Save all pool states
            let poolStateSql = "INSERT INTO pool_states (pool_id, next_index) VALUES (@poolId, @nextIndex)"
            
            for pool in poolSystem.Pools do
                use poolCmd = new SqliteCommand(poolStateSql, connection)
                poolCmd.Parameters.AddWithValue("@poolId", pool.PoolId) |> ignore
                poolCmd.Parameters.AddWithValue("@nextIndex", !pool.NextIndex) |> ignore
                poolCmd.ExecuteNonQuery() |> ignore
            
            transaction.Commit()
            printfn "✅ Game state saved to %s" dbPath
            
        with
        | ex -> 
            transaction.Rollback()
            printfn "❌ Failed to save state: %s" ex.Message
            reraise()
    
    /// Load state from SQLite if it exists
    let private loadStateIfExists() : (int * int * int * System.DateTime * int[]) option =
        if not (File.Exists(dbPath)) then
            printfn "📁 No existing state file found"
            None
        else
            try
                use connection = new SqliteConnection($"Data Source={dbPath}")
                connection.Open()
                
                // Load game state
                let gameStateSql = "SELECT master_seed, total_cards, pool_count, created_at FROM game_state WHERE id = 1"
                use gameStateCmd = new SqliteCommand(gameStateSql, connection)
                use reader = gameStateCmd.ExecuteReader()
                
                if reader.Read() then
                    let masterSeed = reader.GetInt32 0
                    let totalCards = reader.GetInt32 1
                    let poolCount = reader.GetInt32 2
                    let createdAt = System.DateTime.Parse(reader.GetString 3)
                    reader.Close()
                    
                    // Load pool states
                    let poolStatesSql = "SELECT pool_id, next_index FROM pool_states ORDER BY pool_id"
                    use poolStatesCmd = new SqliteCommand(poolStatesSql, connection)
                    use poolReader = poolStatesCmd.ExecuteReader()
                    
                    let poolStates = Array.zeroCreate poolCount
                    while poolReader.Read() do
                        let poolId = poolReader.GetInt32(0)
                        let nextIndex = poolReader.GetInt32(1)
                        if poolId < poolCount then
                            poolStates.[poolId] <- nextIndex
                    
                    printfn "📂 Loaded existing state (Seed: %d, Created: %s)" masterSeed (createdAt.ToString("yyyy-MM-dd HH:mm:ss"))
                    Some (masterSeed, totalCards, poolCount, createdAt, poolStates)
                else
                    None
            with
            | ex ->
                printfn "⚠️ Failed to load existing state: %s" ex.Message
                None
    
    // =================================================================
    // CORE FUNCTIONS
    // =================================================================
    let private generateShuffledShoe (seed: int) (totalCards: int) : int[] =
        let rng = System.Random(seed)
        
        // Create cards (1000 decks worth, cycling through 1-52)
        let cards = Array.init totalCards (fun i -> (i % 52) + 1)
        
        // Fisher-Yates shuffle
        let cardCount = cards.Length
        for i = cardCount - 1 downto 1 do
            let j = rng.Next(i + 1)
            let temp = cards.[i]
            cards.[i] <- cards.[j]
            cards.[j] <- temp
        
        cards
    
    /// Split cards into sections of specified size
    let private splitIntoSections (cards: int[]) (sectionSize: int) : CardSection[] =
        let totalSections = cards.Length / sectionSize
        Array.init totalSections (fun i ->
            let startIndex = i * sectionSize
            cards.[startIndex .. startIndex + sectionSize - 1]
        )
    
    /// Group sections into pools
    let private groupIntoPools (sections: CardSection[]) (poolCount: int) : Pool[] =
        let sectionsPerPool = sections.Length / poolCount
        
        Array.init poolCount (fun poolId ->
            let startIndex = poolId * sectionsPerPool
            let endIndex = startIndex + sectionsPerPool - 1
            let poolSections = sections.[startIndex .. endIndex]
            
            {
                PoolId = poolId
                Sections = poolSections
                NextIndex = ref 0
                TotalSections = poolSections.Length
            }
        )
    
    // =================================================================
    // PUBLIC API
    // =================================================================
    
    /// Initialize the pool system on boot (with persistence support)
    let initialize (seed: int option) : PoolSystem =
        let sw = System.Diagnostics.Stopwatch.StartNew()
        
        printfn "🚀 Initializing Blackjack Pool System..."
        
        // Try to load existing state first
        match loadStateIfExists() with
        | Some (savedSeed, savedTotalCards, savedPoolCount, savedCreatedAt, savedPoolStates) ->
            // Restore from saved state
            printfn "🔄 Restoring from saved state..."
            let totalCards = savedTotalCards
            let sectionSize = 5
            let poolCount = savedPoolCount
            
            // Regenerate the same shuffled shoe using saved seed
            let shuffledShoe = generateShuffledShoe savedSeed totalCards
            let sections = splitIntoSections shuffledShoe sectionSize
            let pools = groupIntoPools sections poolCount
            
            // Restore pool positions
            for i in 0 .. poolCount - 1 do
                if i < savedPoolStates.Length then
                    pools.[i].NextIndex := savedPoolStates.[i]
            
            sw.Stop()
            
            let sectionsPerPool = sections.Length / poolCount
            
            printfn "✅ Restored from saved state!"
            printfn "   Restoration time: %A" sw.Elapsed
            printfn "   Original seed: %d" savedSeed
            printfn "   Created: %s" (savedCreatedAt.ToString("yyyy-MM-dd HH:mm:ss"))
            printfn "   Sections per pool: %s" (sectionsPerPool.ToString("N0"))
            
            {
                Pools = pools
                PoolCount = poolCount
                MasterSeed = savedSeed
                TotalCards = totalCards
                CreatedAt = savedCreatedAt
            }
            
        | None ->
            // Create fresh system
            let actualSeed = defaultArg seed (System.Random().Next())
            let totalCards = 52_000
            let sectionSize = 5
            let poolCount = 500
            
            printfn "   Seed: %d" actualSeed
            printfn "   Total cards: %s" (totalCards.ToString("N0"))
            printfn "   Section size: %d cards" sectionSize
            printfn "   Pool count: %d" poolCount
            
            // Step 1: Generate shuffled shoe
            let shuffledShoe = generateShuffledShoe actualSeed totalCards
            printfn "✅ Generated shuffled shoe: %A" sw.Elapsed
            
            // Step 2: Split into sections of 5
            let sections = splitIntoSections shuffledShoe sectionSize
            printfn "✅ Split into %s sections of %d cards: %A" (sections.Length.ToString("N0")) sectionSize sw.Elapsed
            
            // Step 3: Group into 500 pools
            let pools = groupIntoPools sections poolCount
            printfn "✅ Grouped into %d pools: %A" poolCount sw.Elapsed
            
            sw.Stop()
            
            let sectionsPerPool = sections.Length / poolCount
            
            printfn "🎯 Fresh Pool System Ready!"
            printfn "   Total initialization time: %A" sw.Elapsed
            printfn "   Sections per pool: %s" (sectionsPerPool.ToString("N0"))
            printfn "   Memory usage: ~%d KB" (totalCards * 4 / 1024)
            
            {
                Pools = pools
                PoolCount = poolCount
                MasterSeed = actualSeed
                TotalCards = totalCards
                CreatedAt = System.DateTime.UtcNow
            }
    
    /// Get the next available section from a specific pool
    let getNextSection (poolSystem: PoolSystem) (poolId: int) : CardSection option =
        if poolId >= 0 && poolId < poolSystem.PoolCount then
            let pool = poolSystem.Pools.[poolId]
            let currentIndex = Interlocked.Increment(pool.NextIndex) - 1
            
            if currentIndex < pool.TotalSections then
                Some pool.Sections.[currentIndex]
            else
                None  // Pool exhausted
        else
            None  // Invalid pool ID
    
    /// Get the next available section from a random pool (load balancing)
    let getNextSectionFromRandomPool (poolSystem: PoolSystem) : (CardSection * int) option =
        let rng = new System.Threading.ThreadLocal<System.Random>(fun () -> 
            new System.Random(System.Environment.TickCount + System.Threading.Thread.CurrentThread.ManagedThreadId))
        
        let startPool = rng.Value.Next(poolSystem.PoolCount)
        let mutable attempts = 0
        let maxAttempts = min poolSystem.PoolCount 10
        
        let rec tryPools poolIndex =
            if attempts >= maxAttempts then
                None
            else
                let currentPool = (poolIndex + attempts) % poolSystem.PoolCount
                attempts <- attempts + 1
                
                match getNextSection poolSystem currentPool with
                | Some section -> Some (section, currentPool)
                | None -> tryPools poolIndex
        
        tryPools startPool
    
    /// Get pool statistics
    let getPoolStats (poolSystem: PoolSystem) (poolId: int) : (int * int * int) option =
        if poolId >= 0 && poolId < poolSystem.PoolCount then
            let pool = poolSystem.Pools.[poolId]
            let sectionsDealt = !pool.NextIndex
            let sectionsRemaining = pool.TotalSections - sectionsDealt
            Some (sectionsDealt, sectionsRemaining, pool.TotalSections)
        else
            None
    
    /// Get system-wide statistics
    let getSystemStats (poolSystem: PoolSystem) : {| TotalSectionsDealt: int; TotalSectionsRemaining: int; PoolsExhausted: int |} =
        let mutable totalDealt = 0
        let mutable totalRemaining = 0
        let mutable poolsExhausted = 0
        
        for pool in poolSystem.Pools do
            let dealt = !pool.NextIndex
            let remaining = pool.TotalSections - dealt
            
            totalDealt <- totalDealt + dealt
            totalRemaining <- totalRemaining + remaining
            
            if remaining = 0 then
                poolsExhausted <- poolsExhausted + 1
        
        {| 
            TotalSectionsDealt = totalDealt
            TotalSectionsRemaining = totalRemaining  
            PoolsExhausted = poolsExhausted
        |}
    
    /// Check if system needs reset (all pools exhausted)
    let needsReset (poolSystem: PoolSystem) : bool =
        let stats = getSystemStats poolSystem
        stats.PoolsExhausted = poolSystem.PoolCount
    
    /// Display system information
    let displaySystemInfo (poolSystem: PoolSystem) : unit =
        let stats = getSystemStats poolSystem
        
        printfn "🎯 Blackjack Pool System Status"
        printfn "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        printfn "Created: %s" (poolSystem.CreatedAt.ToString("yyyy-MM-dd HH:mm:ss"))
        printfn "Master Seed: %d" poolSystem.MasterSeed
        printfn "Total Cards: %s" (poolSystem.TotalCards.ToString("N0"))
        printfn "Total Pools: %d" poolSystem.PoolCount
        printfn "Persistence: %s" (if File.Exists(dbPath) then "✅ SQLite file exists" else "⚠️ No saved state")
        printfn ""
        printfn "📊 Current Statistics:"
        printfn "   Sections Dealt: %s" (stats.TotalSectionsDealt.ToString("N0"))
        printfn "   Sections Remaining: %s" (stats.TotalSectionsRemaining.ToString("N0"))
        printfn "   Pools Exhausted: %d/%d" stats.PoolsExhausted poolSystem.PoolCount
        printfn "   System Status: %s" (if needsReset poolSystem then "⚠️  NEEDS RESET" else "✅ ACTIVE")

// =================================================================
// USAGE EXAMPLES
// =================================================================

module Examples =
    
    let runBasicExample() =
        printfn "=== BASIC USAGE EXAMPLE ==="
        
        // Initialize system (happens once on boot)
        let system = BlackjackPools.initialize None
        
        // Get a section from specific pool
        match BlackjackPools.getNextSection system 0 with
        | Some cards -> printfn "Pool 0, Section 1: %A" cards
        | None -> printfn "Pool 0 exhausted"
        
        // Get another section from same pool
        match BlackjackPools.getNextSection system 0 with
        | Some cards -> printfn "Pool 0, Section 2: %A" cards
        | None -> printfn "Pool 0 exhausted"
        
        // Get section from different pool
        match BlackjackPools.getNextSection system 1 with
        | Some cards -> printfn "Pool 1, Section 1: %A" cards
        | None -> printfn "Pool 1 exhausted"
        
        // Get section from random pool (load balancing)
        match BlackjackPools.getNextSectionFromRandomPool system with
        | Some (cards, poolId) -> printfn "Random pool %d: %A" poolId cards
        | None -> printfn "All pools exhausted"
        
        // Show system stats
        BlackjackPools.displaySystemInfo system
    
    let runPerformanceTest() =
        printfn "\n=== PERFORMANCE TEST ==="
        
        let system = BlackjackPools.initialize (Some 12345)
        let iterations = 100_000
        
        printfn "Testing %s section retrievals..." (iterations.ToString("N0"))
        
        let sw = System.Diagnostics.Stopwatch.StartNew()
        let mutable successCount = 0
        
        for i in 1 .. iterations do
            match BlackjackPools.getNextSectionFromRandomPool system with
            | Some _ -> successCount <- successCount + 1
            | None -> ()
        
        sw.Stop()
        
        let avgNanoseconds = sw.Elapsed.TotalNanoseconds / float iterations
        let throughput = float iterations / sw.Elapsed.TotalSeconds
        
        printfn "✅ Performance Results:"
        printfn "   Successful retrievals: %s/%s" (successCount.ToString("N0")) (iterations.ToString("N0"))
        printfn "   Average time per retrieval: %.2f nanoseconds" avgNanoseconds
        printfn "   Throughput: %s retrievals/second" (throughput.ToString("N0"))
        
        BlackjackPools.displaySystemInfo system
    
    let runPersistenceExample() =
        printfn "\n=== PERSISTENCE EXAMPLE ==="
        
        // First run - create fresh system
        printfn "--- First Run (Fresh System) ---"
        let system1 = BlackjackPools.initialize (Some 99999)
        
        // Deal some cards to change state
        for i in 1 .. 5 do
            match BlackjackPools.getNextSectionFromRandomPool system1 with
            | Some (cards, poolId) -> printfn "Dealt from Pool %d: %A" poolId cards
            | None -> printfn "No cards available"
        
        // Save state
        BlackjackPools.saveState system1
        BlackjackPools.displaySystemInfo system1
        
        printfn "\n--- Second Run (Restored System) ---"
        // Second run - should restore from saved state
        let system2 = BlackjackPools.initialize None  // Seed ignored - uses saved state
        
        // Deal more cards - should continue from where we left off
        for i in 1 .. 3 do
            match BlackjackPools.getNextSectionFromRandomPool system2 with
            | Some (cards, poolId) -> printfn "Dealt from Pool %d: %A" poolId cards
            | None -> printfn "No cards available"
        
        BlackjackPools.displaySystemInfo system2
        
        printfn "\n✅ Persistence test complete!"
        printfn "💾 State file: blackjack_state.sqlite"
        printfn "\n=== CONCURRENCY TEST ==="
        
        let system = BlackjackPools.initialize (Some 54321)
        let threadCount = 8
        let retrievalsPerThread = 10_000
        
        printfn "Testing %d threads × %s retrievals = %s total..." 
            threadCount 
            (retrievalsPerThread.ToString("N0")) 
            ((threadCount * retrievalsPerThread).ToString("N0"))
        
        let sw = System.Diagnostics.Stopwatch.StartNew()
        
        let tasks = 
            [| 1 .. threadCount |]
            |> Array.map (fun threadId ->
                System.Threading.Tasks.Task.Run(fun () ->
                    let mutable localSuccess = 0
                    for i in 1 .. retrievalsPerThread do
                        match BlackjackPools.getNextSectionFromRandomPool system with
                        | Some _ -> localSuccess <- localSuccess + 1
                        | None -> ()
                    localSuccess
                ))
        
        // Convert Task<int>[] to Task[] using upcast
        let taskArray = tasks |> Array.map (fun t -> t :> System.Threading.Tasks.Task)
        System.Threading.Tasks.Task.WaitAll(taskArray)
        sw.Stop()
        
        let totalSuccess = tasks |> Array.sumBy (fun task -> task.Result)
        let totalRequests = threadCount * retrievalsPerThread
        let avgNanoseconds = sw.Elapsed.TotalNanoseconds / float totalRequests
        let throughput = float totalRequests / sw.Elapsed.TotalSeconds
        
        printfn "✅ Concurrency Results:"
        printfn "   Successful retrievals: %s/%s" (totalSuccess.ToString("N0")) (totalRequests.ToString("N0"))
        printfn "   Average time per retrieval: %.2f nanoseconds" avgNanoseconds
        printfn "   Throughput: %s retrievals/second" (throughput.ToString("N0"))
        printfn "   Threads: %d" threadCount
        
        BlackjackPools.displaySystemInfo system

// Run examples

module Main =

    let runAllExamples() =
        Examples.runBasicExample()
        Examples.runPerformanceTest()