require('dotenv').config();
const fetch = require('node-fetch');
const { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');

// Import real-time monitoring
const { RealTimePoolMonitor } = require('./realtime_pool_monitor');

const fs = require('fs');
const path = require('path');

// Configuration
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;
const PRIVATE_KEY_BASE58 = process.env.PRIVATE_KEY_BASE58;
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const API_URL = 'https://public-api.birdeye.so/defi/tokenlist';
const NEW_LISTINGS_URL = 'https://public-api.birdeye.so/defi/v2/tokens/new_listing';

// Filtering criteria - Fine-tuned for better balance
const MIN_LIQUIDITY = 3000; // Lowered from 5000 to catch more new tokens
const MIN_MARKET_CAP = 30000; // Increased from 3000 to 30000 to catch more new tokens
const MAX_MARKET_CAP = 10000000; // Increased from 5M to 10M to catch more established tokens
const MONITOR_INTERVAL = 30000; // 30 seconds - reduced since we have real-time monitoring
const MAX_TOKEN_AGE_MINUTES = 60; // Increased from 30 to 60 minutes to catch more opportunities
const MIN_VOLUME_24H = 5000; // Minimum 24h volume in USD

// Real-time monitoring configuration
const ENABLE_REALTIME_MONITORING = true; // Set to false to disable real-time monitoring

// Known stablecoins and major tokens to exclude
const EXCLUDED_TOKENS = [
  'So11111111111111111111111111111111111111112', // SOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', // JitoSOL
  'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v', // JupSOL
];

// Sniping configuration
const SNIPE_AMOUNT_USDT = 1.0; // Amount to snipe in USDT
const MAX_SLIPPAGE_BPS = 500; // 5% max slippage
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const DRY_RUN = false; // Set to false to execute real trades

// Portfolio management
const PORTFOLIO_FILE = 'portfolio.json';
const SNIPES_LOG_FILE = 'snipes_log.json';

// Telegram configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ENABLE_TELEGRAM = TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID;

// Validation
if (!BIRDEYE_API_KEY) {
  console.error('Missing BIRDEYE_API_KEY in .env');
  process.exit(1);
}

if (!PRIVATE_KEY_BASE58) {
  console.error('Missing PRIVATE_KEY_BASE58 in .env');
  process.exit(1);
}

// Initialize Solana connection and wallet
const connection = new Connection(SOLANA_RPC, 'confirmed');
const wallet = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY_BASE58));

console.log('🚀 Enhanced Solana Sniping Bot');
console.log('Wallet:', wallet.publicKey.toString());
console.log('RPC:', SOLANA_RPC);
console.log('Real-time monitoring:', ENABLE_REALTIME_MONITORING ? 'Enabled' : 'Disabled');
console.log('Backup polling interval:', MONITOR_INTERVAL / 1000, 'seconds');
console.log('Sniping amount:', SNIPE_AMOUNT_USDT, 'USDT');
console.log('Telegram notifications:', ENABLE_TELEGRAM ? 'Enabled' : 'Disabled');
console.log('='.repeat(80));

// Display current portfolio
displayPortfolio();

// Store previously seen tokens to detect new ones
let previouslySeenTokens = new Set();

function passesSnipeFilters(token) {
  // Exclude known major tokens
  if (EXCLUDED_TOKENS.includes(token.address)) {
    return false;
  }
  
  // Check liquidity
  if (!token.liquidity || token.liquidity < MIN_LIQUIDITY) {
    return false;
  }
  
  // Check market cap range
  if (!token.mc || token.mc < MIN_MARKET_CAP || token.mc > MAX_MARKET_CAP) {
    return false;
  }
  
  // Check if token has reasonable price (not too high or too low)
  if (!token.price || token.price < 0.000001 || token.price > 1000) {
    return false;
  }
  
  // Check if token is recent (within last 60 minutes)
  const lastTradeTime = token.lastTradeUnixTime * 1000;
  const sixtyMinutesAgo = Date.now() - (MAX_TOKEN_AGE_MINUTES * 60 * 1000);
  if (lastTradeTime < sixtyMinutesAgo) {
    return false;
  }
  
  // Check 24h volume
  if (!token.v24hUSD || token.v24hUSD < MIN_VOLUME_24H) {
    return false;
  }
  
  // Enhanced volume to market cap ratio check
  const volumeToMC = token.v24hUSD / token.mc;
  if (volumeToMC < 0.05) { // Lowered from 0.1 to 0.05 (5% instead of 10%)
    return false;
  }
  
  // Additional filter: Check if price is not too volatile (avoid extreme pumps/dumps)
  if (token.v24hChangePercent && Math.abs(token.v24hChangePercent) > 1000) {
    return false; // Skip tokens with >1000% price change in 24h
  }
  
  // Check if token has a reasonable name and symbol (avoid obvious scam names)
  const suspiciousNames = ['test', 'scam', 'rug', 'fake', 'honeypot', 'shit', 'moon', 'safe'];
  const tokenName = token.name?.toLowerCase() || '';
  const tokenSymbol = token.symbol?.toLowerCase() || '';
  
  for (const suspicious of suspiciousNames) {
    if (tokenName.includes(suspicious) || tokenSymbol.includes(suspicious)) {
      return false;
    }
  }
  
  return true;
}

