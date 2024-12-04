import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServerModule } from './server/server.module';
import { DockerModule } from './docker/docker.module';

const modules = [ServerModule, DockerModule];

export const global_modules = [
  ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
];

@Module({ imports: [...global_modules, ...modules] })
export class AppModule {}
