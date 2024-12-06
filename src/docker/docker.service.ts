import { BadRequestException, Injectable } from '@nestjs/common';
import { ServerService } from '../server/server.service';
import { Config } from 'node-ssh';

@Injectable()
export class DockerService {
  constructor(private readonly serverService: ServerService) {}

  async listContainers(connectionId: string) {
    const command =
      'docker ps -a --format "{{.ID}} {{.Names}} {{.Image}} {{.Status}}"';
    const existingClient = this.serverService.clients[connectionId];
    if (!existingClient) throw new BadRequestException('Connection not found');
    try {
      const result = await this.serverService.executeTemporaryCommand(
        existingClient.connection.config as Config,
        command.trim(),
      );
      if (!result) return [];

      return result.data.split('\n').map((line) => {
        const [id, name, image, ...status] = line.split(' ');
        return { id, name, image, status: status.join(' ') };
      });
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }

  async listImagesWithStatus(connectionId: string) {
    const imagesCommand = 'docker images --format "{{json .}}"';
    const containersCommand = 'docker ps --format "{{.Image}}"';
    const existingClient = this.serverService.clients[connectionId];
    if (!existingClient) throw new BadRequestException('Connection not found');
    try {
      const imagesResult = await this.serverService.executeTemporaryCommand(
        existingClient.connection.config as Config,
        imagesCommand.trim(),
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
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }

  async runImage(
    connectionId: string,
    imageName: string,
    containerName?: string,
  ) {
    const command = containerName
      ? `docker run -d --name ${containerName} ${imageName}`
      : `docker run -d ${imageName}`;

    const existingClient = this.serverService.clients[connectionId];
    if (!existingClient) throw new BadRequestException('Connection not found');
    try {
      const result = await this.serverService.executeTemporaryCommand(
        existingClient.connection.config as Config,
        command.trim(),
      );
      return result;
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }

  async buildImage(
    connectionId: string,
    body: {
      github_url: string;
      repository_name: string;
      fine_grained_token: string;
      username: string;
    },
  ) {
    const { repository_name, fine_grained_token, github_url, username } = body;

    const baseFolder = 'projects-test';
    const sanitizedRepoName = repository_name.replace(/[^\w\-]/g, '_');

    const command = `
      CURRENT_DIR=$(pwd) && \
      mkdir -p "${baseFolder}" && \
      cd "${baseFolder}" && \
      if [ ! -d "${sanitizedRepoName}" ]; then \
        git clone https://${username}:${fine_grained_token}@${github_url.replace(
          'https://',
          '',
        )} "${sanitizedRepoName}"; \
      else \
        cd "${sanitizedRepoName}" && git pull && cd ..; \
      fi && \
      cd "${sanitizedRepoName}" && docker-compose build && \
      cd "$CURRENT_DIR"
    `;

    const existingClient = this.serverService.clients[connectionId];
    if (!existingClient) throw new BadRequestException('Connection not found');
    try {
      const result = await this.serverService.executeTemporaryCommand(
        existingClient.connection.config as Config,
        command.trim(),
      );
      return result;
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }

  async deleteImage(connectionId: string, imageName: string) {
    const command = `docker rmi ${imageName}`;
    const existingClient = this.serverService.clients[connectionId];
    if (!existingClient) throw new BadRequestException('Connection not found');
    try {
      const result = await this.serverService.executeTemporaryCommand(
        existingClient.connection.config as Config,
        command.trim(),
      );
      return result;
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
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
