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

  @Post('image/run/:connectionId')
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

  @Post('image/build/:connectionId')
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

  // API ACTION CONTAINER
  @Post('container/start/:connectionId/:containerName')
  async startContainer(
    @Param('connectionId') connectionId: string,
    @Param('containerName') containerName: string,
  ) {
    try {
      const result = await this.dockerService.startContainer(
        connectionId,
        containerName,
      );
      return { message: 'Container started successfully', result };
    } catch (error) {
      throw new BadRequestException(
        `Failed to start container: ${error.message}`,
      );
    }
  }

  @Post('container/pause/:connectionId/:containerName')
  async pauseContainer(
    @Param('connectionId') connectionId: string,
    @Param('containerName') containerName: string,
  ) {
    try {
      const result = await this.dockerService.pauseContainer(
        connectionId,
        containerName,
      );
      return { message: 'Container paused successfully', result };
    } catch (error) {
      throw new BadRequestException(
        `Failed to pause container: ${error.message}`,
      );
    }
  }

  @Post('container/stop/:connectionId/:containerName')
  async stopContainer(
    @Param('connectionId') connectionId: string,
    @Param('containerName') containerName: string,
  ) {
    try {
      const result = await this.dockerService.stopContainer(
        connectionId,
        containerName,
      );
      return { message: 'Container stopped successfully', result };
    } catch (error) {
      throw new BadRequestException(
        `Failed to stop container: ${error.message}`,
      );
    }
  }

  @Post('container/restart/:connectionId/:containerName')
  async restartContainer(
    @Param('connectionId') connectionId: string,
    @Param('containerName') containerName: string,
  ) {
    try {
      const result = await this.dockerService.restartContainer(
        connectionId,
        containerName,
      );
      return { message: 'Container restarted successfully', result };
    } catch (error) {
      throw new BadRequestException(
        `Failed to restart container: ${error.message}`,
      );
    }
  }

  @Post('container/resume/:connectionId/:containerName')
  async resumeContainer(
    @Param('connectionId') connectionId: string,
    @Param('containerName') containerName: string,
  ) {
    try {
      const result = await this.dockerService.resumeContainer(
        connectionId,
        containerName,
      );
      return { message: 'Container resumed successfully', result };
    } catch (error) {
      throw new BadRequestException(
        `Failed to restart container: ${error.message}`,
      );
    }
  }

  @Post('container/remove/:connectionId/:containerName')
  async removeContainer(
    @Param('connectionId') connectionId: string,
    @Param('containerName') containerName: string,
  ) {
    try {
      const result = await this.dockerService.removeContainer(
        connectionId,
        containerName,
      );
      return { message: 'Container removed successfully', result };
    } catch (error) {
      throw new BadRequestException(
        `Failed to remove container: ${error.message}`,
      );
    }
  }
}
