# Audio File Splitter

A Node.js script for splitting large audio files into smaller segments while maintaining original quality. The script automatically splits files that exceed a specified size limit (default 19MB) into multiple parts without re-encoding.

## Features

- Splits audio files while preserving original quality (no re-encoding)
- Supports multiple audio formats (.mp3, .wav, .ogg, .m4a, .aac)
- Automatically calculates optimal segment duration based on target file size
- Maintains original audio quality using stream copy
- Displays progress during processing
- Creates clean output directory for split files

## Requirements

- Node.js
- FFmpeg (automatically installed via ffmpeg-static)

## Usage

1. Create a `file_to_convert` directory in the script's folder
2. Place your audio file(s) in the `file_to_convert` directory
3. Run the script using one of these options:

```bash
# Using default settings (max part size 19MB)
node split.js

# Using custom maximum part size in MB
node split.js --max-mb 25
```

The script will:

- Process all supported audio files in the `file_to_convert` directory
- Create a `results` directory
- Split files into parts if they exceed the size limit
- Output progress and file information during processing

Split files will be saved in the `results` directory with naming pattern: `original_filename_part0.ext`, `original_filename_part1.ext`, etc.

## Technical Details

- Maximum file size per part: 19MB by default (configurable via --max-mb parameter)
- Uses FFmpeg's segment feature for splitting
- Preserves timestamps for each segment
- Copies all audio streams without re-encoding