function isNewToken(token) {
  return !previouslySeenTokens.has(token.address);
}

async function checkTokenSafety(token) {
  try {
    console.log(`🔍 Checking safety for ${token.symbol}...`);
    
    // 1. Check mint authority (should be null for legitimate tokens)
    const mintAuthorityCheck = await checkMintAuthority(token.address);
    if (!mintAuthorityCheck.passed) {
      console.log(`   ❌ Mint authority check failed: ${mintAuthorityCheck.reason}`);
      return false;
    }
    console.log(`   ✅ Mint authority: ${mintAuthorityCheck.authority}`);
    
    // 2. Check freeze authority (should be null for legitimate tokens)
    const freezeAuthorityCheck = await checkFreezeAuthority(token.address);
    if (!freezeAuthorityCheck.passed) {
      console.log(`   ❌ Freeze authority check failed: ${freezeAuthorityCheck.reason}`);
      return false;
    }
    console.log(`   ✅ Freeze authority: ${freezeAuthorityCheck.authority}`);
    
    // 3. Check token supply (should be reasonable)
    const supplyCheck = await checkTokenSupply(token.address);
    if (!supplyCheck.passed) {
      console.log(`   ❌ Supply check failed: ${supplyCheck.reason}`);
      return false;
    }
    console.log(`   ✅ Supply: ${supplyCheck.supply.toLocaleString()} (${supplyCheck.decimals} decimals)`);
    
    // 4. Check for honeypot (simulate a sell to see if it's possible)
    const honeypotCheck = await checkHoneypot(token.address);
    if (!honeypotCheck.passed) {
      console.log(`   ❌ Honeypot check failed: ${honeypotCheck.reason}`);
      return false;
    }
    console.log(`   ✅ Honeypot check passed: ${honeypotCheck.details}`);
    
    // 5. Check if token has reasonable holder distribution
    const holderCheck = await checkHolderDistribution(token.address);
    if (!holderCheck.passed) {
      console.log(`   ❌ Holder distribution check failed: ${holderCheck.reason}`);
      return false;
    }
    console.log(`   ✅ Holder distribution: ${holderCheck.details}`);
    
    console.log(`   🎯 All safety checks passed for ${token.symbol}!`);
    return true;
    
  } catch (error) {
    console.error(`Error checking token safety:`, error);
    return false;
  }
}

async function checkMintAuthority(tokenMint) {
  try {
    const mintPubkey = new PublicKey(tokenMint);
    const accountInfo = await connection.getParsedAccountInfo(mintPubkey);
    
    if (!accountInfo.value) {
      return { passed: false, reason: 'Token account not found' };
    }
    
    const data = accountInfo.value.data;
    if (data && data.parsed && data.parsed.info) {
      const mintAuthority = data.parsed.info.mintAuthority;
      const authority = mintAuthority ? mintAuthority : 'null';
      
      // For legitimate tokens, mint authority should be null (renounced)
      if (mintAuthority === null) {
        return { passed: true, authority: 'null (renounced)' };
      } else {
        return { passed: false, reason: `Mint authority not renounced: ${authority}` };
      }
    }
    
    return { passed: false, reason: 'Could not parse token data' };
  } catch (error) {
    return { passed: false, reason: `Error: ${error.message}` };
  }
}

async function checkFreezeAuthority(tokenMint) {
  try {
    const mintPubkey = new PublicKey(tokenMint);
    const accountInfo = await connection.getParsedAccountInfo(mintPubkey);
    
    if (!accountInfo.value) {
      return { passed: false, reason: 'Token account not found' };
    }
    
    const data = accountInfo.value.data;
    if (data && data.parsed && data.parsed.info) {
      const freezeAuthority = data.parsed.info.freezeAuthority;
      const authority = freezeAuthority ? freezeAuthority : 'null';
      
      // For legitimate tokens, freeze authority should be null (renounced)
      if (freezeAuthority === null) {
        return { passed: true, authority: 'null (renounced)' };
      } else {
        return { passed: false, reason: `Freeze authority not renounced: ${authority}` };
      }
    }
    
    return { passed: false, reason: 'Could not parse token data' };
  } catch (error) {
    return { passed: false, reason: `Error: ${error.message}` };
  }
}

