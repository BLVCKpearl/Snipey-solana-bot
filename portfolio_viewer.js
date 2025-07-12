require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');

// Configuration
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const PORTFOLIO_FILE = 'portfolio.json';

if (!BIRDEYE_API_KEY) {
  console.error('Missing BIRDEYE_API_KEY in .env');
  process.exit(1);
}

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('Missing Telegram configuration in .env');
  process.exit(1);
}

async function loadPortfolio() {
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

async function sendTelegramMessage(message) {
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
      return false;
    }
    
    console.log('✅ Portfolio sent to Telegram!');
    return true;
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    return false;
  }
}

function formatPortfolioMessage(portfolio, updatedTokens) {
  const totalInvested = portfolio.totalInvested;
  let currentTotalValue = 0;
  let totalPnL = 0;
  
  // Calculate current values and P&L
  updatedTokens.forEach(token => {
    if (token.currentPrice) {
      const currentValue = parseFloat(token.tokensReceived) * token.currentPrice;
      const tokenPnL = currentValue - token.amountUsdc;
      currentTotalValue += currentValue;
      totalPnL += tokenPnL;
    }
  });
  
  const totalPnLPercent = totalInvested > 0 ? (totalPnL / totalInvested * 100) : 0;
  
  let message = `📊 <b>PORTFOLIO OVERVIEW</b>\n\n`;
  message += `💰 <b>Total Invested:</b> $${totalInvested.toFixed(2)}\n`;
  message += `💎 <b>Current Value:</b> $${currentTotalValue.toFixed(2)}\n`;
  message += `📈 <b>Total P&L:</b> $${totalPnL.toFixed(2)} (${totalPnLPercent.toFixed(2)}%)\n`;
  message += `🎯 <b>Total Tokens:</b> ${portfolio.tokens.length}\n\n`;
  
  if (updatedTokens.length > 0) {
    message += `📋 <b>HOLDINGS:</b>\n\n`;
    
    updatedTokens.forEach((token, index) => {
      const currentValue = token.currentPrice ? parseFloat(token.tokensReceived) * token.currentPrice : 0;
      const tokenPnL = currentValue - token.amountUsdc;
      const tokenPnLPercent = token.amountUsdc > 0 ? (tokenPnL / token.amountUsdc * 100) : 0;
      
      message += `${index + 1}. <b>${token.symbol}</b> (${token.name})\n`;
      message += `   💰 Invested: $${token.amountUsdc.toFixed(2)}\n`;
      message += `   🎯 Amount: ${parseFloat(token.tokensReceived).toLocaleString()} ${token.symbol}\n`;
      message += `   💲 Price: $${token.currentPrice ? token.currentPrice.toFixed(8) : 'N/A'}\n`;
      message += `   💎 Value: $${currentValue.toFixed(2)}\n`;
      message += `   📈 P&L: $${tokenPnL.toFixed(2)} (${tokenPnLPercent.toFixed(2)}%)\n`;
      message += `   📅 Sniped: ${new Date(token.snipedAt).toLocaleDateString()}\n\n`;
    });
  } else {
    message += `📭 <b>No tokens in portfolio</b>\n\n`;
  }
  
  message += `⏰ <b>Updated:</b> ${new Date().toLocaleString()}`;
  
  return message;
}

async function viewPortfolio() {
  console.log('📊 Loading portfolio...');
  
  const portfolio = await loadPortfolio();
  
  if (portfolio.tokens.length === 0) {
    console.log('📭 No tokens found in portfolio');
    await sendTelegramMessage('📭 <b>PORTFOLIO EMPTY</b>\n\nNo tokens found in your portfolio.');
    return;
  }
  
  console.log(`Found ${portfolio.tokens.length} tokens in portfolio`);
  console.log('🔄 Fetching current prices...');
  
  // Update prices for all tokens
  const updatedTokens = [];
  for (const token of portfolio.tokens) {
    console.log(`   Fetching price for ${token.symbol}...`);
    const currentPrice = await getTokenPrice(token.mint);
    updatedTokens.push({
      ...token,
      currentPrice: currentPrice
    });
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Display in console
  console.log('\n📊 PORTFOLIO SUMMARY:');
  console.log('='.repeat(80));
  
  const totalInvested = portfolio.totalInvested;
  let currentTotalValue = 0;
  let totalPnL = 0;
  
  updatedTokens.forEach((token, index) => {
    const currentValue = token.currentPrice ? parseFloat(token.tokensReceived) * token.currentPrice : 0;
    const tokenPnL = currentValue - token.amountUsdc;
    const tokenPnLPercent = token.amountUsdc > 0 ? (tokenPnL / token.amountUsdc * 100) : 0;
    
    currentTotalValue += currentValue;
    totalPnL += tokenPnL;
    
    console.log(`${index + 1}. ${token.symbol} (${token.name})`);
    console.log(`   Invested: $${token.amountUsdc.toFixed(2)}`);
    console.log(`   Amount: ${parseFloat(token.tokensReceived).toLocaleString()} ${token.symbol}`);
    console.log(`   Price: $${token.currentPrice ? token.currentPrice.toFixed(8) : 'N/A'}`);
    console.log(`   Value: $${currentValue.toFixed(2)}`);
    console.log(`   P&L: $${tokenPnL.toFixed(2)} (${tokenPnLPercent.toFixed(2)}%)`);
    console.log(`   Sniped: ${new Date(token.snipedAt).toLocaleDateString()}`);
    console.log('');
  });
  
  const totalPnLPercent = totalInvested > 0 ? (totalPnL / totalInvested * 100) : 0;
  
  console.log('📈 OVERALL SUMMARY:');
  console.log(`   Total Invested: $${totalInvested.toFixed(2)}`);
  console.log(`   Current Value: $${currentTotalValue.toFixed(2)}`);
  console.log(`   Total P&L: $${totalPnL.toFixed(2)} (${totalPnLPercent.toFixed(2)}%)`);
  
  // Send to Telegram
  console.log('\n📱 Sending to Telegram...');
  const telegramMessage = formatPortfolioMessage(portfolio, updatedTokens);
  await sendTelegramMessage(telegramMessage);
  
  console.log('\n✅ Portfolio view completed!');
}

// Run the portfolio viewer
viewPortfolio().catch(console.error); 