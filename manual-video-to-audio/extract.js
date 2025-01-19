import ffmpegStatic from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";

ffmpeg.setFfmpegPath(ffmpegStatic);

const videoDir = "./video";
const resultsDir = "./results";

if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

const videoFiles = fs
  .readdirSync(videoDir)
  .filter((file) => file.match(/\.(mp4|avi|mov|mkv)$/i));

if (videoFiles.length === 0) {
  console.log("No video files found in video directory");
  process.exit(1);
}

const inputVideo = path.join(videoDir, videoFiles[0]);
const outputAudio = path.join(
  resultsDir,
  path.basename(videoFiles[0], path.extname(videoFiles[0])) + ".m4a"
);

ffmpeg(inputVideo)
  .outputOptions([
    "-vn", // disable video stream
    "-acodec copy", // copy audio codec without reencoding
  ])
  .output(outputAudio)
  .on("end", () => console.log("Extraction complete"))
  .on("error", (err) => console.error("Error:", err.message))
  .run();
