import { dbGetUser } from '../db/users.js';
import { SELECTED_METHOD, SPEECH_RECOGNITION_METHODS } from '../env.js';
import logger from '../logger.js';
import { handleAudioMessage as handleOpenAI } from './openai/openai_handler.js';
import { handleAudioMessage as handleWhisper } from './whisper/whisper_handler.js';

export async function handleAudioMessage(ctx) {
  try {
    const user = await dbGetUser(ctx.message.from.id);
    if (!user) {
      await logger.warn(`Unauthorized access attempt from user ${ctx.message.from.id}`);
      return;
    }

    if (SELECTED_METHOD === SPEECH_RECOGNITION_METHODS.OPENAI_API) {
      return handleOpenAI(ctx);
    } else {
      return handleWhisper(ctx);
    }
  } catch (error) {
    await logger.error('Error in audio gateway:', error);
    throw error;
  }
}
