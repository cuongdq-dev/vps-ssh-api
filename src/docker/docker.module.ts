import { Module } from '@nestjs/common';
import { ServerService } from 'src/server/server.service';
import { DockerController } from './docker.controller';
import { DockerService } from './docker.service';
import { ServerModule } from 'src/server/server.module';

@Module({
  imports: [ServerModule],
  controllers: [DockerController],
  providers: [DockerService],
})
export class DockerModule {}
