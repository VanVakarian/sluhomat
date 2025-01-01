# Sluhomat-3000 tg bot

A Telegram bot for transcribing voice messages and audio files into text using either OpenAI Whisper API or cloud Whisper model via Modal.

## Features

- Multiple transcription backends support (OpenAI API or cloud Whisper model)
- Voice message and audio file transcription
- Video file transcription support
- Support for various media formats
- User authorization system
- Long audio splitting into chunks
- Real-time processing progress display
- Estimated time remaining calculation
- Automatic temporary files cleanup
- Error handling with partial results recovery
- Logging system

## Installation

1. Clone the repository:

```bash
git clone https://github.com/Vanad1um4/sluhomat.git
cd sluhomat
```

2. Install dependencies:

```bash
npm install
```

3. Create configuration file:

```bash
cp env.js.example env.js
```

4. Edit `env.js` and add:

- Your Telegram bot token (`TG_BOT_KEY`)
- OpenAI API key (`OPENAI_API_KEY`) if using OpenAI backend
- List of authorized users (`INIT_USERS`)
- Selected transcription method (`SELECTED_METHOD`)

## Running

To start the bot:

```bash
npm start
```

To run in development mode:

```bash
npm run dev
```

## Usage

1. Add users to the `INIT_USERS` array in `env.js`
2. Start the bot
3. Send the `/start` command to get instructions
4. Send any supported media file for transcription

## Project Structure

```
sluhomat/
├── bot/
│   ├── audio_gateway.js   # Audio processing router
│   ├── openai/            # OpenAI API integration
│   └── whisper/           # Cloud Whisper integration
├── db/
│   ├── db.js              # DB connection
│   ├── init.js            # DB initialization
│   └── users.js           # User management
├── s-bot.js               # Main bot file
├── env.js                 # Configuration
├── logger.js              # Logging system
└── utils.js               # Utilities
```

## Supported Formats

### Audio

- MP3, WAV, OGG
- Telegram voice messages
- Other audio formats supported by FFmpeg

### Video

- MP4, MOV, AVI
- MKV, WebM, FLV
- WMV, 3GP
- Telegram video messages

## Technologies

- Node.js
- Telegraf (Telegram Bot Framework)
- OpenAI Whisper API
- Cloud Whisper model via Modal
- FFmpeg for media processing
- SQLite for data storage
- Structured logging system