async function checkTokenSupply(tokenMint) {
  try {
    const mintPubkey = new PublicKey(tokenMint);
    const accountInfo = await connection.getParsedAccountInfo(mintPubkey);
    
    if (!accountInfo.value) {
      return { passed: false, reason: 'Token account not found' };
    }
    
    const data = accountInfo.value.data;
    if (data && data.parsed && data.parsed.info) {
      const supply = parseFloat(data.parsed.info.supply);
      const decimals = parseInt(data.parsed.info.decimals);
      const uiSupply = supply / Math.pow(10, decimals);
      
      // Check if supply is reasonable (between 1M and 1T)
      if (uiSupply < 1_000_000) {
        return { passed: false, reason: `Supply too low: ${uiSupply.toLocaleString()}` };
      }
      
      if (uiSupply > 1_000_000_000_000) {
        return { passed: false, reason: `Supply too high: ${uiSupply.toLocaleString()}` };
      }
      
      // Check if decimals are standard (6, 8, or 9)
      if (![6, 8, 9].includes(decimals)) {
        return { passed: false, reason: `Non-standard decimals: ${decimals}` };
      }
      
      return { 
        passed: true, 
        supply: supply, 
        decimals: decimals,
        uiSupply: uiSupply
      };
    }
    
    return { passed: false, reason: 'Could not parse token data' };
  } catch (error) {
    return { passed: false, reason: `Error: ${error.message}` };
  }
}

async function checkHoneypot(tokenMint) {
  try {
    console.log(`   🔍 Checking honeypot for ${tokenMint}...`);
    
    // Jupiter API endpoints
    const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
    const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
    
    // Test parameters
    const testAmount = 1000000; // 1 USDT (6 decimals)
    const slippageBps = 100; // 1% slippage
    
    // 1. Test BUY transaction (USDT -> Token)
    const buyQuoteParams = new URLSearchParams({
      inputMint: USDT_MINT,
      outputMint: tokenMint,
      amount: testAmount.toString(),
      slippageBps: slippageBps.toString(),
      onlyDirectRoutes: 'false',
      asLegacyTransaction: 'false'
    });
    
    const buyResponse = await fetch(`${JUPITER_QUOTE_API}?${buyQuoteParams}`);
    if (!buyResponse.ok) {
      return { 
        passed: false, 
        reason: `Buy quote failed: ${buyResponse.status} - Token may not be tradeable` 
      };
    }
    
    const buyQuote = await buyResponse.json();
    
    // Check if buy quote is reasonable
    if (!buyQuote.outAmount || buyQuote.outAmount === '0') {
      return { 
        passed: false, 
        reason: 'Buy quote returned 0 tokens - likely honeypot' 
      };
    }
    
    // 2. Test SELL transaction (Token -> USDT) - This is the critical honeypot test
    const sellQuoteParams = new URLSearchParams({
      inputMint: tokenMint,
      outputMint: USDT_MINT,
      amount: buyQuote.outAmount,
      slippageBps: slippageBps.toString(),
      onlyDirectRoutes: 'false',
      asLegacyTransaction: 'false'
    });
    
    const sellResponse = await fetch(`${JUPITER_QUOTE_API}?${sellQuoteParams}`);
    if (!sellResponse.ok) {
      return { 
        passed: false, 
        reason: `Sell quote failed: ${sellResponse.status} - Classic honeypot (can buy but can't sell)` 
      };
    }
    
    const sellQuote = await sellResponse.json();
    
    // Check if sell quote is reasonable
    if (!sellQuote.outAmount || sellQuote.outAmount === '0') {
      return { 
        passed: false, 
        reason: 'Sell quote returned 0 USDT - honeypot confirmed' 
      };
    }
    
    // 3. Calculate price impact and slippage
    const buyPrice = testAmount / parseFloat(buyQuote.outAmount);
    const sellPrice = parseFloat(sellQuote.outAmount) / parseFloat(buyQuote.outAmount);
    const priceImpact = ((buyPrice - sellPrice) / buyPrice) * 100;
    
    // Check for excessive price impact (indicates manipulation)
    if (priceImpact > 50) {
      return { 
        passed: false, 
        reason: `Excessive price impact: ${priceImpact.toFixed(2)}% (buy: $${buyPrice.toFixed(8)}, sell: $${sellPrice.toFixed(8)})` 
      };
    }
    
    // 4. Check if sell amount is reasonable (should be close to original amount)
    const sellAmount = parseFloat(sellQuote.outAmount) / 1000000; // Convert to USDT
    const recoveryRate = (sellAmount / 1) * 100; // 1 USDT was our original amount
    
    if (recoveryRate < 50) {
      return { 
        passed: false, 
        reason: `Poor sell recovery: ${recoveryRate.toFixed(1)}% (bought 1 USDT worth, can only sell ${sellAmount.toFixed(4)} USDT worth)` 
      };
    }
    
    // 5. Check for reasonable slippage
    const buySlippage = parseFloat(buyQuote.priceImpactPct);
    const sellSlippage = parseFloat(sellQuote.priceImpactPct);
    
    if (buySlippage > 20 || sellSlippage > 20) {
      return { 
        passed: false, 
        reason: `Excessive slippage - Buy: ${buySlippage.toFixed(2)}%, Sell: ${sellSlippage.toFixed(2)}%` 
      };
    }
    
    return { 
      passed: true, 
      details: `Buy: $${buyPrice.toFixed(8)}, Sell: $${sellPrice.toFixed(8)}, Impact: ${priceImpact.toFixed(2)}%, Recovery: ${recoveryRate.toFixed(1)}%` 
    };
    
  } catch (error) {
    return { passed: false, reason: `Honeypot check error: ${error.message}` };
  }
}

