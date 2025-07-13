require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');

// Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;
const PORTFOLIO_FILE = 'portfolio.json';
const SNIPES_LOG_FILE = 'snipes_log.json';

if (!TELEGRAM_BOT_TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN in .env');
  process.exit(1);
}

if (!BIRDEYE_API_KEY) {
  console.error('Missing BIRDEYE_API_KEY in .env');
  process.exit(1);
}

// Bot state
let botInfo = null;
let lastUpdateId = 0;

// Load portfolio data
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

// Load snipes log
function loadSnipes() {
  try {
    if (fs.existsSync(SNIPES_LOG_FILE)) {
      const data = fs.readFileSync(SNIPES_LOG_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading snipes:', error);
  }
  return [];
}

// Get token price from Birdeye
async function getTokenPrice(tokenMint) {
  try {
    const url = `https://public-api.birdeye.so/defi/price?address=${tokenMint}`;
    const response = await fetch(url, {
      headers: {
        'X-API-KEY': BIRDEYE_API_KEY,
      },
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.data?.value || null;
  } catch (error) {
    console.error(`Error fetching price for ${tokenMint}:`, error);
    return null;
  }
}

// Send message to Telegram
async function sendTelegramMessage(chatId, message, parseMode = 'HTML') {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: parseMode
      })
    });
    
    if (!response.ok) {
      console.error('Failed to send Telegram message:', response.status);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    return false;
  }
}

// Get bot info
async function getBotInfo() {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`;
    const response = await fetch(url);
    const data = await response.json();
    return data.ok ? data.result : null;
  } catch (error) {
    console.error('Error getting bot info:', error);
    return null;
  }
}

// Get updates from Telegram
async function getUpdates() {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`;
    const response = await fetch(url);
    const data = await response.json();
    return data.ok ? data.result : [];
  } catch (error) {
    console.error('Error getting updates:', error);
    return [];
  }
}

// Handle /start command
async function handleStart(chatId, username) {
  const message = `🚀 <b>Welcome to Solana Sniping Bot!</b>

I'm your personal assistant for monitoring your Solana token sniping activities.

<b>Available Commands:</b>

📊 <b>Portfolio Commands:</b>
/portfolio - View your current portfolio with P&L
/balance - Check your USDC balance
/snipes - View recent snipes
/stats - Get portfolio statistics

🔍 <b>Token Commands:</b>
/price [token_mint] - Get current price of a token
/info [token_mint] - Get detailed token information

⚙️ <b>Bot Commands:</b>
/status - Check bot status
/help - Show this help message

<b>Examples:</b>
• <code>/price EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v</code>
• <code>/info EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v</code>

Made with ❤️ for Solana traders`;

  await sendTelegramMessage(chatId, message);
}

// Handle /help command
async function handleHelp(chatId) {
  await handleStart(chatId);
}

