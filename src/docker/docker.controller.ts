import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
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

  @Post('image/build/:connectionId')
  async buildImage(
    @Param('connectionId') connectionId: string,
    @Body() body: Record<string, any>,
  ) {
    return await this.dockerService.buildImage(connectionId, body);
  }

  @Delete('image/:connectionId/:imageName')
  async upContainer(
    @Param('connectionId') connectionId: string,
    @Param('imageName') imageName: string,
  ) {
    return await this.dockerService.deleteImage(connectionId, imageName);
  }

  // API ACTION IMAGE:

  @Post('image/up/:connectionId')
  async upDockerImage(
    @Param('connectionId') connectionId: string,
    @Body('imageName') imageName: string,
    @Body('imageId') imageId: string,
    @Body('serverPath') serverPath: string,
    @Body('serviceName') serviceName: string,
  ) {
    const body = {
      imageName,
      imageId,
      serverPath,
      serviceName,
    };
    return await this.dockerService.upDockerImage(connectionId, body);
  }

  @Post('image/down/:connectionId')
  async downDockerImage(
    @Param('connectionId') connectionId: string,
    @Body('imageName') imageName: string,
    @Body('imageId') imageId: string,
    @Body('serverPath') serverPath: string,
    @Body('serviceName') serviceName: string,
  ) {
    const body = {
      imageName,
      imageId,
      serverPath,
      serviceName,
    };
    return await this.dockerService.downDockerImage(connectionId, body);
  }

  // API ACTION CONTAINER:
  @Post('container/start/:connectionId/:containerName')
  async startContainer(
    @Param('connectionId') connectionId: string,
    @Param('containerName') containerName: string,
  ) {
    return await this.dockerService.startContainer(connectionId, containerName);
  }

  @Post('container/pause/:connectionId/:containerName')
  async pauseContainer(
    @Param('connectionId') connectionId: string,
    @Param('containerName') containerName: string,
  ) {
    return await this.dockerService.pauseContainer(connectionId, containerName);
  }

  @Post('container/stop/:connectionId/:containerName')
  async stopContainer(
    @Param('connectionId') connectionId: string,
    @Param('containerName') containerName: string,
  ) {
    return await this.dockerService.stopContainer(connectionId, containerName);
  }

  @Post('container/restart/:connectionId/:containerName')
  async restartContainer(
    @Param('connectionId') connectionId: string,
    @Param('containerName') containerName: string,
  ) {
    return await this.dockerService.restartContainer(
      connectionId,
      containerName,
    );
  }

  @Post('container/resume/:connectionId/:containerName')
  async resumeContainer(
    @Param('connectionId') connectionId: string,
    @Param('containerName') containerName: string,
  ) {
    return await this.dockerService.resumeContainer(
      connectionId,
      containerName,
    );
  }

  @Post('container/remove/:connectionId/:containerName')
  async removeContainer(
    @Param('connectionId') connectionId: string,
    @Param('containerName') containerName: string,
  ) {
    return await this.dockerService.removeContainer(
      connectionId,
      containerName,
    );
  }
}
