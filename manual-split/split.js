import ffmpegStatic from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";

ffmpeg.setFfmpegPath(ffmpegStatic);

const DEFAULT_MAX_SIZE_MB = 19; // Using default telegram filesize limits in bots: 20 MB with a little buffer

function parseArgs() {
  const args = process.argv.slice(2);
  const maxMbIndex = args.indexOf("--max-mb");
  if (maxMbIndex !== -1 && args[maxMbIndex + 1]) {
    const maxMb = parseFloat(args[maxMbIndex + 1]);
    if (!isNaN(maxMb) && maxMb > 0) {
      return maxMb;
    }
  }
  return DEFAULT_MAX_SIZE_MB;
}

async function getAudioDuration(filePath) {
  console.log(`Getting duration for: ${filePath}`);
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      console.log(`Duration: ${metadata.format.duration} seconds`);
      resolve(metadata.format.duration);
    });
  });
}

async function getFileSize(filePath) {
  console.log(`Checking size for: ${filePath}`);
  const stats = await fs.promises.stat(filePath);
  const sizeMB = stats.size / (1024 * 1024);
  console.log(`File size: ${sizeMB.toFixed(2)} MB`);
  return sizeMB;
}

async function splitFile(filePath, maxSizeMB = DEFAULT_MAX_SIZE_MB) {
  console.log(`\nStarting to split file: ${filePath}`);
  console.log(`Maximum size per part: ${maxSizeMB} MB`);

  if (!fs.existsSync("results")) {
    fs.mkdirSync("results");
  } else {
    const files = await fs.promises.readdir("results");
    for (const file of files) {
      await fs.promises.unlink(path.join("results", file));
    }
  }

  const totalDuration = await getAudioDuration(filePath);
  const totalSize = await getFileSize(filePath);

  const numberOfParts = Math.ceil(totalSize / maxSizeMB);
  const segmentDuration = Math.ceil(totalDuration / numberOfParts) + 1;

  console.log(`Total duration: ${totalDuration} seconds`);
  console.log(`Total size: ${totalSize.toFixed(2)} MB`);
  console.log(`Number of parts: ${numberOfParts}`);
  console.log(`Calculated segment duration: ${segmentDuration} seconds`);

  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);

  await new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .outputOptions([
        "-c copy",
        "-f segment",
        "-segment_time " + segmentDuration,
        "-reset_timestamps 1",
        "-segment_start_number 1",
        "-map 0",
      ])
      .on("start", (commandLine) => {
        console.log(`FFmpeg command: ${commandLine}`);
      })
      .on("progress", (progress) => {
        process.stdout.write(
          `\rProgress: ${progress.percent?.toFixed(2)}% | Time: ${
            progress.timemark
          }`
        );
      })
      .on("end", () => {
        console.log("\nSegmentation completed successfully");
        resolve();
      })
      .on("error", (err, stdout, stderr) => {
        console.error("\nFFmpeg error:", err.message);
        console.error("FFmpeg stdout:", stdout);
        console.error("FFmpeg stderr:", stderr);
        reject(err);
      })
      .save(path.join("results", `${baseName}_part%d${ext}`));
  });

  const resultFiles = await fs.promises.readdir("results");
  for (const file of resultFiles) {
    if (file.startsWith(baseName)) {
      const size = await getFileSize(path.join("results", file));
      console.log(`${file}: ${size.toFixed(2)} MB`);
    }
  }
}

async function main() {
  const maxMb = parseArgs();
  const audioExtensions = [".mp3", ".wav", ".ogg", ".m4a", ".aac"];
  console.log(`\nSearching for audio files in file_to_convert directory...`);
  const files = await fs.promises.readdir("file_to_convert");

  const audioFiles = files.filter((file) => {
    const ext = path.extname(file).toLowerCase();
    return audioExtensions.includes(ext);
  });

  console.log(`Found ${audioFiles.length} audio files`);

  if (audioFiles.length === 0) {
    console.log("No audio files found in file_to_convert directory");
    return;
  }

  const fileToProcess = audioFiles[0];
  console.log(`Selected file for processing: ${fileToProcess}`);

  const inputPath = path.join("file_to_convert", fileToProcess);

  try {
    await splitFile(inputPath, maxMb);
    console.log(`\nSuccessfully processed ${fileToProcess}`);
  } catch (error) {
    console.error(`\nError processing ${fileToProcess}:`, error.message);
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
  }
}

main().catch(console.error);
