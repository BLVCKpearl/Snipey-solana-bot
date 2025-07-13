# Real-Time Pool Detection for Solana Sniping Bots

## Current Problem
Your current implementation uses Birdeye API polling every 10 seconds, which introduces significant latency for sniping opportunities. This guide covers multiple real-time approaches to detect new pools as they're created.

## Solution Overview

All methods below use **free** APIs and standard protocols - no premium subscriptions required!

### 1. WebSocket-Based Monitoring (Recommended)
Replace polling with standard Solana WebSocket connections for real-time data streaming.

### 2. Raydium Program Log Monitoring
Monitor Raydium program logs directly for new pool creation events using standard RPC methods.

### 3. Third-Party Real-Time APIs
Leverage free services specifically designed for real-time pool detection.

---

## Method 1: Raydium Program Log Monitoring

### Implementation A: Using `onLogs` (Most Common)

```javascript
const { Connection, PublicKey } = require('@solana/web3.js');

const RAYDIUM_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const connection = new Connection('YOUR_RPC_ENDPOINT');

async function monitorRaydiumPools() {
    console.log('🔍 Monitoring Raydium for new pools...');
    
    const seenTransactions = new Set();
    
    connection.onLogs(
        new PublicKey(RAYDIUM_PROGRAM_ID),
        async (logs) => {
            if (seenTransactions.has(logs.signature)) return;
            seenTransactions.add(logs.signature);
            
            // Look for pool initialization
            if (logs.logs.some(log => log.includes('initialize2'))) {
                console.log('🆕 New pool detected!');
                console.log('Signature:', logs.signature);
                
                // Fetch pool details
                const poolInfo = await extractPoolInfo(logs.signature);
                if (poolInfo) {
                    console.log('Pool:', poolInfo);
                    // Your sniping logic here
                }
            }
        },
        'finalized'
    );
}

async function extractPoolInfo(signature) {
    try {
        const tx = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        });
        
        if (!tx) return null;
        
        const accounts = tx.transaction.message.accountKeys;
        const tokenAAccount = accounts[8]?.pubkey; // Token A
        const tokenBAccount = accounts[9]?.pubkey; // Token B
        
        return {
            signature,
            tokenA: tokenAAccount,
            tokenB: tokenBAccount,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error extracting pool info:', error);
        return null;
    }
}

monitorRaydiumPools();
```

### Implementation B: Using `onProgramAccountChange` (More Efficient)

```javascript
const { Connection, PublicKey } = require('@solana/web3.js');
const { LIQUIDITY_STATE_LAYOUT_V4 } = require('@raydium-io/raydium-sdk');

const RAYDIUM_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const connection = new Connection('YOUR_RPC_ENDPOINT');

async function monitorWithAccountChange() {
    console.log('🔍 Monitoring with onProgramAccountChange...');
    
    const runTimestamp = Date.now();
    const seenPools = new Set();
    
    connection.onProgramAccountChange(
        new PublicKey(RAYDIUM_PROGRAM_ID),
        async (updatedAccountInfo) => {
            const poolId = updatedAccountInfo.accountId.toString();
            
            if (seenPools.has(poolId)) return;
            seenPools.add(poolId);
            
            try {
                const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(
                    updatedAccountInfo.accountInfo.data
                );
                
                const poolOpenTime = parseInt(poolState.poolOpenTime.toString());
                
                // Only process pools created after bot started
                if (poolOpenTime > runTimestamp) {
                    console.log('🆕 New pool detected via account change!');
                    console.log('Pool ID:', poolId);
                    console.log('Base Mint:', poolState.baseMint.toString());
                    console.log('Quote Mint:', poolState.quoteMint.toString());
                    
                    // Your sniping logic here
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

monitorWithAccountChange();
```

---

## Method 2: bloXroute Real-Time Streams

### New Raydium Pools Stream

```javascript
const WebSocket = require('ws');

function setupBloXrouteStream() {
    const ws = new WebSocket('wss://uk.solana.dex.blxrbdn.com/ws', {
        headers: {
            'Authorization': 'YOUR_BLOXROUTE_AUTH_HEADER'
        }
    });
    
    const subscribeRequest = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "subscribe",
        "params": ["GetNewRaydiumPoolsStream", {"includeCPMM": true}]
    };
    
    ws.on('open', () => {
        console.log('🔗 bloXroute WebSocket connected');
        ws.send(JSON.stringify(subscribeRequest));
    });
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            
            if (message.method === 'subscribe' && message.params?.result) {
                const poolData = message.params.result.pool;
                
                console.log('🆕 New pool detected via bloXroute!');
                console.log('Pool Address:', poolData.poolAddress);
                console.log('Token 1:', poolData.token1MintAddress);
                console.log('Token 2:', poolData.token2MintAddress);
                console.log('Reserves 1:', poolData.token1Reserves);
                console.log('Reserves 2:', poolData.token2Reserves);
                
                // Your sniping logic here
            }
        } catch (error) {
            console.error('bloXroute message error:', error);
        }
    });
}

setupBloXrouteStream();
```

