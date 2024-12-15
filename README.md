# Suno Music Discord Bot

This repo hosts a discord.js bot that can convert images and videos into generative AI songs. It scrapes Suno.com in the background in order to create songs.

* **Send 1-3 images** and mention the **genre** and **vibe** of the song you want
* **Send a 3-15 second video** and mention the **genre** and **vibe** of the song you want
* **Use a text description** in order to describe the output you want in detail
* Add **hashtags** in order to offer more context about the image/video you send and further customize your song
* Run the bot with or without Docker

## Requirements

You need to have [node.js](https://nodejs.org/en/download/package-manager), [Docker](https://docs.docker.com/get-docker/) and [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli) installed on your machine.

## Setup

Clone this repository and `cd` into it. Then, install all dependencies:

```
npm install
```

### Supabase Setup

This bot saves user information (Discord ID, information passed in / commands) on Supabase. After you set up your [Supabase account](https://supabase.com/) and create a new project, you need to create a couple tables and assign a schema to each of them. You can execute the SQL scripts in `./sql/` to set everything up.

#### Wiping All Resources

If you want to delete absolutely everything from Supabase, you can execute this script with the `SQL Editor`: `./sql/wipe_resources.sql`.

### Environment Variables

You'll need to create a `.env` file and place it at the root of the directory. In it, you need to put the following variables:

- `DISCORD_TOKEN`: the token you get from your developer dashboard. The bot uses this to connect to Discord
- `CLIENT_ID`: your bot's client ID, taken from the Discord developer dashboard
- `GUILD_ID`: the main guild where you wanna deploy updates for your bot, taken from the Discord developer dashboard
- `OPENAI_API_KEY`: the OpenAI key your bot uses in order to call GPT and get a song prompt which it will then use to create a song

## Run the Bot

The simplest way to run the bot is to execute the following:

```
npm run start-local
```

### Running in Docker
If you want to run the bot in Docker:

```
docker build -t suno-discord-bot
docker run -it suno-discord-bot
```

### Running on Heroku
If you want to deploy to Heroku using the CLI:

```
heroku login
heroku create suno-discord-bot
heroku git:remote -a suno-discord-bot
heroku buildpacks:set heroku/nodejs -a suno-discord-bot
heroku buildpacks:add --index 1 https://github.com/jonathanong/heroku-buildpack-ffmpeg-latest.git --app suno-discord-bot
```

At this point you need to set up all the environment variables on your Heroku app dashboard under Settings > Config Vars. Then, you can do:

```
git add .
git commit -am "Launch commit"
git push heroku master
```

If you wanna check your deployment logs, execute:

```
heroku logs --app suno-discord-bot
```

If instead you want to monitor incoming logs, execute:

```
heroku logs --tail --app suno-discord-bot
```
