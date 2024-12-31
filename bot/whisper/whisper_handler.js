import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

import { TEMP_FILES_DIR, TG_BOT_KEY } from '../../env.js';
import logger from '../../logger.js';
import { logPythonOutput } from '../../utils.js';

async function downloadFile(ctx, file) {
  const fileLink = await ctx.telegram.getFile(file.file_id);
  const fileUrl = `https://api.telegram.org/file/bot${TG_BOT_KEY}/${fileLink.file_path}`;

  const userId = ctx.from.id;
  const tempDir = path.join(TEMP_FILES_DIR, userId.toString());

  if (fs.existsSync(tempDir)) {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }

  await fs.promises.mkdir(tempDir, { recursive: true });

  const filePath = path.join(tempDir, `original${path.extname(fileLink.file_path)}`);
  const response = await fetch(fileUrl);
  await pipeline(response.body, fs.createWriteStream(filePath));

  return filePath;
}

async function transcribeAudio(audioPath) {
  const pythonProcess = spawn('modal', ['run', 'bot/whisper/whisper_transcribe.py', '--input-file', audioPath]);

  return new Promise((resolve, reject) => {
    let result = '';
    let error = '';

    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      result += output;
      logPythonOutput('STDOUT', output);
    });

    pythonProcess.stderr.on('data', (data) => {
      const output = data.toString();
      error += output;
      logPythonOutput('STDERR', output);
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

function getOriginalFilename(file) {
  // Trying to get filename from different message types:
  if (file.file_name) {
    // For documents, audio and video files:
    return file.file_name.replace(/\.[^/.]+$/, ''); // Removing extension
  } else if (file.title) {
    // For audio messages with title:
    return file.title;
  } else {
    // For voice messages, video notes or when no name is available:
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '') // Removing hyphens and colons
      .replace(/\..+/, '') // Removing milliseconds
      .replace('T', '_'); // Replacing 'T' with underscore
    return `media_${timestamp}`;
  }
}

async function updateStatus(ctx, messageId, text) {
  await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, text);
}

export async function handleAudioMessage(ctx) {
  try {
    const file = ctx.message.voice || ctx.message.audio || ctx.message.video || ctx.message.document;
    if (!file) {
      throw new Error('No audio file found in message');
    }

    const statusMessage = await ctx.reply('Подготовка к расшифровке... Может занять несколько минут, запаситесь терпением.');
    const filePath = await downloadFile(ctx, file);
    const originalName = getOriginalFilename(file);
    const transcriptionFilePath = path.join(path.dirname(filePath), 'original.txt');

    try {
      const pythonProcess = spawn('modal', ['run', 'bot/whisper/whisper_transcribe.py', '--input-file', filePath]);

      await new Promise((resolve, reject) => {
        let lastStatus = '';

        pythonProcess.stdout.on('data', async (data) => {
          const output = data.toString();

          if (output.includes('[STATUS] TRANSCRIBING')) {
            await updateStatus(ctx, statusMessage.message_id, 'Расшифровка аудио...');
            lastStatus = 'TRANSCRIBING';
          }

          if (output.includes('[STATUS] DONE')) {
            lastStatus = 'DONE';
          }

          logPythonOutput('STDOUT', output);
        });

        pythonProcess.stderr.on('data', (data) => {
          const output = data.toString();
          logPythonOutput('STDERR', output);
        });

        pythonProcess.on('close', (code) => {
          if (code !== 0) {
            reject(new Error('Transcription process failed'));
          } else if (lastStatus !== 'DONE') {
            reject(new Error('Transcription was not completed'));
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      await updateStatus(ctx, statusMessage.message_id, 'Ошибка в процессе расшифровки, попробуйте ещё раз.');
      throw error;
    }

    if (!fs.existsSync(transcriptionFilePath)) {
      throw new Error('Transcription file not found');
    }

    await updateStatus(ctx, statusMessage.message_id, 'Расшифровка завершена! Результаты:');
    await ctx.replyWithDocument({ source: transcriptionFilePath, filename: `${originalName}.txt` });
    await fs.promises.rm(path.dirname(filePath), { recursive: true, force: true });
  } catch (error) {
    await logger.error('Error in handleAudioMessage:', error);
    await ctx.reply(`Произошла ошибка при обработке аудио: ${error.message}`);
  }
}
