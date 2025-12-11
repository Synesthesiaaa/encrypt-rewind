// test-account-api.js - Test Account API v1 authentication
require('dotenv').config();
const axios = require('axios');

async function testAccountAPI() {
  const apiKey = process.env.RIOT_API_KEY;
  const region = process.env.RIOT_API_REGION || 'sea';
  
  console.log('🔍 Testing Riot Account API v1 Authentication...\n');
  
  if (!apiKey) {
    console.error('❌ RIOT_API_KEY is not set in .env file!');
    return;
  }
  
  // Clean the API key
  const cleanApiKey = apiKey.trim().replace(/[\x00-\x1F\x7F-\x9F]/g, '');
  
  console.log(`✅ API Key found (length: ${cleanApiKey.length} characters)`);
  console.log(`   Preview: ${cleanApiKey.substring(0, 8)}...${cleanApiKey.substring(cleanApiKey.length - 4)}`);
  console.log(`✅ Region: ${region}\n`);
  
  // Determine regional routing value
  const platformToRegional = {
    'na1': 'americas', 'br1': 'americas', 'la1': 'americas', 'la2': 'americas',
    'euw1': 'europe', 'eun1': 'europe', 'ru': 'europe', 'tr1': 'europe',
    'kr': 'asia', 'jp1': 'asia',
    'oc1': 'sea', 'sg2': 'sea', 'tw2': 'sea', 'vn2': 'sea'
  };
  
  const regionalRouting = platformToRegional[region.toLowerCase()] || 
    (['americas', 'europe', 'asia', 'sea'].includes(region.toLowerCase()) ? region.toLowerCase() : 'sea');
  
  console.log(`📍 Using regional routing: ${regionalRouting}\n`);
  
  // Test with a known Riot ID (you can change this)
  const testGameName = 'Encryptions';
  const testTagLine = 'Ynaaa';
  
  console.log(`🧪 Testing Account API with: ${testGameName}#${testTagLine}\n`);
  
  const url = `https://${regionalRouting}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(testGameName)}/${encodeURIComponent(testTagLine)}`;
  
  console.log(`   URL: ${url}`);
  console.log(`   Header: X-Riot-Token: ${cleanApiKey.substring(0, 8)}...${cleanApiKey.substring(cleanApiKey.length - 4)}\n`);
  
  // Validate API key is not empty
  if (!cleanApiKey || cleanApiKey.length === 0) {
    console.error('❌ API Key is empty after cleaning!');
    console.error('   Please check your .env file and ensure RIOT_API_KEY is set correctly.');
    return;
  }
  
  // Build headers
  const requestHeaders = {
    'X-Riot-Token': cleanApiKey,
    'Accept': 'application/json'
  };
  
  console.log(`   Header check: X-Riot-Token is ${requestHeaders['X-Riot-Token'] ? 'SET' : 'MISSING'}`);
  console.log(`   Header value length: ${requestHeaders['X-Riot-Token']?.length || 0}\n`);
  
  try {
    const response = await axios.get(url, {
      headers: requestHeaders,
      timeout: 30000,
      validateStatus: function (status) {
        return status < 500; // Don't throw for 4xx errors
      }
    });
    
    if (response.status === 200) {
      console.log('✅ Account API authentication SUCCESSFUL!');
      console.log(`   PUUID: ${response.data.puuid}`);
      console.log(`   Game Name: ${response.data.gameName}`);
      console.log(`   Tag Line: ${response.data.tagLine}`);
    } else {
      console.error(`❌ Unexpected status: ${response.status}`);
      console.error(`   Response:`, JSON.stringify(response.data, null, 2));
    }
    
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      console.error(`❌ Account API test FAILED (Status: ${status})`);
      console.error(`   Response data:`, JSON.stringify(data, null, 2));
      
      if (status === 403) {
        console.error('\n🔑 Authentication Failed - Possible Issues:');
        console.error('   1. API key is invalid or expired');
        console.error('   2. API key does not have Account API v1 permissions');
        console.error('   3. API key type mismatch (needs Personal API Key)');
        console.error('   4. Regional routing mismatch');
        console.error('\n📝 Solutions:');
        console.error('   1. Go to https://developer.riotgames.com/');
        console.error('   2. Check your API key status and expiration');
        console.error('   3. Generate a new Personal API Key');
        console.error('   4. Ensure the key has access to Account API v1');
        console.error('   5. Verify the region matches your account region');
      } else if (status === 404) {
        console.log('⚠️  Account not found (this is OK - API key works!)');
        console.log('   The 404 means your API key is valid, but the test account doesn\'t exist.');
      } else if (status === 429) {
        console.error('⚠️  Rate limit exceeded. Wait a moment and try again.');
      }
    } else if (error.request) {
      console.error('❌ Network error - could not reach Riot API');
      console.error('   Error:', error.message);
    } else {
      console.error('❌ Error:', error.message);
    }
  }
}

testAccountAPI();