async function checkHolderDistribution(tokenMint) {
  try {
    // For now, we'll do a basic check
    // In a real implementation, you would:
    // 1. Fetch top holders from Birdeye API
    // 2. Check if top holder owns too much (>50% is suspicious)
    // 3. Check if holders are evenly distributed
    
    // Basic distribution check:
    // - If market cap is high but liquidity is low, it might be concentrated
    
    // Note: This function receives tokenMint (string) but we need token data
    // For now, return true (implement real holder check later)
    return { 
      passed: true, 
      details: 'Basic check passed (advanced holder analysis not implemented)' 
    };
  } catch (error) {
    return { passed: false, reason: `Error: ${error.message}` };
  }
}

async function checkUSDTBalance() {
  try {
    const usdtMint = new PublicKey(USDT_MINT);
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, {
      mint: usdtMint
    });
    
    if (tokenAccounts.value.length === 0) {
      return { hasBalance: false, balance: 0, error: 'No USDT account found' };
    }
    
    const balance = parseFloat(tokenAccounts.value[0].account.data.parsed.info.tokenAmount.amount) / 1000000;
    const hasBalance = balance >= SNIPE_AMOUNT_USDT;
    
    return { hasBalance, balance, error: null };
  } catch (error) {
    return { hasBalance: false, balance: 0, error: error.message };
  }
}

async function snipeToken(token) {
  try {
    console.log(`🎯 ATTEMPTING TO SNIPE: ${token.symbol}`);
    console.log(`   Mint: ${token.address}`);
    console.log(`   Price: $${token.price}`);
    console.log(`   Liquidity: $${token.liquidity.toLocaleString()}`);
    console.log(`   Amount: $${SNIPE_AMOUNT_USDT} USDT`);
    
    if (DRY_RUN) {
      console.log(`   🔬 DRY RUN MODE - No real trades will be executed`);
    }
    
    // Check USDT balance first
    const balanceCheck = await checkUSDTBalance();
    if (!balanceCheck.hasBalance) {
      console.log(`   ❌ Insufficient USDT balance: ${balanceCheck.balance} USDT (need ${SNIPE_AMOUNT_USDT} USDT)`);
      if (balanceCheck.error) {
        console.log(`      Error: ${balanceCheck.error}`);
      }
      if (DRY_RUN) {
        console.log(`   🔬 DRY RUN: Would skip due to insufficient balance`);
      }
      return;
    }
    
    console.log(`   ✅ USDT Balance: ${balanceCheck.balance.toFixed(2)} USDT`);
    
    // 1. Get swap quote from Jupiter
    const quote = await getJupiterQuote(token.address, SNIPE_AMOUNT_USDT);
    if (!quote.success) {
      console.log(`   ❌ Quote failed: ${quote.error}`);
      return;
    }
    
    console.log(`   📊 Quote received:`);
    console.log(`      Input: $${SNIPE_AMOUNT_USDT} USDT`);
    console.log(`      Output: ${quote.outAmount} ${token.symbol}`);
    console.log(`      Price Impact: ${quote.priceImpact}%`);
    console.log(`      Slippage: ${quote.slippage}%`);
    
    // 2. Check if quote is reasonable
    if (quote.priceImpact > 20) {
      console.log(`   ❌ Price impact too high: ${quote.priceImpact}%`);
      return;
    }
    
    if (quote.slippage > 5) {
      console.log(`   ❌ Slippage too high: ${quote.slippage}%`);
      return;
    }
    
    // 3. Build the swap transaction
    const swapTransaction = await buildJupiterSwap(quote.quoteResponse);
    if (!swapTransaction.success) {
      console.log(`   ❌ Failed to build transaction: ${swapTransaction.error}`);
      return;
    }
    
    console.log(`   🔨 Transaction built successfully`);
    
    if (DRY_RUN) {
      console.log(`   🔬 DRY RUN: Would execute swap here`);
      console.log(`   🔬 DRY RUN: Estimated tokens to receive: ${quote.outAmount} ${token.symbol}`);
      console.log(`   🔬 DRY RUN: Estimated cost: $${SNIPE_AMOUNT_USDT} USDT`);
      console.log(`   🔬 DRY RUN: Transaction size: ${swapTransaction.transaction.length} bytes`);
      
      // Log the simulated snipe
      logSuccessfulSnipe(token, quote, { signature: 'DRY_RUN_SIMULATION' });
      return;
    }
    
    // 4. Execute the swap (only if not in dry run mode)
    const swapResult = await executeSwap(swapTransaction.transaction, quote.quoteResponse);
    if (!swapResult.success) {
      console.log(`   ❌ Swap failed: ${swapResult.error}`);
      return;
    }

    // Fetch token decimals
    let decimals = 9; // default
    try {
      const mintPubkey = new PublicKey(token.address);
      const accountInfo = await connection.getParsedAccountInfo(mintPubkey);
      if (accountInfo.value && accountInfo.value.data && accountInfo.value.data.parsed && accountInfo.value.data.parsed.info) {
        decimals = parseInt(accountInfo.value.data.parsed.info.decimals);
      }
    } catch (e) {
      console.log('Warning: Could not fetch decimals for', token.symbol, token.address, e.message);
    }
    // Convert tokensReceived to UI units
    const tokensReceivedUI = parseFloat(quote.outAmount) / Math.pow(10, decimals);

    console.log(`   ✅ SNIPE SUCCESSFUL!`);
    console.log(`      Transaction: ${swapResult.signature}`);
    console.log(`      Tokens received: ${tokensReceivedUI} ${token.symbol}`);
    console.log(`      Price: $${token.price}`);
    
    // 5. Update portfolio and send notifications
    const portfolio = addTokenToPortfolio(token, quote, swapResult.signature, tokensReceivedUI);
    logSnipeToFile(token, quote, swapResult.signature, tokensReceivedUI);
    
    // Send Telegram notification
    const notification = formatSnipeNotification(token, quote, swapResult.signature);
    await sendTelegramMessage(notification);
    
  } catch (error) {
    console.error(`Error sniping token:`, error);
  }
}