// Handle /portfolio command
async function handlePortfolio(chatId) {
  const portfolio = loadPortfolio();
  
  if (portfolio.tokens.length === 0) {
    await sendTelegramMessage(chatId, '📭 <b>PORTFOLIO EMPTY</b>\n\nNo tokens found in your portfolio.');
    return;
  }
  
  // Update prices for all tokens
  const updatedTokens = [];
  for (const token of portfolio.tokens) {
    let currentPrice = await getTokenPrice(token.mint);
    if (!currentPrice || isNaN(currentPrice) || currentPrice <= 0 || currentPrice > 1_000_000) {
      currentPrice = 0;
    }
    updatedTokens.push({
      ...token,
      currentPrice: currentPrice
    });
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  const totalInvested = portfolio.totalInvested;
  let currentTotalValue = 0;
  let totalPnL = 0;
  
  // Calculate current values and P&L
  updatedTokens.forEach(token => {
    const tokensReceived = parseFloat(token.tokensReceived);
    if (
      token.currentPrice &&
      !isNaN(token.currentPrice) &&
      token.currentPrice > 0 &&
      token.currentPrice < 1_000_000 &&
      isFinite(tokensReceived) &&
      tokensReceived > 0
    ) {
      const currentValue = tokensReceived * token.currentPrice;
      const tokenPnL = currentValue - token.amountUsdt;
      currentTotalValue += currentValue;
      totalPnL += tokenPnL;
    } else {
      console.log(`[SKIP] Invalid token in portfolio:`, {
        symbol: token.symbol,
        mint: token.mint,
        tokensReceived: token.tokensReceived,
        currentPrice: token.currentPrice
      });
    }
  });
  
  const totalPnLPercent = totalInvested > 0 ? (totalPnL / totalInvested * 100) : 0;
  
  let message = `📊 <b>PORTFOLIO OVERVIEW</b>\n\n`;
  message += `💰 <b>Total Invested:</b> $${totalInvested.toFixed(2)}\n`;
  message += `💎 <b>Current Value:</b> $${currentTotalValue.toFixed(2)}\n`;
  message += `📈 <b>Total P&L:</b> $${totalPnL.toFixed(2)} (${totalPnLPercent.toFixed(2)}%)\n`;
  message += `🎯 <b>Total Tokens:</b> ${portfolio.tokens.length}\n\n`;
  
  message += `📋 <b>HOLDINGS:</b>\n\n`;
  
  updatedTokens.forEach((token, index) => {
    const currentValue = token.currentPrice ? parseFloat(token.tokensReceived) * token.currentPrice : 0;
    const tokenPnL = currentValue - token.amountUsdt;
    const tokenPnLPercent = token.amountUsdt > 0 ? (tokenPnL / token.amountUsdt * 100) : 0;
    
    message += `${index + 1}. <b>${token.symbol}</b> (${token.name})\n`;
    message += `   💰 Invested: $${token.amountUsdt.toFixed(2)}\n`;
    message += `   🎯 Amount: ${parseFloat(token.tokensReceived).toLocaleString()} ${token.symbol}\n`;
    message += `   💲 Price: $${token.currentPrice ? token.currentPrice.toFixed(8) : 'N/A'}\n`;
    message += `   💎 Value: $${currentValue.toFixed(2)}\n`;
    message += `   📈 P&L: $${tokenPnL.toFixed(2)} (${tokenPnLPercent.toFixed(2)}%)\n`;
    message += `   📅 Sniped: ${new Date(token.snipedAt).toLocaleDateString()}\n\n`;
  });
  
  message += `⏰ <b>Updated:</b> ${new Date().toLocaleString()}`;
  
  await sendTelegramMessage(chatId, message);
}

// Handle /balance command
async function handleBalance(chatId) {
  // This would require wallet connection - for now show portfolio balance
  const portfolio = loadPortfolio();
  const message = `💰 <b>BALANCE SUMMARY</b>\n\n` +
    `📊 <b>Portfolio Value:</b> $${portfolio.totalValue.toFixed(2)}\n` +
    `💵 <b>Total Invested:</b> $${portfolio.totalInvested.toFixed(2)}\n` +
    `📈 <b>P&L:</b> $${(portfolio.totalValue - portfolio.totalInvested).toFixed(2)}\n\n` +
    `💡 <i>Note: This shows portfolio balance. For wallet USDC balance, check your wallet directly.</i>`;
  
  await sendTelegramMessage(chatId, message);
}

// Handle /snipes command
async function handleSnipes(chatId) {
  const snipes = loadSnipes();
  
  if (snipes.length === 0) {
    await sendTelegramMessage(chatId, '📭 <b>NO SNIPES FOUND</b>\n\nNo snipes have been recorded yet.');
    return;
  }
  
  let message = `🎯 <b>RECENT SNIPES</b>\n\n`;
  
  // Show last 10 snipes
  const recentSnipes = snipes.slice(-10).reverse();
  
  recentSnipes.forEach((snipe, index) => {
    const date = new Date(snipe.timestamp).toLocaleDateString();
    const time = new Date(snipe.timestamp).toLocaleTimeString();
    
    message += `${index + 1}. <b>${snipe.token.symbol}</b> (${snipe.token.name})\n`;
    message += `   💰 Amount: $${snipe.snipe.amountUsdt.toFixed(2)} USDT\n`;
    message += `   🎯 Received: ${parseFloat(snipe.snipe.tokensReceived).toLocaleString()} ${snipe.token.symbol}\n`;
    message += `   💲 Price: $${snipe.token.price.toFixed(8)}\n`;
    message += `   📅 Date: ${date} ${time}\n`;
    message += `   🔗 <a href="https://solscan.io/tx/${snipe.transaction}">View TX</a>\n\n`;
  });
  
  message += `📊 <b>Total Snipes:</b> ${snipes.length}`;
  
  await sendTelegramMessage(chatId, message);
}

// Handle /stats command
async function handleStats(chatId) {
  const portfolio = loadPortfolio();
  const snipes = loadSnipes();
  
  const totalInvested = portfolio.totalInvested;
  const totalValue = portfolio.totalValue;
  const pnl = totalValue - totalInvested;
  const pnlPercent = totalInvested > 0 ? (pnl / totalInvested * 100) : 0;
  
  // Calculate additional stats
  const successfulSnipes = snipes.length;
  const avgInvestment = successfulSnipes > 0 ? totalInvested / successfulSnipes : 0;
  
  let message = `📈 <b>PORTFOLIO STATISTICS</b>\n\n`;
  message += `💰 <b>Total Invested:</b> $${totalInvested.toFixed(2)}\n`;
  message += `💎 <b>Current Value:</b> $${totalValue.toFixed(2)}\n`;
  message += `📈 <b>Total P&L:</b> $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)\n`;
  message += `🎯 <b>Total Tokens:</b> ${portfolio.tokens.length}\n`;
  message += `🚀 <b>Total Snipes:</b> ${successfulSnipes}\n`;
  message += `📊 <b>Avg Investment:</b> $${avgInvestment.toFixed(2)}\n\n`;
  
  if (portfolio.tokens.length > 0) {
    // Find best and worst performers
    const tokensWithPnL = portfolio.tokens.map(token => {
      const tokensReceived = parseFloat(token.tokensReceived);
      const currentPrice = token.currentPrice && !isNaN(token.currentPrice) && token.currentPrice > 0 && token.currentPrice < 1_000_000 ? token.currentPrice : 0;
      const currentValue = (isFinite(tokensReceived) && tokensReceived > 0) ? currentPrice * tokensReceived : 0;
      const tokenPnL = currentValue - token.amountUsdt;
      const tokenPnLPercent = token.amountUsdt > 0 ? (tokenPnL / token.amountUsdt * 100) : 0;
      if (!(isFinite(tokensReceived) && tokensReceived > 0 && currentPrice > 0 && currentPrice < 1_000_000)) {
        console.log(`[SKIP] Invalid token in stats:`, {
          symbol: token.symbol,
          mint: token.mint,
          tokensReceived: token.tokensReceived,
          currentPrice: token.currentPrice
        });
      }
      return { ...token, pnl: tokenPnL, pnlPercent: tokenPnLPercent };
    });
    
    const bestToken = tokensWithPnL.reduce((best, current) => 
      current.pnlPercent > best.pnlPercent ? current : best
    );
    
    const worstToken = tokensWithPnL.reduce((worst, current) => 
      current.pnlPercent < worst.pnlPercent ? current : worst
    );
    
    message += `🏆 <b>Best Performer:</b> ${bestToken.symbol} (${bestToken.pnlPercent.toFixed(2)}%)\n`;
    message += `📉 <b>Worst Performer:</b> ${worstToken.symbol} (${worstToken.pnlPercent.toFixed(2)}%)\n`;
  }
  
  message += `\n⏰ <b>Updated:</b> ${new Date().toLocaleString()}`;
  
  await sendTelegramMessage(chatId, message);
}

// Handle /price command
async function handlePrice(chatId, args) {
  if (!args || args.length === 0) {
    await sendTelegramMessage(chatId, '❌ <b>ERROR</b>\n\nPlease provide a token mint address.\n\n<b>Usage:</b> <code>/price [token_mint]</code>\n\n<b>Example:</b> <code>/price EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v</code>');
    return;
  }
  
  const tokenMint = args[0];
  
  try {
    const price = await getTokenPrice(tokenMint);
    
    if (price === null) {
      await sendTelegramMessage(chatId, `❌ <b>ERROR</b>\n\nCould not fetch price for token:\n<code>${tokenMint}</code>\n\nPlease check if the mint address is correct.`);
      return;
    }
    
    const message = `💲 <b>TOKEN PRICE</b>\n\n` +
      `📍 <b>Mint:</b> <code>${tokenMint}</code>\n` +
      `💰 <b>Price:</b> $${price.toFixed(8)}\n` +
      `⏰ <b>Updated:</b> ${new Date().toLocaleString()}`;
    
    await sendTelegramMessage(chatId, message);
    
  } catch (error) {
    await sendTelegramMessage(chatId, `❌ <b>ERROR</b>\n\nFailed to fetch price: ${error.message}`);
  }
}

// Handle /info command
async function handleInfo(chatId, args) {
  if (!args || args.length === 0) {
    await sendTelegramMessage(chatId, '❌ <b>ERROR</b>\n\nPlease provide a token mint address.\n\n<b>Usage:</b> <code>/info [token_mint]</code>\n\n<b>Example:</b> <code>/info EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v</code>');
    return;
  }
  
  const tokenMint = args[0];
  
  try {
    // Get token info from Birdeye
    const url = `https://public-api.birdeye.so/defi/token_metadata?address=${tokenMint}`;
    const response = await fetch(url, {
      headers: {
        'X-API-KEY': BIRDEYE_API_KEY,
      },
    });
    
    if (!response.ok) {
      await sendTelegramMessage(chatId, `❌ <b>ERROR</b>\n\nCould not fetch token info for:\n<code>${tokenMint}</code>\n\nPlease check if the mint address is correct.`);
      return;
    }
    
    const data = await response.json();
    const token = data.data;
    
    if (!token) {
      await sendTelegramMessage(chatId, `❌ <b>ERROR</b>\n\nToken not found:\n<code>${tokenMint}</code>`);
      return;
    }
    
    const message = `📋 <b>TOKEN INFORMATION</b>\n\n` +
      `🪙 <b>Symbol:</b> ${token.symbol}\n` +
      `📝 <b>Name:</b> ${token.name}\n` +
      `📍 <b>Mint:</b> <code>${tokenMint}</code>\n` +
      `💲 <b>Price:</b> $${token.price ? token.price.toFixed(8) : 'N/A'}\n` +
      `💰 <b>Market Cap:</b> $${token.mc ? token.mc.toLocaleString() : 'N/A'}\n` +
      `💧 <b>Liquidity:</b> $${token.liquidity ? token.liquidity.toLocaleString() : 'N/A'}\n` +
      `📊 <b>Volume 24h:</b> $${token.volume24h ? token.volume24h.toLocaleString() : 'N/A'}\n` +
      `🔗 <b>Website:</b> ${token.website || 'N/A'}\n` +
      `⏰ <b>Updated:</b> ${new Date().toLocaleString()}`;
    
    await sendTelegramMessage(chatId, message);
    
  } catch (error) {
    await sendTelegramMessage(chatId, `❌ <b>ERROR</b>\n\nFailed to fetch token info: ${error.message}`);
  }
}

// Handle /status command
async function handleStatus(chatId) {
  const message = `🤖 <b>BOT STATUS</b>\n\n` +
    `✅ <b>Status:</b> Online\n` +
    `📊 <b>Portfolio:</b> ${loadPortfolio().tokens.length} tokens\n` +
    `🚀 <b>Total Snipes:</b> ${loadSnipes().length}\n` +
    `⏰ <b>Uptime:</b> ${new Date().toLocaleString()}\n\n` +
    `💡 <i>Bot is running and monitoring for new tokens!</i>`;
  
  await sendTelegramMessage(chatId, message);
}

// Process incoming messages
async function processMessage(message) {
  const chatId = message.chat.id;
  const text = message.text || '';
  const username = message.from?.username || message.from?.first_name || 'User';
  
  console.log(`📱 Received message from ${username}: ${text}`);
  
  // Handle commands
  if (text.startsWith('/')) {
    const parts = text.split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    switch (command) {
      case '/start':
        await handleStart(chatId, username);
        break;
      case '/help':
        await handleHelp(chatId);
        break;
      case '/portfolio':
        await handlePortfolio(chatId);
        break;
      case '/balance':
        await handleBalance(chatId);
        break;
      case '/snipes':
        await handleSnipes(chatId);
        break;
      case '/stats':
        await handleStats(chatId);
        break;
      case '/price':
        await handlePrice(chatId, args);
        break;
      case '/info':
        await handleInfo(chatId, args);
        break;
      case '/status':
        await handleStatus(chatId);
        break;
      default:
        await sendTelegramMessage(chatId, `❓ <b>UNKNOWN COMMAND</b>\n\nCommand "${command}" not recognized.\n\nUse /help to see available commands.`);
        break;
    }
  } else {
    // Handle non-command messages
    await sendTelegramMessage(chatId, `💬 <b>Hello ${username}!</b>\n\nI'm your Solana sniping bot assistant. Use /help to see what I can do for you!`);
  }
}

// Main bot loop
async function runBot() {
  console.log('🤖 Starting Telegram bot...');
  
  // Get bot info
  botInfo = await getBotInfo();
  if (botInfo) {
    console.log(`✅ Bot connected: @${botInfo.username}`);
  } else {
    console.error('❌ Failed to get bot info');
    process.exit(1);
  }
  
  console.log('🔄 Starting message polling...');
  
  // Poll for messages
  while (true) {
    try {
      const updates = await getUpdates();
      
      for (const update of updates) {
        lastUpdateId = update.update_id;
        
        if (update.message) {
          await processMessage(update.message);
        }
      }
      
      // Small delay between polls
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error('Error in bot loop:', error);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Telegram bot...');
  process.exit(0);
});

// Start the bot
runBot().catch(console.error); 