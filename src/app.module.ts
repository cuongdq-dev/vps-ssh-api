import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DockerModule } from './docker/docker.module';
import { RepositoryModule } from './repository/repository.module';
import { ServerModule } from './server/server.module';

const modules = [ServerModule, DockerModule, RepositoryModule];

export const global_modules = [
  ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
];

@Module({ imports: [...global_modules, ...modules] })
export class AppModule {}
