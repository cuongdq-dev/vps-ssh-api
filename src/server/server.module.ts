import { Module } from '@nestjs/common';
import { ServerController } from './server.controller';
import { ServerService } from './server.service';

@Module({
  controllers: [ServerController],
  exports: [ServerService],
  providers: [ServerService],
})
export class ServerModule {}
