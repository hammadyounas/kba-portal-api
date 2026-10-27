import { NestFactory } from '@nestjs/core';
import '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.factory';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  console.log(`KBA Portal API running on http://0.0.0.0:${port}/api`);
  console.log(`LAN tip: http://<your-mac-ip>:${port}/api`);
}

bootstrap();