---

## Method 3: PumpPortal for Pump.fun Tokens

```javascript
const WebSocket = require('ws');

function setupPumpPortalStream() {
    const ws = new WebSocket("wss://pumpportal.fun/api/data");
    
    ws.on("open", () => {
        console.log('🔗 PumpPortal WebSocket connected');
        
        const payload = {
            method: "subscribeNewToken",
        };
        ws.send(JSON.stringify(payload));
    });
    
    ws.on("message", (data) => {
        try {
            const tokenData = JSON.parse(data);
            
            if (tokenData.mint) {
                console.log('🆕 New Pump.fun token detected!');
                console.log('Token:', tokenData.mint);
                console.log('Name:', tokenData.name);
                console.log('Symbol:', tokenData.symbol);
                
                // Your sniping logic here
            }
        } catch (error) {
            console.error('PumpPortal message error:', error);
        }
    });
}

setupPumpPortalStream();
```

---

## Integration with Your Current Bot

### Modified Implementation for Your Bot

```javascript
// Add to your existing sniper_birdeye.js

const { Connection, PublicKey } = require('@solana/web3.js');

// Add WebSocket monitoring alongside your existing Birdeye polling
async function setupRealTimeMonitoring() {
    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const seenTransactions = new Set();
    
    console.log('🔍 Starting real-time pool monitoring...');
    
    connection.onLogs(
        new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'),
        async (logs) => {
            if (seenTransactions.has(logs.signature)) return;
            seenTransactions.add(logs.signature);
            
            if (logs.logs.some(log => log.includes('initialize2'))) {
                console.log('🆕 Real-time pool detected!');
                
                // Extract pool info
                const poolInfo = await extractPoolInfoFromLogs(logs.signature);
                if (poolInfo && passesSnipeFilters(poolInfo)) {
                    console.log('🎯 Pool passes filters, attempting snipe...');
                    await snipeToken(poolInfo);
                }
            }
        },
        'finalized'
    );
}

async function extractPoolInfoFromLogs(signature) {
    try {
        const tx = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        });
        
        if (!tx) return null;
        
        const accounts = tx.transaction.message.accountKeys;
        const baseMint = accounts[8]?.pubkey;
        const quoteMint = accounts[9]?.pubkey;
        
        // Create token object compatible with your existing functions
        return {
            address: baseMint,
            symbol: 'UNKNOWN', // You'll need to fetch this
            name: 'Unknown Token',
            price: 0, // Calculate from pool reserves
            mc: 0, // Calculate from supply and price
            liquidity: 0, // Calculate from reserves
            lastTradeUnixTime: Math.floor(Date.now() / 1000),
            signature: signature
        };
    } catch (error) {
        console.error('Error extracting pool info:', error);
        return null;
    }
}

// Add to your startMonitoring function
async function startMonitoring() {
    // Your existing Birdeye monitoring
    setInterval(fetchAndAnalyzeTokens, MONITOR_INTERVAL);
    
    // Add real-time monitoring
    await setupRealTimeMonitoring();
    
    console.log('🚀 Both polling and real-time monitoring active!');
}
```

---

## Performance Comparison

| Method | Latency | Cost | Complexity | Recommended For |
|--------|---------|------|------------|----------------|
| Birdeye Polling | 10s+ | Low | Low | Testing |
| WebSocket onLogs | <1s | Low | Medium | Most bots |
| bloXroute | <200ms | Medium | Low | Commercial |
| PumpPortal | <1s | Free | Low | Pump.fun tokens |

---

## Next Steps

1. **Immediate**: Implement WebSocket monitoring using Method 1
2. **Short-term**: Add bloXroute for faster detection if needed
3. **Long-term**: Optimize filters and add multiple monitoring sources

## Additional Dependencies

Add these to your package.json:
```json
{
  "dependencies": {
    "ws": "^8.14.2",
    "@raydium-io/raydium-sdk": "^1.3.1-beta.58"
  }
}
```

---

## Important Notes

- **RPC Provider**: Use a reliable RPC provider (QuickNode, Alchemy, or your own node) for best performance
- **Rate Limits**: WebSockets have connection limits, plan accordingly
- **Reconnection**: Implement robust reconnection logic
- **Error Handling**: WebSockets can disconnect, handle gracefully
- **Filtering**: Use proper filters to reduce noise and improve performance
- **Multiple Sources**: Consider combining multiple detection methods for redundancy

## Resources

- [Solana WebSocket Documentation](https://docs.solana.com/api/websocket)
- [Raydium SDK Documentation](https://github.com/raydium-io/raydium-sdk)
- [bloXroute Solana API](https://docs.bloxroute.com/solana)
- [PumpPortal Documentation](https://docs.pumpportal.fun/)