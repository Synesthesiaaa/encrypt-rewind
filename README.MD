# 🎮 EncryptLoL — League of Legends Year-End Rewind Bot

> **"Your LoL journey — wrapped, celebrated, and shared."**  
> A Discord bot that generates cinematic, Spotify Wrapped-style year-end summaries for League of Legends players.

![Discord](https://img.shields.io/badge/Discord.js-v14+-5865F2?logo=discord&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18.17+-339933?logo=node.js)
![License](https://img.shields.io/badge/License-MIT-blue)

https://github.com/user-attachments/assets/a5817158-42a5-4788-92e1-3ca940f65d98

## 🌟 Features

- `/ping` — Check bot status
- `/lolstats <riot_id>` — Get your **2024 Year-End Rewind** (format: `GameName#TagLine`):
  - 📊 Total games, win rate, KDA
  - 👑 Top 3 champions & roles
  - 🔥 Memorable streaks & milestones
  - 🎨 Rich embeds with LoL-themed styling
- ✅ **100% opt-in** — no data stored or shared
- ✅ **Riot API compliant** — read-only, non-competitive, fan-made

## 🚀 Try It

1. Invite the bot to your Discord server:  
   [`[Invite Link]`](https://discord.com/api/oauth2/authorize?client_id=887566946642579498&permissions=0&scope=bot+applications.commands)
2. Type `/lolstats YourGameName#TagLine` in any channel (e.g., `SummonerName#TAG1`)
3. Watch your epic rewind unfold! ✨

> 💡 *Replace with your real invite link once deployed.*

## 🛠️ Self-Hosting

### Prerequisites
- Node.js 18.17+ installed
- A Discord Bot Token ([Discord Developer Portal](https://discord.com/developers/applications))
- A Riot Games API Key ([See Setup Guide](./RIOT_API_SETUP.md))

### Setup
```bash
git clone https://github.com/synesthesiaaa/lol-rewind.git
cd lol-rewind
npm install
```

### Configuration

1. **Set up Riot Games API Key**:
   - Follow the detailed guide: [RIOT_API_SETUP.md](./RIOT_API_SETUP.md)
   - This includes creating a developer account, registering your product, and generating an API key

2. **Create `.env` file**:
   ```env
   RIOT_API_KEY=your_riot_api_key_here
   RIOT_API_REGION=sg2
   DISCORD_TOKEN=your_discord_bot_token_here
   DISCORD_CLIENT_ID=your_client_id_here
   DISCORD_GUILD_ID=your_guild_id_here
   ```
   
   **Note**: `RIOT_API_REGION` must be a **platform** routing value (e.g., `na1`, `euw1`, `sg2`, `oc1`), not a regional routing value (e.g., `americas`, `europe`, `sea`). See [RIOT_API_SETUP.md](./RIOT_API_SETUP.md) for the complete list.

3. **Test your API key**:
   ```bash
   npm run check-api
   ```

4. **Deploy commands**:
   ```bash
   npm run deploy
   ```

5. **Start the bot**:
   ```bash
   npm start
   ```

📦 Project Structure
src/
├── commands/       # Slash commands (ping, lolstats)
├── events/         # Discord events (clientReady, interactionCreate)
├── services/       # Riot API integration
├── utils/          # Stat calculators, helpers
└── index.js        # Bot entrypoint
deploy-commands.js  # Command registrar


🔐 Privacy & Compliance

🔒 No persistent storage — all data fetched on-demand and discarded
🌐 Public match data only — respects Riot’s Terms of Service
🚫 No win prediction, MMR estimation, or competitive analysis
❤️ Built by fans, for fans — non-commercial & open-source


🤝 Contributing
PRs welcome! Please open an issue first to discuss major changes.

📜 License
MIT — feel free to learn from or fork this project.


🎮 "It’s not about the rank — it’s about the plays you’ll remember."