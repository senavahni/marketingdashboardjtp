import './config/load-env';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter';
import { RedisService } from './redis/redis.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, bufferLogs: true });
  const config = app.get(AppConfigService);
  app.useLogger(app.get(Logger));

  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: config.isProduction ? undefined : false }));
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });
  app.setGlobalPrefix('api/v1', { exclude: [{ path: 'health', method: RequestMethod.GET }] });
  app.enableCors({
    origin: config.appOrigins,
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
  });

  const ioAdapter = new RedisIoAdapter(app);
  ioAdapter.connect(app.get(RedisService));
  app.useWebSocketAdapter(ioAdapter);

  if (config.env.SWAGGER_ENABLED) {
    const doc = new DocumentBuilder()
      .setTitle('Matrika Dashboard API — Modul 1')
      .setDescription('Agentic Project Management. Kontrak: Documentation/modul1/*.md')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, doc));
  }

  app.enableShutdownHooks();
  await app.listen(config.env.PORT);
  app.get(Logger).log(`API berjalan di http://localhost:${config.env.PORT}/api/v1 (docs: /api/docs)`, 'Bootstrap');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
