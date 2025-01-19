# Video to Audio Extractor

A simple Node.js script that extracts audio tracks from video files using FFmpeg.

## Features

- Automatically processes video files from the `video` directory
- Supports MP4, AVI, MOV, and MKV formats
- Preserves original audio codec without re-encoding
- Outputs audio in M4A format

## Prerequisites

- Node.js
- NPM

## Required packages

```bash
npm install ffmpeg-static fluent-ffmpeg
```

## Directory Structure

```
├── video/         # Place your video files here
├── results/       # Extracted audio files will be saved here
└── index.js       # Main script
```

## Usage

1. Place your video files in the `video` directory
2. Run the script:

```bash
node index.js
```

The extracted audio will be saved in the `results` directory with the same name as the original video file but with a `.m4a` extension.
