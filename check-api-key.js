// check-api-key.js - Diagnostic script for Riot API key
require('dotenv').config();
const axios = require('axios');

async function checkAPIKey() {
  const apiKey = process.env.RIOT_API_KEY;
  const region = process.env.RIOT_API_REGION || 'sea';
  
  console.log('🔍 Checking Riot API Configuration...\n');
  
  // Check if API key exists
  if (!apiKey) {
    console.error('❌ RIOT_API_KEY is not set in .env file!');
    console.log('\n📝 To fix this:');
    console.log('   1. Create a .env file in the project root');
    console.log('   2. Add: RIOT_API_KEY=your_api_key_here');
    console.log('   3. Get your API key from: https://developer.riotgames.com/');
    return;
  }
  
  console.log(`✅ API Key found (length: ${apiKey.length} characters)`);
  console.log(`✅ Region: ${region}\n`);
  
  // Test API key with a simple request
  console.log('🧪 Testing API key with Riot API...\n');
  
  try {
    // Try to get a summoner (using a known summoner name for testing)
    // Extract just the name part if it includes #Tag
    const testSummonerName = 'Encryptions';
    const nameOnly = testSummonerName.split('#')[0].trim();
    const url = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-name/${encodeURIComponent(nameOnly)}`;
    
    console.log(`   Testing endpoint: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'X-Riot-Token': apiKey,
        'Accept': 'application/json'
      }
    });
    
    console.log('✅ API Key is VALID!');
    console.log(`   Summoner found: ${response.data.name} (Level ${response.data.summonerLevel})`);
    
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      console.error(`❌ API Key test FAILED (Status: ${status})`);
      
      if (status === 403) {
        console.error('\n🔑 API Key Issues:');
        console.error('   - The API key is invalid or expired');
        console.error('   - The API key may not have the required permissions');
        console.error('   - The API key might be for a different region');
        console.error('\n📝 To fix this:');
        console.error('   1. Go to https://developer.riotgames.com/');
        console.error('   2. Log in and check your API keys');
        console.error('   3. Generate a new API key if needed');
        console.error('   4. Make sure the key has "Personal API Key" type');
        console.error('   5. Update your .env file with the new key');
      } else if (status === 404) {
        console.log('⚠️  Summoner not found (this is OK - API key works!)');
        console.log('   The 404 means your API key is valid, but the test summoner doesn\'t exist.');
      } else if (status === 429) {
        console.error('⚠️  Rate limit exceeded. Wait a moment and try again.');
      } else {
        console.error(`   Error: ${JSON.stringify(data, null, 2)}`);
      }
    } else if (error.request) {
      console.error('❌ Network error - could not reach Riot API');
      console.error('   Check your internet connection');
    } else {
      console.error('❌ Error:', error.message);
    }
  }
}

checkAPIKey();

