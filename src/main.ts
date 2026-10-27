import { createApp } from './app.factory';

async function listen() {
  const server = await createApp();
  const port = Number(process.env.PORT ?? 4000);
  await new Promise<void>((resolve) => {
    server.listen(port, '0.0.0.0', () => resolve());
  });
  console.log(`KBA Portal API running on http://0.0.0.0:${port}/api`);
  console.log(`LAN tip: http://<your-mac-ip>:${port}/api`);
}

if (!process.env.VERCEL) {
  void listen();
}
