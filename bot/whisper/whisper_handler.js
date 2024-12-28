import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

import { TEMP_FILES_DIR, TG_BOT_KEY } from '../../env.js';
import logger from '../../logger.js';

async function downloadFile(ctx, file) {
  const fileLink = await ctx.telegram.getFile(file.file_id);
  const fileUrl = `https://api.telegram.org/file/bot${TG_BOT_KEY}/${fileLink.file_path}`;

  const tempDir = path.join(TEMP_FILES_DIR, file.file_id);
  await fs.promises.mkdir(tempDir, { recursive: true });

  const filePath = path.join(tempDir, `original${path.extname(fileLink.file_path)}`);
  const response = await fetch(fileUrl);
  await pipeline(response.body, fs.createWriteStream(filePath));

  return filePath;
}

async function transcribeAudio(audioPath) {
  const pythonProcess = spawn('modal', ['run', 'bot/whisper/whisper_transcribe.py', audioPath]);

  return new Promise((resolve, reject) => {
    let result = '';
    let error = '';

    pythonProcess.stdout.on('data', (data) => {
      result += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python process failed: ${error}`));
      } else {
        const transcriptionLine = result.split('\n').find((line) => line.startsWith('Transcription result:'));
        if (transcriptionLine) {
          const transcription = transcriptionLine.replace('Transcription result:', '').trim();
          resolve(transcription);
        } else {
          reject(new Error('No transcription found in output'));
        }
      }
    });
  });
}

export async function handleAudioMessage(ctx) {
  try {
    const file = ctx.message.voice || ctx.message.audio || ctx.message.video || ctx.message.document;
    if (!file) {
      throw new Error('No audio file found in message');
    }

    await ctx.reply('Начинаю обработку аудио...');

    const filePath = await downloadFile(ctx, file);
    const transcription = await transcribeAudio(filePath);

    await ctx.reply(transcription);
    await fs.promises.rm(path.dirname(filePath), { recursive: true, force: true });
  } catch (error) {
    await logger.error('Error in handleAudioMessage:', error);
    await ctx.reply(`Произошла ошибка при обработке аудио: ${error.message}`);
  }
}
