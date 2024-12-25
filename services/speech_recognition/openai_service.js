import OpenAI from 'openai';
import fs from 'fs';

export class OpenAIService {
  constructor(apiKey) {
    this.client = new OpenAI({ apiKey });
  }

  async transcribe(audioPath, options = {}) {
    const audioStream = await fs.createReadStream(audioPath);
    const response = await this.client.audio.transcriptions.create({
      file: audioStream,
      model: 'whisper-1',
      language: options.language || 'ru',
      prompt: options.prompt || '',
    });
    return response.text;
  }

  async transcribeChunk(chunk, previousText = '', options = {}) {
    const chunkStream = await fs.createReadStream(chunk);
    const response = await this.client.audio.transcriptions.create({
      file: chunkStream,
      model: 'whisper-1',
      language: options.language || 'ru',
      prompt: previousText,
    });
    return response.text;
  }
}
