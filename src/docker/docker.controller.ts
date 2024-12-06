import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { DockerService } from './docker.service';

@Controller('docker')
export class DockerController {
  constructor(private readonly dockerService: DockerService) {}

  @Get('containers/:connectionId')
  async listContainers(@Param('connectionId') connectionId: string) {
    return await this.dockerService.listContainers(connectionId);
  }

  @Get('images/:connectionId')
  async listImages(@Param('connectionId') connectionId: string) {
    return await this.dockerService.listImagesWithStatus(connectionId);
  }

  @Post('image/:connectionId/run')
  async runImage(
    @Param('connectionId') connectionId: string,
    @Body('imageName') imageName: string,
    @Body('containerName') containerName: string,
  ) {
    return await this.dockerService.runImage(
      connectionId,
      imageName,
      containerName,
    );
  }

  @Post('image/:connectionId/build')
  async buildImage(
    @Param('connectionId') connectionId: string,
    @Body('github_url') github_url: string,
    @Body('fine_grained_token') fine_grained_token: string,
    @Body('username') username: string,
    @Body('repository_name') repository_name: string,
  ) {
    return await this.dockerService.buildImage(connectionId, {
      fine_grained_token,
      repository_name,
      github_url,
      username,
    });
  }

  @Delete('image/:connectionId/:imageName')
  async upContainer(
    @Param('connectionId') connectionId: string,
    @Param('imageName') imageName: string,
  ) {
    return await this.dockerService.deleteImage(connectionId, imageName);
  }

  // TODO
  @Post('container/:connectionId/restart/:containerName')
  async restartContainer(
    @Param('connectionId') connectionId: string,
    @Param('containerName') containerName: string,
  ) {
    return await this.dockerService.restartContainer(
      connectionId,
      containerName,
    );
  }

  @Post('container/:connectionId/stop/:containerName')
  async stopContainer(
    @Param('connectionId') connectionId: string,
    @Param('containerName') containerName: string,
  ) {
    return await this.dockerService.stopContainer(connectionId, containerName);
  }

  @Post('container/:connectionId/start/:containerName')
  async startContainer(
    @Param('connectionId') connectionId: string,
    @Param('containerName') containerName: string,
  ) {
    return await this.dockerService.startContainer(connectionId, containerName);
  }
}