async function getJupiterQuote(tokenMint, amountUsdt) {
  try {
    const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
    const amountIn = Math.floor(amountUsdt * 1000000); // Convert to USDT decimals
    
    const params = new URLSearchParams({
      inputMint: USDT_MINT,
      outputMint: tokenMint,
      amount: amountIn.toString(),
      slippageBps: MAX_SLIPPAGE_BPS.toString(),
      onlyDirectRoutes: 'false',
      asLegacyTransaction: 'false'
    });
    
    const response = await fetch(`${JUPITER_QUOTE_API}?${params}`);
    if (!response.ok) {
      return { success: false, error: `Quote API error: ${response.status}` };
    }
    
    const quoteData = await response.json();
    
    // Calculate price impact and slippage
    const priceImpact = parseFloat(quoteData.priceImpactPct || 0);
    const slippage = parseFloat(quoteData.slippageBps || 0) / 100;
    
    return {
      success: true,
      quoteResponse: quoteData,
      outAmount: quoteData.outAmount,
      priceImpact: priceImpact,
      slippage: slippage
    };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function buildJupiterSwap(quoteResponse) {
  try {
    const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';
    
    const swapRequest = {
      quoteResponse: quoteResponse,
      userPublicKey: wallet.publicKey.toString(),
      wrapUnwrapSOL: false
    };
    
    const response = await fetch(JUPITER_SWAP_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(swapRequest)
    });
    
    if (!response.ok) {
      return { success: false, error: `Swap API error: ${response.status}` };
    }
    
    const swapData = await response.json();
    
    return {
      success: true,
      transaction: swapData.swapTransaction
    };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function executeSwap(swapTransaction, quoteResponse) {
  try {
    // Decode the transaction - handle both legacy and versioned transactions
    let transaction;
    try {
      // Try to deserialize as versioned transaction first
      transaction = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
      
      // For versioned transactions, we need to sign the message
      transaction.sign([wallet]);
      
    } catch (versionedError) {
      // If that fails, try as legacy transaction
      try {
        transaction = Transaction.from(Buffer.from(swapTransaction, 'base64'));
        
        // Set recent blockhash for legacy transactions
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = wallet.publicKey;
        
        // Sign the transaction
        transaction.sign(wallet);
      } catch (legacyError) {
        return { success: false, error: `Failed to deserialize transaction: ${legacyError.message}` };
      }
    }
    
    // Send the transaction
    const signature = await connection.sendRawTransaction(transaction.serialize());
    
    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      return { success: false, error: `Transaction failed: ${confirmation.value.err}` };
    }
    
    return {
      success: true,
      signature: signature
    };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function logSuccessfulSnipe(token, quote, swapResult) {
  const snipeLog = {
    timestamp: new Date().toISOString(),
    dryRun: DRY_RUN,
    token: {
      symbol: token.symbol,
      name: token.name,
      mint: token.address,
      price: token.price,
      liquidity: token.liquidity,
      marketCap: token.mc
    },
    snipe: {
      amountUsdt: SNIPE_AMOUNT_USDT,
      tokensReceived: quote.outAmount,
      priceImpact: quote.priceImpact,
      slippage: quote.slippage
    },
    transaction: swapResult.signature
  };
  
  console.log(`\n📝 SNIPE LOG:`);
  console.log(JSON.stringify(snipeLog, null, 2));
  
  // You could also save to a file or database here
  // fs.appendFileSync('snipes.json', JSON.stringify(snipeLog) + '\n');
}

async function fetchNewListings() {
  try {
    const res = await fetch(NEW_LISTINGS_URL, {
      headers: {
        'X-API-KEY': BIRDEYE_API_KEY,
      },
    });
    
    if (!res.ok) {
      console.error('Failed to fetch new listings:', res.status);
      return [];
    }
    
    const data = await res.json();
    if (!data.data || !Array.isArray(data.data)) {
      return [];
    }
    
    return data.data;
  } catch (error) {
    console.error('Error fetching new listings:', error);
    return [];
  }
}

async function fetchAndAnalyzeTokens() {
  try {
    console.log(`\n📡 Fetching tokens... (${new Date().toLocaleTimeString()})`);
    
    // Fetch both regular token list and new listings
    const [res, newListings] = await Promise.all([
      fetch(API_URL, {
        headers: {
          'X-API-KEY': BIRDEYE_API_KEY,
        },
      }),
      fetchNewListings()
    ]);
    
    if (!res.ok) {
      console.error('Failed to fetch from Birdeye:', res.status);
      return;
    }
    
    const data = await res.json();
    if (!data.data || !data.data.tokens || !Array.isArray(data.data.tokens)) {
      console.error('No token data found in Birdeye response');
      return;
    }
    
    // Combine both sources and prioritize new listings
    let allTokens = [...data.data.tokens];
    
    // Add new listings with higher priority
    if (newListings.length > 0) {
      console.log(`   New listings found: ${newListings.length}`);
      allTokens = [...newListings, ...allTokens];
    }
    
    // Filter tokens that pass our criteria
    const filteredTokens = allTokens.filter(passesSnipeFilters);
    console.log(`   Total tokens: ${allTokens.length}`);
    console.log(`   Passing filters: ${filteredTokens.length}`);
    
    // Find new tokens (not seen before)
    const newTokens = filteredTokens.filter(isNewToken);
    console.log(`   New tokens: ${newTokens.length}`);
    
    // Update our set of seen tokens
    allTokens.forEach(token => {
      previouslySeenTokens.add(token.address);
    });
    
    // Process new tokens
    for (const token of newTokens.slice(0, 3)) { // Limit to 3 to focus on best opportunities
      const tokenAge = Math.floor((Date.now() - (token.lastTradeUnixTime * 1000)) / (1000 * 60));
      
      console.log(`\n🚀 FRESH TOKEN DETECTED: ${token.symbol} (${token.name})`);
      console.log(`   Mint: ${token.address}`);
      console.log(`   Age: ${tokenAge} minutes old`);
      console.log(`   Price: $${token.price?.toFixed(8) || 'N/A'}`);
      console.log(`   Liquidity: $${token.liquidity?.toLocaleString() || 'N/A'}`);
      console.log(`   Market Cap: $${token.mc?.toLocaleString() || 'N/A'}`);
      console.log(`   Volume/MC Ratio: ${((token.v24hUSD / token.mc) * 100).toFixed(1)}%`);
      console.log(`   Last Trade: ${new Date(token.lastTradeUnixTime * 1000).toLocaleString()}`);
      
      // Check token safety
      const isSafe = await checkTokenSafety(token);
      if (isSafe) {
        console.log(`   ✅ Token passed safety checks`);
        await snipeToken(token);
      } else {
        console.log(`   ❌ Token failed safety checks`);
      }
    }
    
  } catch (error) {
    console.error('Error in fetchAndAnalyzeTokens:', error);
    await sendTelegramMessage(formatErrorNotification(error.message, 'Token Analysis'));
  }
}

// Portfolio management functions
function loadPortfolio() {
  try {
    if (fs.existsSync(PORTFOLIO_FILE)) {
      const data = fs.readFileSync(PORTFOLIO_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading portfolio:', error);
  }
  return { tokens: [], totalInvested: 0, totalValue: 0, lastUpdated: new Date().toISOString() };
}

function savePortfolio(portfolio) {
  try {
    fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(portfolio, null, 2));
  } catch (error) {
    console.error('Error saving portfolio:', error);
  }
}

function addTokenToPortfolio(token, quote, transactionSignature, tokensReceivedUI) {
  const portfolio = loadPortfolio();
  const tokensReceived = tokensReceivedUI !== undefined ? tokensReceivedUI : parseFloat(quote.outAmount);
  const portfolioToken = {
    symbol: token.symbol,
    name: token.name,
    mint: token.address,
    snipedAt: new Date().toISOString(),
    amountUsdt: SNIPE_AMOUNT_USDT,
    tokensReceived: tokensReceived,
    priceAtSnipe: token.price,
    liquidityAtSnipe: token.liquidity,
    marketCapAtSnipe: token.mc,
    transactionSignature: transactionSignature,
    currentPrice: token.price, // Will be updated later
    currentValue: tokensReceived * token.price,
    profitLoss: 0, // Will be calculated later
    profitLossPercent: 0 // Will be calculated later
  };
  portfolio.tokens.push(portfolioToken);
  portfolio.totalInvested += SNIPE_AMOUNT_USDT;
  portfolio.totalValue += portfolioToken.currentValue;
  portfolio.lastUpdated = new Date().toISOString();
  savePortfolio(portfolio);
  console.log(`\n📊 PORTFOLIO UPDATED:`);
  console.log(`   Total tokens: ${portfolio.tokens.length}`);
  console.log(`   Total invested: $${portfolio.totalInvested.toFixed(2)}`);
  console.log(`   Current value: $${portfolio.totalValue.toFixed(2)}`);
  console.log(`   P&L: $${(portfolio.totalValue - portfolio.totalInvested).toFixed(2)} (${((portfolio.totalValue - portfolio.totalInvested) / portfolio.totalInvested * 100).toFixed(2)}%)`);
  return portfolio;
}

function logSnipeToFile(token, quote, transactionSignature, tokensReceivedUI) {
  try {
    const tokensReceived = tokensReceivedUI !== undefined ? tokensReceivedUI : parseFloat(quote.outAmount);
    const snipeLog = {
      timestamp: new Date().toISOString(),
      token: {
        symbol: token.symbol,
        name: token.name,
        mint: token.address,
        price: token.price,
        liquidity: token.liquidity,
        marketCap: token.mc
      },
      snipe: {
        amountUsdt: SNIPE_AMOUNT_USDT,
        tokensReceived: tokensReceived,
        priceImpact: quote.priceImpact,
        slippage: quote.slippage
      },
      transaction: transactionSignature
    };
    let snipes = [];
    if (fs.existsSync(SNIPES_LOG_FILE)) {
      snipes = JSON.parse(fs.readFileSync(SNIPES_LOG_FILE, 'utf8'));
    }
    snipes.push(snipeLog);
    fs.writeFileSync(SNIPES_LOG_FILE, JSON.stringify(snipes, null, 2));
  } catch (error) {
    console.error('Error logging snipe:', error);
  }
}

function displayPortfolio() {
  const portfolio = loadPortfolio();
  
  console.log(`\n📊 CURRENT PORTFOLIO:`);
  console.log(`   Total tokens: ${portfolio.tokens.length}`);
  console.log(`   Total invested: $${portfolio.totalInvested.toFixed(2)}`);
  console.log(`   Current value: $${portfolio.totalValue.toFixed(2)}`);
  console.log(`   P&L: $${(portfolio.totalValue - portfolio.totalInvested).toFixed(2)} (${((portfolio.totalValue - portfolio.totalInvested) / portfolio.totalInvested * 100).toFixed(2)}%)`);
  
  if (portfolio.tokens.length > 0) {
    console.log(`\n   Recent snipes:`);
    portfolio.tokens.slice(-5).forEach((token, index) => {
      console.log(`   ${index + 1}. ${token.symbol} - $${token.currentValue.toFixed(2)} (${token.profitLossPercent.toFixed(2)}%)`);
    });
  }
}

// Telegram notification functions
async function sendTelegramMessage(message) {
  if (!ENABLE_TELEGRAM) {
    console.log(`📱 Telegram notification (disabled): ${message}`);
    return;
  }
  
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML'
      })
    });
    
    if (!response.ok) {
      console.error('Failed to send Telegram message:', response.status);
    }
  } catch (error) {
    console.error('Error sending Telegram message:', error);
  }
}

