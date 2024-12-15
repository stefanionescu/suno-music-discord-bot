module.exports = {
  apps : [{
    name: 'suno-discord-bot',
    script: 'index.js',
    instances: 1, // Since Heroku dynamically manages app instances, you usually want just 1 instance per Dyno
    autorestart: true, // Automatically restart the app if it crashes
    watch: false, // Watching is not effective in production
    env: {
      NODE_ENV: 'production',
      DISCORD_TOKEN: process.env.DISCORD_TOKEN, // Ensure these are set in Heroku Config Vars
      CLIENT_ID: process.env.CLIENT_ID,
      GUILD_ID: process.env.GUILD_ID,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      REDIS_HOST: process.env.REDIS_HOST,
      REDIS_PORT: process.env.REDIS_PORT,
      REDIS_PASSWORD: process.env.REDIS_PASSWORD,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
      SCRAPE_API_KEY: process.env.SCRAPE_API_KEY,
      SCRAPE_API_ENDPOINT: process.env.SCRAPE_API_ENDPOINT
    },
    log_date_format: 'DD-MM-YYYY HH:mm Z'
  }]
};
