# 🚀 Solana Token Sniping Bot

A powerful Solana token sniping bot that monitors new token listings and automatically snipes promising opportunities using USDT.

## ✨ Features

- 🔍 **Real-time token monitoring** via Birdeye API
- 🎯 **Automatic sniping** with Jupiter DEX integration
- 🛡️ **Advanced safety checks** (honeypot detection, authority checks)
- 📊 **Portfolio management** with P&L tracking
- 📱 **Telegram integration** for notifications and commands
- ⚡ **Fast execution** with optimized filters

## 📋 Prerequisites

- Node.js (v16 or higher)
- Solana wallet with private key
- Birdeye API key
- Telegram bot (optional)

## 🚀 Quick Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Setup Script
```bash
node setup_bot.js
```

This will guide you through entering your credentials and create a `.env` file.

### 3. Manual Setup (Alternative)
Create a `.env` file with your credentials:
```env
# Solana Configuration
PRIVATE_KEY_BASE58=your_private_key_here
SOLANA_RPC=https://api.mainnet-beta.solana.com

# API Keys
BIRDEYE_API_KEY=your_birdeye_api_key

# Telegram Configuration (Optional)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id
```

## 💰 Funding Requirements

Before running the bot, ensure your wallet has:
- **SOL:** At least 0.1 SOL for transaction fees (~$4-5)
- **USDT:** At least $10-20 for sniping (configurable)

## 🎯 Usage

### Start Sniping Bot
```bash
node sniper_birdeye.js
```

### Start Telegram Bot (Optional)
```bash
node telegram_bot.js
```

## 📱 Telegram Commands

If you have Telegram set up, you can use these commands:

- `/portfolio` - View your portfolio with P&L
- `/balance` - Check your balances
- `/snipes` - View recent snipes
- `/stats` - Get portfolio statistics
- `/price [token_mint]` - Get token price
- `/info [token_mint]` - Get token information
- `/status` - Check bot status

## ⚙️ Configuration

### Sniping Settings
Edit `sniper_birdeye.js` to customize:
- `SNIPE_AMOUNT_USDT` - Amount to snipe per token (default: $1)
- `MIN_LIQUIDITY` - Minimum liquidity requirement
- `MIN_MARKET_CAP` - Minimum market cap
- `MAX_MARKET_CAP` - Maximum market cap
- `MONITOR_INTERVAL` - How often to check for new tokens

### Safety Filters
The bot includes multiple safety checks:
- ✅ Mint authority renounced
- ✅ Freeze authority renounced
- ✅ Honeypot detection
- ✅ Supply validation
- ✅ Holder distribution analysis

## 📊 Portfolio Tracking

The bot automatically tracks:
- All sniped tokens
- Current P&L
- Transaction history
- Portfolio value

Data is saved in:
- `portfolio.json` - Portfolio data
- `snipes_log.json` - Snipe history

## 🔧 Troubleshooting

### Common Issues

1. **"Missing PRIVATE_KEY_BASE58"**
   - Ensure your `.env` file exists and contains the correct private key

2. **"Insufficient USDT balance"**
   - Fund your wallet with USDT

3. **"Insufficient SOL balance"**
   - Fund your wallet with SOL for transaction fees

4. **"Failed to fetch from Birdeye"**
   - Check your Birdeye API key
   - Ensure you have sufficient API credits

### Getting API Keys

- **Birdeye API:** Visit [Birdeye](https://birdeye.so/) and get your API key
- **Telegram Bot:** Message @BotFather on Telegram to create a bot

## ⚠️ Important Notes

- **Never share your private key** or `.env` file
- **Start with small amounts** to test the bot
- **Monitor the bot** regularly to ensure it's working correctly
- **This is for educational purposes** - use at your own risk

## 📈 Performance Tips

- Use a reliable RPC endpoint for better performance
- Monitor your API usage to avoid rate limits
- Keep your bot running 24/7 for best results
- Regularly check and adjust your filters

## 🤝 Support

For issues or questions:
1. Check the troubleshooting section
2. Review your configuration
3. Ensure all prerequisites are met

## 📄 License

This project is for educational purposes. Use at your own risk.

---

**Happy Sniping! 🚀** 