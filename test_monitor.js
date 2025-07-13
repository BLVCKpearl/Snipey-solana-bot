// Simple test script to verify real-time pool monitoring works
const { RealTimePoolMonitor } = require('./realtime_pool_monitor');

console.log('🧪 Testing Real-Time Pool Monitor');
console.log('This will listen for new Raydium pools for 60 seconds...');
console.log('Press Ctrl+C to stop early');
console.log('='.repeat(50));

const monitor = new RealTimePoolMonitor(async (poolInfo) => {
    console.log('🎯 NEW POOL DETECTED!');
    console.log('├─ Token Address:', poolInfo.address);
    console.log('├─ Base Mint:', poolInfo.baseMint);
    console.log('├─ Quote Mint:', poolInfo.quoteMint);
    console.log('├─ Detection Method:', poolInfo.detectionMethod);
    console.log('├─ Signature:', poolInfo.signature || 'N/A');
    console.log('└─ Time:', new Date().toLocaleTimeString());
    console.log('='.repeat(50));
});

async function runTest() {
    try {
        await monitor.startMonitoring();
        
        // Stop after 60 seconds
        setTimeout(() => {
            console.log('\n⏱️ Test complete! Monitor worked for 60 seconds');
            console.log('✅ If you saw any pools detected above, the monitor is working correctly');
            console.log('❌ If no pools were detected, either:');
            console.log('   - No new pools were created during test period (normal)');
            console.log('   - RPC connection issue (check your SOLANA_RPC endpoint)');
            process.exit(0);
        }, 60000);
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

// Handle Ctrl+C
process.on('SIGINT', () => {
    console.log('\n🛑 Test stopped by user');
    console.log('✅ Monitor setup appears to be working (no errors during initialization)');
    monitor.stopMonitoring();
    process.exit(0);
});

runTest();