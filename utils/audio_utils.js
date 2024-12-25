import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';

ffmpeg.setFfmpegPath(ffmpegStatic);

export function convertToWav(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .toFormat('wav')
      .outputOptions('-vn')
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .save(outputPath);
  });
}

export function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration);
    });
  });
}

export async function splitAudioIntoChunks(inputPath, outputDir, chunkLengthMinutes) {
  const duration = await getAudioDuration(inputPath);
  const chunkLength = chunkLengthMinutes * 60;
  const chunks = [];

  for (let start = 0; start < duration; start += chunkLength) {
    const chunkPath = path.join(outputDir, `chunk_${start}.wav`);
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(start)
        .setDuration(Math.min(chunkLength, duration - start))
        .toFormat('wav')
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(chunkPath);
    });
    chunks.push(chunkPath);
  }

  return chunks;
}
