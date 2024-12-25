import { OPENAI_API_KEY } from '../../env.js';
import { OpenAIService } from './openai_service.js';

const services = {
  openai: new OpenAIService(OPENAI_API_KEY),
};

export function getService(name = 'openai') {
  const service = services[name];
  if (!service) {
    throw new Error(`Speech recognition service ${name} not found`);
  }
  return service;
}
