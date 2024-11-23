import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createApplication, documentationBuilder } from './utils/bootstrap';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  createApplication(app);
  const userConfigService = app.get(ConfigService);
  documentationBuilder(app, userConfigService, process.env.APP_NAME);
  await app.listen(userConfigService.get('APP_PORT') || 5000);
}
bootstrap();
