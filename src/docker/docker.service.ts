import { BadRequestException, Injectable } from '@nestjs/common';
import { ServerService } from '../server/server.service';
import { RunDockerDto } from './dto/docker.dto';

@Injectable()
export class DockerService {
  constructor(private readonly serverService: ServerService) {}

  async listContainers(connectionId: string) {
    const command = 'docker ps -a --format "{{json .}}"';
    try {
      const result = await this.serverService.executeTemporaryCommand(
        connectionId,
        command.trim(),
      );
      if (!result || !result.data) return [];

      const containers = result.data
        .split('\n')
        .map((container) => JSON.parse(container))
        .map((container) => ({
          id: container.ID,
          name: container.Names,
          image: container.Image,
          ports: container.Ports,
          state: container.State,
          status: container.Status,
          running_for: container.RunningFor,
          created_at: container.CreatedSince,
        }));

      return containers;
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }

  async listImagesWithStatus(connectionId: string) {
    const imagesCommand = 'docker images --format "{{json .}}"';
    const containersCommand =
      'docker ps -a --format "{{.ID}} {{.Image}} {{.Names}}"';

    try {
      const imagesResult = await this.serverService.executeTemporaryCommand(
        connectionId,
        imagesCommand.trim(),
      );
      if (!imagesResult || !imagesResult.data) return [];

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

      const containersResult = await this.serverService.executeTemporaryCommand(
        connectionId,
        containersCommand,
      );

      const runningContainers = containersResult
        ? containersResult.data.split('\n').map((line) => {
            const [containerId, imageName, containerName] = line.split(' ');
            return {
              containerId,
              imageName: imageName.split(':')[0],
              containerName,
            };
          })
        : [];

      return images.map((image) => {
        const runningContainer = runningContainers.find(
          (container) =>
            container.imageName === image.name ||
            container.imageName === image.id,
        );
        return {
          ...image,
          status: runningContainer ? 'In use' : 'Unused',
          container_id: runningContainer ? runningContainer.containerId : null,
          container_name: runningContainer
            ? runningContainer.containerName
            : null,
        };
      });
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }

  async runImage(connectionId: string, body: RunDockerDto) {
    const {
      imageName,
      imageId,
      imageTag,
      containerPort,
      hostPort,
      containerName,
      volumes,
      envVariables,
    } = body;

    const volumeOptions = volumes
      .map(({ hostPath, containerPath }) => {
        if (!hostPath || !containerPath) return null;
        return `-v ${hostPath}:${containerPath}`;
      })
      .filter(Boolean)
      .join(' ');

    const envOptions = envVariables
      .map(({ key, value }) => {
        if (!key || !value) return null;
        return `-e ${key}=${value}`;
      })
      .filter(Boolean)
      .join(' ');

    const command =
      `docker run -d ${hostPort && containerPort ? '-p ' + hostPort + ':' + containerPort : ''} ${containerName ? '--name ' + containerName : ''} ${volumeOptions} ${envOptions} ${imageName}:${imageTag}`.trim();

    try {
      const result = await this.serverService.executeTemporaryCommand(
        connectionId,
        command.trim(),
      );
      return result;
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }

  async buildImage(connectionId: string, body: Record<string, any>) {
    const {
      name: repository_name,
      fine_grained_token,
      github_url,
      username,
      services,
      repo_env,
    } = body;
    const baseFolder = 'projects';
    const sanitizedRepoName = repository_name.replace(/[^\w\-]/g, '_');
    const repoPath = `${baseFolder}/${sanitizedRepoName}`;

    const generateDockerComposeFile = () => {
      const dockerComposeConfig = {
        version: '3.8',
        services: {},
      };

      services?.forEach((service: any) => {
        dockerComposeConfig.services[service.serviceName] = {
          build: {
            context: service.buildContext,
          },
          env_file: service.envFile,
          ports: service.ports,
          environment: service.environment.reduce(
            (acc: Record<string, string>, env: any) => {
              acc[env.variable] = env.value;
              return acc;
            },
            {},
          ),
          volumes: service.volumes.map(
            (volume: any) => `${volume.hostPath}:${volume.containerPath}`,
          ),
        };
      });

      return JSON.stringify(dockerComposeConfig, null, 2);
    };

    const dockerComposeCommand =
      Number(services?.length) > 0
        ? `
      if [ ! -f "docker-compose.yml" ]; then \
          echo '${generateDockerComposeFile()}' > docker-compose.yml; \
        fi && \
      `
        : '';

    const envCommand = !!repo_env?.trim()
      ? `
      if [ ! -f ".env" ]; then \
        echo '${repo_env.trim()}' > .env; \
        fi && \
      `
      : '';

    const fullCommand = `
      CURRENT_DIR=$(pwd) && \
      mkdir -p "${baseFolder}" && \
      cd "${baseFolder}" && \
      if [ ! -d "${sanitizedRepoName}" ]; then \
        git clone https://${username}:${fine_grained_token}@${github_url.replace('https://', '')} "${sanitizedRepoName}"; \
      fi && \
      if [ -d "${sanitizedRepoName}" ]; then \
        cd "${sanitizedRepoName}" && git pull; \
      else \
        echo "Error: Repository not cloned successfully!" && exit 1; \
      fi && \
      ${dockerComposeCommand}
      ${envCommand}
        cd "$CURRENT_DIR"
    `.trim();

    try {
      const execute_result = await this.serverService.executeTemporaryCommand(
        connectionId,
        fullCommand,
      );
      return {
        id: body?.id,
        server_id: body?.server_id,
        connectionId: body?.connectionId,
        server_path: repoPath,
        pull_status: true,
        execute_result: execute_result,
      };
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }

  async deleteImage(connectionId: string, imageName: string) {
    const command = `docker rmi ${imageName}`;
    try {
      const result = await this.serverService.executeTemporaryCommand(
        connectionId,
        command.trim(),
      );
      return result;
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }

  // TODO
  async startContainer(connectionId: string, containerId: string) {
    const command = `docker start ${containerId}`;
    try {
      await this.serverService.executeTemporaryCommand(
        connectionId,
        command.trim(),
      );

      const result = await this.serverService.executeTemporaryCommand(
        connectionId,
        `docker ps -a --filter "id=${containerId}" --format "{{json .}}"`,
      );

      const container = JSON.parse(result.data.trim());
      return {
        id: container.ID,
        name: container.Names,
        image: container.Image,
        ports: container.Ports,
        state: container.State,
        status: container.Status,
        running_for: container.RunningFor,
        created_at: container.CreatedSince,
      };
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }

  async pauseContainer(connectionId: string, containerId: string) {
    const command = `docker pause ${containerId}`;
    try {
      await this.serverService.executeTemporaryCommand(
        connectionId,
        command.trim(),
      );

      // Lấy thông tin của container sau khi pause
      const result = await this.serverService.executeTemporaryCommand(
        connectionId,
        `docker ps -a --filter "id=${containerId}" --format "{{json .}}"`,
      );

      const container = JSON.parse(result.data.trim());

      return {
        id: container.ID,
        name: container.Names,
        image: container.Image,
        ports: container.Ports,
        state: container.State,
        status: container.Status,
        running_for: container.RunningFor,
        created_at: container.CreatedSince,
      };
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }

  async stopContainer(connectionId: string, containerId: string) {
    const command = `docker stop ${containerId}`;
    try {
      await this.serverService.executeTemporaryCommand(
        connectionId,
        command.trim(),
      );

      // Lấy thông tin của container sau khi stop
      const result = await this.serverService.executeTemporaryCommand(
        connectionId,
        `docker ps -a --filter "id=${containerId}" --format "{{json .}}"`,
      );

      const container = JSON.parse(result.data.trim());

      return {
        id: container.ID,
        name: container.Names,
        image: container.Image,
        ports: container.Ports,
        state: container.State,
        status: container.Status,
        running_for: container.RunningFor,
        created_at: container.CreatedSince,
      };
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }

  async restartContainer(connectionId: string, containerId: string) {
    const command = `docker restart ${containerId}`;

    try {
      await this.serverService.executeTemporaryCommand(
        connectionId,
        command.trim(),
      );

      // Lấy thông tin của container sau khi restart
      const result = await this.serverService.executeTemporaryCommand(
        connectionId,
        `docker ps -a --filter "id=${containerId}" --format "{{json .}}"`,
      );

      const container = JSON.parse(result.data.trim());

      return {
        id: container.ID,
        name: container.Names,
        image: container.Image,
        ports: container.Ports,
        state: container.State,
        status: container.Status,
        running_for: container.RunningFor,
        created_at: container.CreatedSince,
      };
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }

  async removeContainer(connectionId: string, containerId: string) {
    const command = `docker rm ${containerId}`;

    try {
      await this.serverService.executeTemporaryCommand(
        connectionId,
        command.trim(),
      );

      return { status: 200 };
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }

  async resumeContainer(connectionId: string, containerId: string) {
    const command = `docker unpause ${containerId}`;

    try {
      await this.serverService.executeTemporaryCommand(
        connectionId,
        command.trim(),
      );

      // Lấy thông tin của container sau khi resume
      const result = await this.serverService.executeTemporaryCommand(
        connectionId,
        `docker ps -a --filter "id=${containerId}" --format "{{json .}}"`,
      );

      const container = JSON.parse(result.data.trim());

      return {
        id: container.ID,
        name: container.Names,
        image: container.Image,
        ports: container.Ports,
        state: container.State,
        status: container.Status,
        running_for: container.RunningFor,
        created_at: container.CreatedSince,
      };
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }
}