function formatSnipeNotification(token, quote, transactionSignature) {
  const portfolio = loadPortfolio();
  const totalInvested = portfolio.totalInvested;
  const totalValue = portfolio.totalValue;
  const pnl = totalValue - totalInvested;
  const pnlPercent = totalInvested > 0 ? (pnl / totalInvested * 100) : 0;
  
  return `🚀 <b>SUCCESSFUL SNIPE!</b>

💰 <b>Token:</b> ${token.symbol} (${token.name})
📍 <b>Mint:</b> <code>${token.address}</code>
💵 <b>Amount:</b> $${SNIPE_AMOUNT_USDT} USDT
🎯 <b>Received:</b> ${parseFloat(quote.outAmount).toLocaleString()} ${token.symbol}
💲 <b>Price:</b> $${token.price.toFixed(8)}
💧 <b>Liquidity:</b> $${token.liquidity.toLocaleString()}
📊 <b>Market Cap:</b> $${token.mc.toLocaleString()}

🔗 <b>Transaction:</b> <a href="https://solscan.io/tx/${transactionSignature}">View on Solscan</a>

📈 <b>Portfolio Summary:</b>
   • Total Tokens: ${portfolio.tokens.length}
   • Total Invested: $${totalInvested.toFixed(2)}
   • Current Value: $${totalValue.toFixed(2)}
   • P&L: $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)

⏰ <b>Time:</b> ${new Date().toLocaleString()}`;
}

