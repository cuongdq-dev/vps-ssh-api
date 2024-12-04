import { Controller, Get, Param, Post } from '@nestjs/common';
import { DockerService } from './docker.service';

@Controller('docker')
export class DockerController {
  constructor(private readonly dockerService: DockerService) {}

  @Get(':connectionId/containers')
  async listContainers(
    @Param('connectionId') connectionId: string,
  ): Promise<string[]> {
    return await this.dockerService.listContainers(connectionId);
  }

  @Post(':connectionId/restart/:containerName')
  async restartContainer(
    @Param('connectionId') connectionId: string,
    @Param('containerName') containerName: string,
  ): Promise<string> {
    return await this.dockerService.restartContainer(
      connectionId,
      containerName,
    );
  }

  @Post(':connectionId/stop/:containerName')
  async stopContainer(
    @Param('connectionId') connectionId: string,
    @Param('containerName') containerName: string,
  ): Promise<string> {
    return await this.dockerService.stopContainer(connectionId, containerName);
  }

  @Post(':connectionId/start/:containerName')
  async startContainer(
    @Param('connectionId') connectionId: string,
    @Param('containerName') containerName: string,
  ): Promise<string> {
    return await this.dockerService.startContainer(connectionId, containerName);
  }
}
