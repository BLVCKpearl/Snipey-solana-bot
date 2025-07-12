# Telegram Setup Guide

## How to Set Up Telegram Notifications

### 1. Create a Telegram Bot
1. Open Telegram and search for "@BotFather"
2. Send `/newbot` command
3. Follow the instructions to create your bot
4. Save the bot token (looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Get Your Chat ID
1. Send a message to your bot
2. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
3. Find your `chat_id` in the response (it's a number like `123456789`)

### 3. Add to Your .env File
```
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

### 4. Test Notifications
The bot will now send you notifications for:
- ✅ Successful snipes
- ❌ Errors and issues
- 📊 Portfolio updates

### Example Notification
```
🚀 SUCCESSFUL SNIPE!

💰 Token: BONK (Bonk)
📍 Mint: DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263
💵 Amount: $1.0 USDC
🎯 Received: 1,234,567 BONK
💲 Price: $0.00000081
💧 Liquidity: $1,234,567
📊 Market Cap: $123,456

🔗 Transaction: View on Solscan

📈 Portfolio Summary:
   • Total Tokens: 5
   • Total Invested: $5.00
   • Current Value: $6.25
   • P&L: $1.25 (25.00%)

⏰ Time: 7/12/2025, 11:45:30 AM
``` 

## 📱 **Available Telegram Commands**

### 📊 **Portfolio Commands:**
- `/portfolio` - View your current portfolio with real-time P&L
- `/balance` - Check your portfolio balance summary
- `/snipes` - View your recent snipes (last 10)
- `/stats` - Get detailed portfolio statistics

### 🔍 **Token Commands:**
- `/price [token_mint]` - Get current price of any token
- `/info [token_mint]` - Get detailed token information

### ⚙️ **Bot Commands:**
- `/start` - Welcome message and command list
- `/help` - Show help message
- `/status` - Check bot status and uptime

##  **How to Use:**

1. **Start the bot:**
   ```bash
   node telegram_bot.js
   ```

2. **Send commands in Telegram:**
   - Just type any command like `/portfolio` or `/stats`
   - For token commands, include the mint address: `/price EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

##  **Example Commands:**

```
<code_block_to_apply_changes_from>
```

## 🔧 **Features:**

- **Real-time portfolio tracking** with live price updates
- **P&L calculations** for each token and overall portfolio
- **Snipe history** with transaction links
- **Token price lookup** for any Solana token
- **Detailed token information** from Birdeye API
- **Portfolio statistics** including best/worst performers
- **Bot status monitoring**

The bot will respond to any message you send and provide helpful information about your sniping activities. Just start it with `node telegram_bot.js` and you'll be able to interact with it through Telegram! 
starting the bots
### **Method 1: Process Check (Terminal)**
```bash
# Check all bot processes
ps aux | grep -E "(sniper|telegram|portfolio)" | grep -v grep

# Check specific bot
ps aux | grep "sniper_birdeye.js" | grep -v grep
ps aux | grep "telegram_bot.js" | grep -v grep
```

### **Method 2: Telegram Bot Commands**
Since your Telegram bot is running, you can use these commands:
- `/status` - Check bot status
- `/portfolio` - See if portfolio data is being updated
- `/snipes` - Check if new snipes are being recorded

### **Method 3: Check Log Files**
```bash
# Check if log files are being updated
ls -la *.json
tail -f portfolio.json
tail -f snipes.json
```

##  **To Start Your Sniping Bot:**

If you want to start the main sniping bot, run:
```bash
node sniper_birdeye.js
```

## 📱 **Quick Status Check:**

You can also send `/status` to your Telegram bot right now to see:
- Bot uptime
- Portfolio token count
- Total snipes recorded
- Current status

**Your Telegram bot is ready to respond to commands!** Try sending `/status` or `/portfolio` to see your current data. 