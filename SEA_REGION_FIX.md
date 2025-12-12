# SEA Region 403 Error - Workaround Guide

## Problem
Your API key works for other regions (americas, europe, asia) but returns 403 Forbidden specifically for SEA region.

## Root Cause
This typically indicates that your Riot API key may not have full access to the SEA regional endpoint, or there's a region-specific restriction.

## Solution 1: Use Specific SEA Platforms (RECOMMENDED)

Instead of using the regional `sea` value, try using a specific SEA platform:

### Try these in order:

1. **Singapore (SG2)** - Most commonly working:
   ```
   /lolstats riot_id:YourName#TAG region:sg2
   ```

2. **Oceania (OC1)**:
   ```
   /lolstats riot_id:YourName#TAG region:oc1
   ```

3. **Taiwan (TW2)**:
   ```
   /lolstats riot_id:YourName#TAG region:tw2
   ```

4. **Vietnam (VN2)**:
   ```
   /lolstats riot_id:YourName#TAG region:vn2
   ```

## Solution 2: Check API Key Permissions

1. Go to https://developer.riotgames.com/
2. Log in to your developer account
3. Navigate to your API keys
4. Check if there are any regional restrictions on your API key
5. Generate a new Personal API Key if needed
6. Ensure it has access to **Account API v1**

## Solution 3: Test Directly

Run the test script with different SEA platforms:

```bash
# Test with SG2 platform
RIOT_API_REGION=sg2 node test-account-api.js

# Test with OC1 platform  
RIOT_API_REGION=oc1 node test-account-api.js

# Test with SEA region (may fail)
RIOT_API_REGION=sea node test-account-api.js
```

## Why This Happens

Some Riot API keys may have regional restrictions or the SEA regional endpoint (`sea.api.riotgames.com`) may require different permissions than platform-specific endpoints (`sg2.api.riotgames.com`, etc.).

Using platform-specific endpoints (sg2, oc1, etc.) often works better than the regional endpoint (sea) for Account API v1.

## Technical Details

- **Regional endpoint**: `https://sea.api.riotgames.com/riot/account/v1/...` (may fail with 403)
- **Platform endpoint**: `https://sg2.api.riotgames.com/lol/summoner/v4/...` (usually works)

The Account API v1 uses regional routing, but if that fails, the system will fall back to platform routing for Summoner API v4, which may work better.

