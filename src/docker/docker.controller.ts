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

  @Post('repository/clone/:connectionId')
  async cloneRepository(
    @Param('connectionId') connectionId: string,
    @Body() body: Record<string, any>,
  ) {
    return await this.dockerService.cloneRepository(connectionId, body);
  }

  @Post('repository/delete/:connectionId')
  async removeRepository(
    @Param('connectionId') connectionId: string,
    @Body() body: Record<string, any>,
  ) {
    return await this.dockerService.deleteRepository(connectionId, {
      path: body?.path,
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
