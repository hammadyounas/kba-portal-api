import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import express = require('express');
import { AppModule } from './app.module';
import { configureApp } from './app.factory';

const server = express();

server.get('/', (_req, res) => {
  res.json({ ok: true, service: 'kba-portal-api' });
});

let ready: Promise<express.Express> | null = null;

function getServer(): Promise<express.Express> {
  if (!ready) {
    ready = NestFactory.create(AppModule, new ExpressAdapter(server))
      .then(async (app) => {
        configureApp(app);
        await app.init();
        return server;
      })
      .catch((error: unknown) => {
        ready = null;
        throw error;
      });
  }
  return ready;
}

export default async function handler(req: Request, res: Response) {
  const app = await getServer();
  app(req, res);
}

if (!process.env.VERCEL) {
  void getServer().then((app) => {
    const port = Number(process.env.PORT ?? 4000);
    app.listen(port, '0.0.0.0', () => {
      console.log(`KBA Portal API running on http://0.0.0.0:${port}/api`);
      console.log(`LAN tip: http://<your-mac-ip>:${port}/api`);
    });
  });
}
