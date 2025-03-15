import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';

ffmpeg.setFfmpegPath(ffmpegStatic);

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const audioDir = path.join(scriptDir, 'audio');
const resultsDir = scriptDir;
const DEFAULT_MAX_SIZE_MB = 19;

function parseArgs() {
  const args = process.argv.slice(2);
  const maxMbIndex = args.indexOf('--max-mb');
  if (maxMbIndex !== -1 && args[maxMbIndex + 1]) {
    const maxMb = parseFloat(args[maxMbIndex + 1]);
    if (!isNaN(maxMb) && maxMb > 0) {
      return maxMb;
    }
  }
  return DEFAULT_MAX_SIZE_MB;
}

function ensureDirectories() {
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
  }
}

async function extractAudioFromVideo() {
  console.log('\n--- STEP 1: Extracting audio from video ---');

  const videoFiles = fs.readdirSync(scriptDir).filter((file) => file.match(/\.(mp4|avi|mov|mkv)$/i));

  if (videoFiles.length === 0) {
    console.log('No video files found in script directory');
    process.exit(1);
  }

  const videoFile = videoFiles[0];
  console.log(`Found video file: ${videoFile}`);

  const inputVideo = path.join(scriptDir, videoFile);
  const outputAudio = path.join(audioDir, path.basename(videoFile, path.extname(videoFile)) + '.m4a');

  return new Promise((resolve, reject) => {
    ffmpeg(inputVideo)
      .outputOptions(['-vn', '-acodec copy'])
      .output(outputAudio)
      .on('start', (commandLine) => {
        console.log(`FFmpeg command: ${commandLine}`);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          process.stdout.write(`\rExtraction progress: ${progress.percent.toFixed(2)}%`);
        }
      })
      .on('end', () => {
        console.log('\nAudio extraction complete');
        resolve(outputAudio);
      })
      .on('error', (err) => {
        console.error('Extraction error:', err.message);
        reject(err);
      })
      .run();
  });
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

async function splitAudio(filePath, maxSizeMB = DEFAULT_MAX_SIZE_MB) {
  console.log(`\n--- STEP 2: Splitting audio ---`);
  console.log(`Starting to split file: ${filePath}`);
  console.log(`Maximum size per part: ${maxSizeMB} MB`);

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
        '-c copy',
        '-f segment',
        '-segment_time ' + segmentDuration,
        '-reset_timestamps 1',
        '-segment_start_number 1',
        '-map 0',
      ])
      .on('start', (commandLine) => {
        console.log(`FFmpeg command: ${commandLine}`);
      })
      .on('progress', (progress) => {
        process.stdout.write(`\rProgress: ${progress.percent?.toFixed(2)}% | Time: ${progress.timemark}`);
      })
      .on('end', () => {
        console.log('\nSegmentation completed successfully');
        resolve();
      })
      .on('error', (err, stdout, stderr) => {
        console.error('\nFFmpeg error:', err.message);
        console.error('FFmpeg stdout:', stdout);
        console.error('FFmpeg stderr:', stderr);
        reject(err);
      })
      .save(path.join(resultsDir, `${baseName}_part%d${ext}`));
  });

  const resultFiles = fs
    .readdirSync(resultsDir)
    .filter((file) => file.startsWith(`${baseName}_part`) && file.endsWith(ext));

  console.log('\nGenerated audio parts:');
  for (const file of resultFiles) {
    const size = await getFileSize(path.join(resultsDir, file));
    console.log(`${file}: ${size.toFixed(2)} MB`);
  }

  return resultFiles.length > 0;
}

async function removeVideoFile(videoFile) {
  console.log(`\n--- STEP 3: Cleaning up ---`);
  console.log(`Removing processed video file: ${videoFile}`);
  try {
    await fs.promises.unlink(videoFile);
    console.log(`Video file successfully deleted`);
    return true;
  } catch (error) {
    console.error(`Error deleting video file: ${error.message}`);
    return false;
  }
}

async function cleanupTemporaryAudio() {
  console.log(`Removing temporary audio files`);
  try {
    if (fs.existsSync(audioDir)) {
      const files = await fs.promises.readdir(audioDir);
      for (const file of files) {
        await fs.promises.unlink(path.join(audioDir, file));
      }
      await fs.promises.rmdir(audioDir);
      console.log(`Temporary audio directory removed`);
    }
    return true;
  } catch (error) {
    console.error(`Error cleaning up temporary files: ${error.message}`);
    return false;
  }
}

async function main() {
  const maxMb = parseArgs();

  try {
    ensureDirectories();

    const videoFiles = fs.readdirSync(scriptDir).filter((file) => file.match(/\.(mp4|avi|mov|mkv)$/i));

    if (videoFiles.length === 0) {
      console.log('No video files found in script directory');
      process.exit(1);
    }

    const videoFile = videoFiles[0];
    const videoFilePath = path.join(scriptDir, videoFile);

    const extractedAudioPath = await extractAudioFromVideo();

    const splitSuccess = await splitAudio(extractedAudioPath, maxMb);

    if (splitSuccess) {
      await removeVideoFile(videoFilePath);
      await cleanupTemporaryAudio();
      console.log('\nProcess completed successfully!');
    } else {
      console.error('\nError: Audio splitting did not produce expected results.');
    }
  } catch (error) {
    console.error('\nError during processing:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

main().catch(console.error);
