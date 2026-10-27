import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  // Mobile apps + web; allow LAN origins during local demo
  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(config.get('PORT') ?? 4000);
  // 0.0.0.0 → reachable from physical devices on the same Wi‑Fi
  await app.listen(port, '0.0.0.0');
  console.log(`KBA Portal API running on http://0.0.0.0:${port}/api`);
  console.log(`LAN tip: http://<your-mac-ip>:${port}/api`);
}

void bootstrap();