function formatErrorNotification(error, context) {
  return `❌ <b>BOT ERROR</b>

🔍 <b>Context:</b> ${context}
⚠️ <b>Error:</b> ${error}

⏰ <b>Time:</b> ${new Date().toLocaleString()}`;
}

function formatPortfolioUpdate(portfolio) {
  const pnl = portfolio.totalValue - portfolio.totalInvested;
  const pnlPercent = portfolio.totalInvested > 0 ? (pnl / portfolio.totalInvested * 100) : 0;
  
  return `📊 <b>PORTFOLIO UPDATE</b>

💰 <b>Total Invested:</b> $${portfolio.totalInvested.toFixed(2)}
💎 <b>Current Value:</b> $${portfolio.totalValue.toFixed(2)}
📈 <b>P&L:</b> $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)
🎯 <b>Total Tokens:</b> ${portfolio.tokens.length}

⏰ <b>Updated:</b> ${new Date().toLocaleString()}`;
}

// Real-time pool detection functions
function passesRealTimeFilters(poolInfo) {
  console.log('🔍 Applying real-time filters for:', poolInfo.address);
  
  // Skip if we don't have minimum required info
  if (!poolInfo.address || !poolInfo.baseMint || !poolInfo.quoteMint) {
    console.log('❌ Missing required pool info');
    return false;
  }
  
  // Check if it's a SOL pair (most common for sniping)
  if (poolInfo.quoteMint !== 'So11111111111111111111111111111111111111112') {
    console.log('❌ Not a SOL pair');
    return false;
  }
  
  // Skip known excluded tokens
  if (EXCLUDED_TOKENS.includes(poolInfo.address)) {
    console.log('❌ Token in excluded list');
    return false;
  }
  
  return true;
}

