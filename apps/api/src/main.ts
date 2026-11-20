import 'reflect-metadata';
import { Controller, Get, Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, type NestExpressApplication } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { NextFunction, Request, Response } from 'express';
import { AuthModule } from './auth/auth';
import { databaseOptions } from './database/data-source';
import { ProjectModule } from './projects/projects';

@Controller('health')
class HealthController {
  @Get() check() { return { status: 'ok' }; }
}

@Module({
  imports: [TypeOrmModule.forRootAsync({ useFactory: databaseOptions }), AuthModule, ProjectModule],
  controllers: [HealthController],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, new ExpressAdapter(), { bodyParser: false });
  app.disable('x-powered-by');
  app.setGlobalPrefix('api');
  app.useBodyParser('json', { limit: '2mb' });
  app.use('/api', (request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    const allowedOrigin = process.env.APP_ORIGIN;
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (mutating && (request.headers['sec-fetch-site'] === 'cross-site' ||
        (allowedOrigin && request.headers.origin && request.headers.origin !== allowedOrigin))) {
      response.status(403).json({ statusCode: 403, message: 'This request must come from the studio.' });
      return;
    }
    next();
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 4000), process.env.BIND_HOST ?? '127.0.0.1');
}

void bootstrap();
