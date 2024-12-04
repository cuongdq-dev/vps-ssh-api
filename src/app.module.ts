import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

const modules = [];

export const global_modules = [
  ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
];

@Module({ imports: [...global_modules, ...modules] })
export class AppModule {}
