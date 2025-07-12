#!/usr/bin/env node

const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🚀 Solana Sniping Bot Setup');
console.log('============================\n');

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupBot() {
  console.log('This will help you set up your sniping bot with your own credentials.\n');
  
  // Get user inputs
  const privateKey = await question('Enter your wallet private key (base58): ');
  const birdeyeApiKey = await question('Enter your Birdeye API key: ');
  const telegramBotToken = await question('Enter your Telegram bot token (or press Enter to skip): ');
  const telegramChatId = await question('Enter your Telegram chat ID (or press Enter to skip): ');
  
  // Create .env content
  let envContent = `# Solana Configuration
PRIVATE_KEY_BASE58=${privateKey}
SOLANA_RPC=https://api.mainnet-beta.solana.com

# API Keys
BIRDEYE_API_KEY=${birdeyeApiKey}

# Telegram Configuration (Optional)
TELEGRAM_BOT_TOKEN=${telegramBotToken || ''}
TELEGRAM_CHAT_ID=${telegramChatId || ''}
`;

  // Write .env file
  fs.writeFileSync('.env', envContent);
  
  console.log('\n✅ Setup complete!');
  console.log('📁 .env file created with your credentials');
  console.log('\n📋 Next steps:');
  console.log('1. Fund your wallet with SOL (for fees) and USDT (for sniping)');
  console.log('2. Run: node sniper_birdeye.js');
  console.log('3. For Telegram bot: node telegram_bot.js');
  
  rl.close();
}

setupBot().catch(console.error); 