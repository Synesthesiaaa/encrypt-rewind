# 🔑 Riot Games API Setup Guide

This guide will walk you through setting up your Riot Games API key for the EncryptLoL Discord bot.

## 📋 Prerequisites

- A Riot Games account (same account you use for League of Legends)
- Access to the Riot Games Developer Portal
- Basic understanding of environment variables

---

## 🚀 Step-by-Step Setup

### Step 1: Create a Riot Games Developer Account

1. Go to the [Riot Games Developer Portal](https://developer.riotgames.com/)
2. Click **"Sign In"** in the top right corner
3. Log in with your existing Riot Games account credentials
   - If you don't have a Riot account, create one at [account.riotgames.com](https://account.riotgames.com/)

### Step 2: Register Your Application

1. Once logged in, you'll see the **Developer Portal Dashboard**
2. Click on **"Register Product"** or go to the **"Products"** section
3. Fill out the product registration form:
   - **Product Name**: `EncryptLoL` (or your preferred name)
   - **Product Description**: 
     ```
     EncryptLoL is a Discord bot that generates personalized year-end rewind summaries for League of Legends players, inspired by Spotify Wrapped. The bot helps players celebrate their gaming journey by providing beautiful, shareable statistics from their ranked matches throughout the year. The bot uses the Summoner API (v4) to retrieve summoner information, the Match API (v5) to fetch match history and details, and the League API (v4) for rank information. All data is fetched on-demand with no persistent storage, and the bot is non-commercial and open-source.
     ```
   - **Product Website**: (Optional) Your bot's website or GitHub repository
   - **Product Logo**: (Optional) Your bot's logo

4. Click **"Submit"** and wait for approval
   - ⚠️ **Note**: Approval can take 24-48 hours. You'll receive an email when your application is approved.

### Step 3: Generate Your API Key

1. After your product is approved, go to the **"API Keys"** section in the Developer Portal
2. Click **"Create API Key"** or **"Generate New Key"**
3. Select **"Personal API Key"** (for development/testing)
   - ⚠️ **Important**: Personal API keys expire after 24 hours
   - For production, you'll need to apply for a **Production API Key** which doesn't expire
4. Copy your API key immediately
   - ⚠️ **Warning**: You can only see the key once! Copy it now or you'll need to generate a new one.

### Step 4: Understand API Key Types

#### Personal API Key (Development)
- ✅ **Pros**: 
  - Quick to generate
  - Good for testing and development
  - No approval needed
- ❌ **Cons**: 
  - Expires after 24 hours
  - Rate limits: 20 requests per second, 100 requests per 2 minutes

#### Production API Key (Production)
- ✅ **Pros**: 
  - Never expires
  - Higher rate limits
  - Better for production bots
- ❌ **Cons**: 
  - Requires product approval first
  - May take longer to get approved
  - More strict requirements

### Step 5: Configure Your API Key in the Bot

1. Create a `.env` file in your project root directory (if it doesn't exist)
2. Add your API key and region:

```env
# Riot Games API Configuration
RIOT_API_KEY=your_api_key_here
RIOT_API_REGION=sg2

# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_GUILD_ID=your_guild_id_here
```

3. **Important**: 
   - Replace `your_api_key_here` with your actual API key
   - **NO quotes** around the API key
   - **NO spaces** before or after the `=` sign
   - Copy the key exactly as shown (case-sensitive)

### Step 6: Set Your Region

Choose the appropriate **platform routing value** for your server. Note that `RIOT_API_REGION` must be a **platform** routing value (like `na1`, `sg2`), NOT a regional routing value (like `americas`, `sea`).

| Region | Platform Code | Regional Routing Value (for Match API) | Status |
|--------|---------------|----------------------------------------|--------|
| North America | `na1` | `americas` | ✅ Working |
| Europe West | `euw1` | `europe` | ✅ Working |
| Europe Nordic & East | `eun1` | `europe` | ✅ Working |
| Korea | `kr` | `asia` | ✅ Working |
| Japan | `jp1` | `asia` | ✅ Working |
| Brazil | `br1` | `americas` | ✅ Working |
| Latin America North | `la1` | `americas` | ✅ Working |
| Latin America South | `la2` | `americas` | ✅ Working |
| Oceania | `oc1` | `sea` | ✅ Working |
| Russia | `ru` | `europe` | ✅ Working |
| Turkey | `tr1` | `europe` | ✅ Working |
| Singapore | `sg2` | `sea` | ✅ Working |
| Taiwan | `tw2` | `sea` | ✅ Working |
| Vietnam | `vn2` | `sea` | ✅ Working |
| ~~Philippines~~ | ~~`ph2`~~ | ~~`sea`~~ | ❌ Non-responsive |
| ~~Thailand~~ | ~~`th2`~~ | ~~`sea`~~ | ❌ Non-responsive |

**⚠️ Important Notes:**
- Use **platform routing values** (like `na1`, `sg2`, `oc1`) for `RIOT_API_REGION`
- Do NOT use regional routing values (like `americas`, `europe`, `asia`, `sea`) for `RIOT_API_REGION`
- The bot automatically maps platform values to regional values for Match API (v5) endpoints
- If you're in Southeast Asia, use one of: `sg2`, `tw2`, `vn2`, or `oc1` (not `sea`)
- **Removed platforms**: `ph2` and `th2` are non-responsive and have been removed

**Example for Singapore (recommended for SEA):**
```env
RIOT_API_REGION=sg2
```

**Example for Oceania:**
```env
RIOT_API_REGION=oc1
```

**Example for North America:**
```env
RIOT_API_REGION=na1
```

### Step 7: Test Your API Key

1. Run the diagnostic script:
   ```bash
   npm run check-api
   ```

2. You should see:
   ```
   ✅ API Key found (length: XX characters)
   ✅ Region: sea
   ✅ API Key is VALID!
   ```

3. If you see errors, check:
   - API key is copied correctly (no extra spaces)
   - Region matches your server
   - API key hasn't expired (if using Personal API Key)

---

## 🔄 Renewing Your API Key

### Personal API Keys (24-hour expiration)

1. Go to [Riot Games Developer Portal](https://developer.riotgames.com/)
2. Navigate to **"API Keys"**
3. Click **"Generate New Key"** or **"Renew Key"**
4. Copy the new key
5. Update your `.env` file with the new key
6. Restart your bot

### Setting Up Auto-Renewal (Optional)

For Personal API Keys, you'll need to renew them daily. Consider:
- Setting a reminder to renew daily
- Creating a script to check key expiration
- Applying for a Production API Key for long-term use

---

## 🚨 Common Issues and Solutions

### Issue: 403 Forbidden Error

**Causes:**
- API key is invalid or expired
- API key has extra whitespace
- API key is for wrong region
- API key doesn't have required permissions

**Solutions:**
1. Check your API key in the Developer Portal
2. Generate a new key if expired
3. Verify no spaces in `.env` file
4. Run `npm run check-api` to diagnose

### Issue: 429 Rate Limit Exceeded

**Causes:**
- Too many requests in a short time
- Exceeded rate limits (20/sec, 100/2min for Personal keys)

**Solutions:**
1. The bot has built-in rate limiting - wait a moment
2. Reduce the number of concurrent requests
3. Consider upgrading to Production API Key for higher limits

### Issue: 404 Not Found

**Causes:**
- Summoner name is incorrect
- Summoner doesn't exist in the specified region
- Region mismatch

**Solutions:**
1. Verify summoner name spelling
2. Check if summoner exists in the region
3. Ensure region matches summoner's server

---

## 📊 API Endpoints Used

The EncryptLoL bot uses the following Riot API endpoints:

### Account API (v1) - **Primary Method**
- `GET /riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}`
  - Retrieves account information (PUUID) from Riot ID
  - Uses **REGIONAL** routing values (americas, europe, asia, sea)

### Summoner API (v4)
- `GET /lol/summoner/v4/summoners/by-puuid/{encryptedPUUID}`
  - Retrieves summoner information by PUUID (recommended method)
  - Uses **PLATFORM** routing values (na1, euw1, sg2, etc.)
- ~~`GET /lol/summoner/v4/summoners/by-name/{summonerName}`~~ (Deprecated - kept for backward compatibility only)

### Match API (v5)
- `GET /lol/match/v5/matches/by-puuid/{puuid}/ids`
  - Gets match history for a player
- `GET /lol/match/v5/matches/{matchId}`
  - Gets detailed match information

### League API (v4)
- `GET /lol/league/v4/entries/by-summoner/{summonerId}`
  - Gets current rank and league information

### Champion Mastery API (v4)
- `GET /lol/champion-mastery/v4/champion-masteries/by-summoner/{summonerId}`
  - Gets champion mastery levels

---

## 🔒 Security Best Practices

1. **Never commit your `.env` file to Git**
   - Add `.env` to your `.gitignore` file
   - Use environment variables in production

2. **Keep your API key secret**
   - Don't share it publicly
   - Don't hardcode it in your source code
   - Rotate keys if compromised

3. **Use different keys for development and production**
   - Personal API Key for development
   - Production API Key for production

4. **Monitor your API usage**
   - Check rate limits in the Developer Portal
   - Set up alerts for unusual activity

---

## 📝 Production API Key Application

For a production bot, you'll need a Production API Key:

1. **Complete Product Registration** (Step 2 above)
2. **Wait for Approval** (24-48 hours)
3. **Apply for Production Key**:
   - Go to API Keys section
   - Click "Request Production API Key"
   - Fill out the application form
   - Provide detailed use case
   - Wait for approval (can take several days)

**Production Key Benefits:**
- Never expires
- Higher rate limits
- Better for public bots
- More reliable for production use

---

## 🆘 Getting Help

If you encounter issues:

1. **Check the logs**: Look for error messages in your console
2. **Run diagnostics**: Use `npm run check-api`
3. **Riot Developer Support**: 
   - [Riot Games Developer Portal](https://developer.riotgames.com/)
   - [Riot API Documentation](https://developer.riotgames.com/docs/portal)
   - [Riot API Status](https://status.riotgames.com/)

4. **Common Resources**:
   - [API Documentation](https://developer.riotgames.com/apis)
   - [Rate Limits Guide](https://developer.riotgames.com/docs/portal#rate-limits)
   - [Terms of Service](https://developer.riotgames.com/policies/terms-of-service)

---

## ✅ Checklist

Before running your bot, ensure:

- [ ] Riot Games Developer account created
- [ ] Product registered and approved
- [ ] API key generated
- [ ] `.env` file created with correct format
- [ ] API key added to `.env` (no quotes, no spaces)
- [ ] Region configured correctly
- [ ] API key tested with `npm run check-api`
- [ ] Bot restarted after adding API key

---

## 🎉 You're All Set!

Once you've completed these steps, your bot should be able to fetch League of Legends data from the Riot Games API. If you encounter any issues, refer to the troubleshooting section above or check the bot's error logs.

**Happy coding! 🚀**

