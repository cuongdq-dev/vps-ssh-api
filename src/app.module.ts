import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DockerModule } from './docker/docker.module';

const modules = [DockerModule];

export const global_modules = [
  ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
];

@Module({ imports: [...global_modules, ...modules] })
export class AppModule {}
