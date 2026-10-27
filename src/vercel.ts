import type { Express } from 'express';
import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from './app.factory';

let appPromise: Promise<Express> | undefined;

function getApp() {
  if (!appPromise) {
    appPromise = createApp().catch((error: unknown) => {
      appPromise = undefined;
      throw error;
    });
  }
  return appPromise;
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const app = await getApp();
  app(request, response);
}
