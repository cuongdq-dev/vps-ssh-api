import { BadRequestException, Injectable } from '@nestjs/common';
import { ServerService } from '../server/server.service';

@Injectable()
export class DockerService {
  constructor(private readonly serverService: ServerService) {}

  async listContainers(connectionId: string) {
    const command =
      'docker ps -a --format "{{.ID}} {{.Names}} {{.Image}} {{.Status}}"';
    const result = await this.serverService.executeCommand(
      connectionId,
      command,
    );

    if (!result) return [];

    return result.data.split('\n').map((line) => {
      const [id, name, image, ...status] = line.split(' ');
      return { id, name, image, status: status.join(' ') };
    });
  }

  async listImagesWithStatus(connectionId: string) {
    const imagesCommand = 'docker images --format "{{json .}}"';
    const containersCommand = 'docker ps --format "{{.Image}}"';
    const imagesResult = await this.serverService.executeCommand(
      connectionId,
      imagesCommand,
    );
    if (!imagesResult) return [];

    const images = imagesResult.data
      .split('\n')
      .map((image) => JSON.parse(image))
      .map((image) => ({
        id: image.ID,
        name: image.Repository,
        tag: image.Tag,
        size: image.Size,
        created: image.CreatedSince,
      }));

    const containersResult = await this.serverService.executeCommand(
      connectionId,
      containersCommand,
    );

    const runningImages = containersResult
      ? containersResult.data.split('\n')
      : [];
    return images.map((image) => ({
      ...image,
      status: runningImages.includes(image.name) ? 'In use' : 'Unused',
    }));
  }

  async runImage(
    connectionId: string,
    imageName: string,
    containerName?: string,
  ) {
    const command = containerName
      ? `docker run -d --name ${containerName} ${imageName}`
      : `docker run -d ${imageName}`;

    return await this.serverService.executeCommand(connectionId, command);
  }

  async deleteImage(connectionId: string, imageName: string) {
    const command = `docker rmi ${imageName}`;
    return await this.serverService.executeCommand(connectionId, command);
  }

  // TODO

  async restartContainer(connectionId: string, imageContainer: string) {
    const command = `docker restart ${imageContainer}`;
    return await this.serverService.executeCommand(connectionId, command);
  }

  async stopContainer(connectionId: string, containerName: string) {
    const command = `docker stop ${containerName}`;
    return await this.serverService.executeCommand(connectionId, command);
  }

  async startContainer(connectionId: string, containerName: string) {
    const command = `docker start ${containerName}`;
    return await this.serverService.executeCommand(connectionId, command);
  }
}