async function enhanceRealTimePoolInfo(poolInfo) {
  try {
    console.log('📊 Enhancing real-time pool info for:', poolInfo.address);
    
    // Create enhanced object compatible with existing functions
    const enhanced = {
      address: poolInfo.address,
      symbol: 'UNKNOWN',
      name: 'Unknown Token',
      price: 0,
      mc: 0,
      liquidity: 0,
      volume24h: 0,
      lastTradeUnixTime: Math.floor(Date.now() / 1000),
      // Add real-time specific fields
      poolId: poolInfo.poolId,
      baseMint: poolInfo.baseMint,
      quoteMint: poolInfo.quoteMint,
      signature: poolInfo.signature,
      detectionMethod: poolInfo.detectionMethod || 'realtime'
    };
    
    // You could add more sophisticated data fetching here
    // For now, we'll let the existing safety checks handle detailed validation
    
    return enhanced;
  } catch (error) {
    console.error('Error enhancing real-time pool info:', error);
    return null;
  }
}

async function handleRealTimePool(poolInfo) {
  try {
    console.log('\n⚡ REAL-TIME POOL DETECTED!');
    console.log('Token:', poolInfo.address);
    console.log('Detection Method:', poolInfo.detectionMethod);
    console.log('Signature:', poolInfo.signature || 'N/A');
    
    // Apply initial real-time filters
    if (!passesRealTimeFilters(poolInfo)) {
      console.log('❌ Pool filtered out by real-time filters');
      return;
    }
    
    // Enhance pool info to match existing format
    const enhancedInfo = await enhanceRealTimePoolInfo(poolInfo);
    if (!enhancedInfo) {
      console.log('❌ Could not enhance pool info');
      return;
    }
    
    // Apply existing comprehensive filters
    if (!passesSnipeFilters(enhancedInfo)) {
      console.log('❌ Pool filtered out by existing filters');
      return;
    }
    
    console.log('🎯 Real-time pool passes filters, checking safety...');
    
    // Check token safety
    const safetyCheck = await checkTokenSafety(enhancedInfo);
    if (!safetyCheck) {
      console.log('❌ Token failed safety checks');
      return;
    }
    
    console.log('✅ Real-time pool passed all checks, attempting snipe...');
    
    // Execute snipe using existing function
    await snipeToken(enhancedInfo);
    
  } catch (error) {
    console.error('❌ Real-time pool handling failed:', error);
  }
}

// Start monitoring
async function startMonitoring() {
  console.log('🚀 Starting Enhanced Solana Sniping Bot...\n');
  
  // Start real-time monitoring if enabled
  if (ENABLE_REALTIME_MONITORING) {
    try {
      console.log('⚡ Setting up real-time pool monitoring...');
      const realTimeMonitor = new RealTimePoolMonitor(handleRealTimePool);
      await realTimeMonitor.startMonitoring();
      console.log('✅ Real-time monitoring active!\n');
    } catch (error) {
      console.error('❌ Failed to start real-time monitoring:', error);
      console.log('⚠️ Continuing with Birdeye polling only...\n');
    }
  }
  
  // Initial Birdeye fetch
  console.log('📊 Starting Birdeye polling (backup monitoring)...');
  await fetchAndAnalyzeTokens();
  
  // Set up continuous Birdeye monitoring (now as backup)
  setInterval(fetchAndAnalyzeTokens, MONITOR_INTERVAL);
  
  console.log('🎯 Hybrid monitoring active:');
  console.log('   ⚡ Real-time: WebSocket detection (<1s latency)');
  console.log('   📊 Backup: Birdeye polling every', MONITOR_INTERVAL / 1000, 'seconds');
  console.log('='.repeat(80));
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down sniping bot...');
  process.exit(0);
});

// Start the bot
startMonitoring().catch(console.error); 