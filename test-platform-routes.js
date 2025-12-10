// test-platform-routes.js - Test all platform routing values
require('dotenv').config();
const axios = require('axios');

const validPlatforms = ['br1', 'eun1', 'euw1', 'jp1', 'kr', 'la1', 'la2', 'na1', 'oc1', 'tr1', 'ru', 'ph2', 'sg2', 'th2', 'tw2', 'vn2'];

const apiKey = process.env.RIOT_API_KEY;

if (!apiKey) {
  console.error('❌ RIOT_API_KEY is not set in .env file!');
  process.exit(1);
}

async function testPlatform(platform) {
  const url = `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-name/TestSummonerName12345`;
  
  try {
    const response = await axios.get(url, {
      headers: {
        'X-Riot-Token': apiKey,
        'Accept': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });
    
    // If we get a response (even 404), the platform is working
    return { platform, status: 'working', statusCode: response.status };
  } catch (error) {
    if (error.response) {
      // Got a response (even if 404), platform is working
      return { platform, status: 'working', statusCode: error.response.status };
    } else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return { platform, status: 'timeout', error: 'Request timed out' };
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return { platform, status: 'unreachable', error: error.code };
    } else {
      return { platform, status: 'error', error: error.message };
    }
  }
}

async function testAllPlatforms() {
  console.log('🔍 Testing all platform routing values...\n');
  console.log(`Testing ${validPlatforms.length} platforms...\n`);
  
  const results = [];
  
  for (const platform of validPlatforms) {
    process.stdout.write(`Testing ${platform}... `);
    const result = await testPlatform(platform);
    results.push(result);
    
    if (result.status === 'working') {
      console.log(`✅ Working (Status: ${result.statusCode})`);
    } else {
      console.log(`❌ ${result.status.toUpperCase()}: ${result.error || 'Unknown error'}`);
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  
  const working = results.filter(r => r.status === 'working');
  const notWorking = results.filter(r => r.status !== 'working');
  
  console.log(`\n✅ Working platforms (${working.length}):`);
  working.forEach(r => console.log(`   - ${r.platform}`));
  
  console.log(`\n❌ Non-responsive platforms (${notWorking.length}):`);
  notWorking.forEach(r => console.log(`   - ${r.platform}: ${r.status} - ${r.error || 'Unknown'}`));
  
  console.log('\n' + '='.repeat(60));
  console.log('💡 Recommended valid platforms:');
  console.log(working.map(r => `'${r.platform}'`).join(', '));
  console.log('='.repeat(60));
  
  return { working, notWorking };
}

testAllPlatforms()
  .then(({ working, notWorking }) => {
    if (notWorking.length > 0) {
      console.log('\n⚠️  Some platforms are not responding. Consider removing them from the valid platforms list.');
    } else {
      console.log('\n✅ All platforms are responding correctly!');
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error testing platforms:', error);
    process.exit(1);
  });

