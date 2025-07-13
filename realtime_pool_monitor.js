const { Connection, PublicKey } = require('@solana/web3.js');
const { LIQUIDITY_STATE_LAYOUT_V4 } = require('@raydium-io/raydium-sdk');

// Real-time pool monitoring using free/standard Solana WebSocket APIs
// No premium subscriptions required - works with any Solana RPC provider
// Configuration - use your existing environment variables
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const RAYDIUM_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const connection = new Connection(SOLANA_RPC, 'confirmed');

class RealTimePoolMonitor {
    constructor(onNewPool) {
        this.onNewPool = onNewPool;
        this.seenTransactions = new Set();
        this.seenPools = new Set();
        this.isMonitoring = false;
    }

    async startMonitoring() {
        if (this.isMonitoring) {
            console.log('⚠️  Real-time monitoring already active');
            return;
        }

        this.isMonitoring = true;
        console.log('🔍 Starting real-time pool monitoring...');

        // Method 1: Monitor transaction logs (recommended for most cases)
        this.setupLogMonitoring();

        // Method 2: Monitor program account changes (more efficient but requires more setup)
        // this.setupAccountChangeMonitoring();
    }

    setupLogMonitoring() {
        console.log('📡 Setting up transaction log monitoring...');
        
        connection.onLogs(
            new PublicKey(RAYDIUM_PROGRAM_ID),
            async (logs) => {
                if (this.seenTransactions.has(logs.signature)) return;
                this.seenTransactions.add(logs.signature);

                // Look for pool initialization
                if (logs.logs.some(log => log.includes('initialize2'))) {
                    console.log('🆕 New pool detected via logs!');
                    console.log('Signature:', logs.signature);
                    
                    try {
                        const poolInfo = await this.extractPoolInfoFromTransaction(logs.signature);
                        if (poolInfo) {
                            this.onNewPool(poolInfo);
                        }
                    } catch (error) {
                        console.error('Error processing new pool:', error);
                    }
                }
            },
            'finalized' // Use 'confirmed' for faster but less certain detection
        );
    }

    setupAccountChangeMonitoring() {
        console.log('📡 Setting up account change monitoring...');
        
        const runTimestamp = Date.now();
        
        connection.onProgramAccountChange(
            new PublicKey(RAYDIUM_PROGRAM_ID),
            async (updatedAccountInfo) => {
                const poolId = updatedAccountInfo.accountId.toString();
                
                if (this.seenPools.has(poolId)) return;
                this.seenPools.add(poolId);
                
                try {
                    const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(
                        updatedAccountInfo.accountInfo.data
                    );
                    
                    const poolOpenTime = parseInt(poolState.poolOpenTime.toString());
                    
                    // Only process pools created after bot started
                    if (poolOpenTime > runTimestamp) {
                        console.log('🆕 New pool detected via account change!');
                        
                        const poolInfo = {
                            address: poolState.baseMint.toString(),
                            poolId: poolId,
                            baseMint: poolState.baseMint.toString(),
                            quoteMint: poolState.quoteMint.toString(),
                            symbol: 'UNKNOWN',
                            name: 'Unknown Token',
                            price: 0,
                            mc: 0,
                            liquidity: 0,
                            lastTradeUnixTime: Math.floor(Date.now() / 1000),
                            detectionMethod: 'account_change'
                        };
                        
                        this.onNewPool(poolInfo);
                    }
                } catch (error) {
                    console.error('Error decoding pool state:', error);
                }
            },
            'confirmed',
            [
                { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
                {
                    memcmp: {
                        offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('quoteMint'),
                        bytes: 'So11111111111111111111111111111111111111112', // SOL
                    },
                },
            ]
        );
    }

    async extractPoolInfoFromTransaction(signature) {
        try {
            const tx = await connection.getParsedTransaction(signature, {
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed'
            });
            
            if (!tx) return null;
            
            const accounts = tx.transaction.message.accountKeys;
            const baseMint = accounts[8]?.pubkey; // Token A
            const quoteMint = accounts[9]?.pubkey; // Token B
            
            if (!baseMint || !quoteMint) return null;
            
            // Try to get more information from the transaction
            const poolId = accounts[4]?.pubkey; // Pool account
            
            return {
                address: baseMint,
                poolId: poolId,
                baseMint: baseMint,
                quoteMint: quoteMint,
                symbol: 'UNKNOWN', // You'll need to fetch this from metadata
                name: 'Unknown Token',
                price: 0, // Calculate from pool reserves
                mc: 0, // Calculate from supply and price
                liquidity: 0, // Calculate from reserves
                lastTradeUnixTime: Math.floor(Date.now() / 1000),
                signature: signature,
                detectionMethod: 'transaction_log'
            };
        } catch (error) {
            console.error('Error extracting pool info:', error);
            return null;
        }
    }

    stopMonitoring() {
        this.isMonitoring = false;
        console.log('🛑 Real-time monitoring stopped');
    }
}



// Integration function for your existing bot
async function integrateRealTimeMonitoring(existingSnipeFunction, existingFilterFunction) {
    const monitor = new RealTimePoolMonitor(async (poolInfo) => {
        console.log('📊 Processing real-time pool detection...');
        console.log('Token:', poolInfo.address);
        console.log('Detection method:', poolInfo.detectionMethod);
        
        // Apply your existing filters
        if (existingFilterFunction && !existingFilterFunction(poolInfo)) {
            console.log('❌ Pool filtered out by existing filters');
            return;
        }
        
        // Enhanced token info (you might want to fetch more details)
        const enhancedPoolInfo = await enhanceTokenInfo(poolInfo);
        
        if (enhancedPoolInfo) {
            console.log('🎯 Pool passes initial checks, attempting snipe...');
            await existingSnipeFunction(enhancedPoolInfo);
        }
    });
    
    await monitor.startMonitoring();
    return monitor;
}

// Helper function to enhance token info
async function enhanceTokenInfo(poolInfo) {
    try {
        // You can add more sophisticated token info fetching here
        // For now, we'll use the basic info and let your existing functions handle it
        return {
            ...poolInfo,
            // Add any additional fields your existing functions expect
            liquidity: poolInfo.liquidity || 0,
            price: poolInfo.price || 0,
            mc: poolInfo.mc || 0
        };
    } catch (error) {
        console.error('Error enhancing token info:', error);
        return poolInfo;
    }
}

// Export for easy integration
module.exports = {
    RealTimePoolMonitor,
    integrateRealTimeMonitoring
};

// Example usage if running this file directly
if (require.main === module) {
    async function example() {
        const monitor = new RealTimePoolMonitor(async (poolInfo) => {
            console.log('🎯 New pool detected!');
            console.log('Address:', poolInfo.address);
            console.log('Base Mint:', poolInfo.baseMint);
            console.log('Quote Mint:', poolInfo.quoteMint);
            console.log('Detection Method:', poolInfo.detectionMethod);
            console.log('---');
        });
        
        await monitor.startMonitoring();
        
        // Keep the script running
        console.log('Monitoring started. Press Ctrl+C to stop.');
        process.on('SIGINT', () => {
            console.log('\nStopping monitor...');
            monitor.stopMonitoring();
            process.exit(0);
        });
    }
    
    example().catch(console.error);
}