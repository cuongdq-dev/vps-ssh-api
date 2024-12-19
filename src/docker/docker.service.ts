import { BadRequestException, Injectable } from '@nestjs/common';
import { parse, stringify } from 'yaml';
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
      if (!result || !result.data) return { ...result, data: [] };

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

      return { ...result, data: containers };
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
      if (!imagesResult || !imagesResult.data)
        return { ...imagesResult, data: [] };

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
        ? containersResult?.data?.split('\n')?.map((line) => {
            const [containerId, imageName, containerName] = line.split(' ');
            return {
              containerId,
              imageName: imageName?.split(':')[0],
              containerName,
            };
          })
        : [];

      return {
        ...imagesResult,
        data: images?.map((image) => {
          const runningContainer = runningContainers.find(
            (container) =>
              container.imageName === image.name ||
              container.imageName === image.id,
          );
          return {
            ...image,
            status: runningContainer ? 'In use' : 'Unused',
            container_id: runningContainer
              ? runningContainer.containerId
              : null,
            container_name: runningContainer
              ? runningContainer.containerName
              : null,
          };
        }),
      };
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }

  async detailImageWithStatus(connectionId: string, image: string) {
    const imageCommand = `docker images --format "{{json .}}" | grep "${image}"`;
    const containerCommand = `docker ps -a --filter "ancestor=${image}" --format "{{json .}}"`;

    try {
      const imageResult = await this.serverService.executeTemporaryCommand(
        connectionId,
        imageCommand.trim(),
      );

      const containerResult = await this.serverService.executeTemporaryCommand(
        connectionId,
        containerCommand.trim(),
      );

      const image = JSON.parse(imageResult?.data);
      const container =
        containerResult && containerResult.data
          ? JSON.parse(containerResult?.data)
          : undefined;

      return {
        id: image.ID,
        name: image.Repository,
        tag: image.Tag,
        size: image.Size,
        created: image.CreatedSince,
        status: !!container ? 'In use' : 'Unused',
        container_id: container ? container.ID : null,
        container_name: container ? container.Name : null,
      };
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

    const dockerComposeCommand =
      Number(services?.length) > 0
        ? `echo '${this.generateDockerComposeFile(services, sanitizedRepoName)}' > docker-compose.yml && `
        : '';

    const envCommand = !!repo_env?.trim()
      ? `echo '${repo_env.trim()}' > .env && `
      : '';

    const fullCommand = `
    set -e && \
    CURRENT_DIR=$(pwd) && \
    mkdir -p "${baseFolder}" && \
    cd "${baseFolder}" && \
    if [ ! -d "${sanitizedRepoName}" ]; then \
      timeout 30s git clone https://${username}:${fine_grained_token}@${github_url.replace('https://', '')} "${sanitizedRepoName}" || { echo "Error: Repository not found" && exit 1; } \
    fi && \
    if [ -d "${sanitizedRepoName}" ]; then \
      cd "${sanitizedRepoName}" && \
      timeout 30s git pull || { echo "Error: Git pull failed" && exit 1; } \
    else \
      echo "Error: Repository not cloned successfully!" && exit 1; \
    fi && \
    ${dockerComposeCommand} \
    ${envCommand} \
    docker-compose build || { echo "Error: Docker-compose build failed" && exit 1; } && \
    cd "$CURRENT_DIR" || exit 1
  `.trim();

    try {
      const execute_result = await this.serverService.executeTemporaryCommand(
        connectionId,
        fullCommand,
      );

      const getDockerComposeFile =
        await this.serverService.executeTemporaryCommand(
          connectionId,
          `cd ${repoPath} && cat docker-compose.yml`,
        );

      const parseService = parse(getDockerComposeFile.data);

      const getEnv = await this.serverService.executeTemporaryCommand(
        connectionId,
        `cd ${repoPath} && cat .env`,
      );

      const servicesArr = this.convertFileToJSON(
        parseService,
        sanitizedRepoName,
      );

      return {
        id: body?.id,
        server_id: body?.server_id,
        connectionId: body?.connectionId,
        server_path: repoPath,
        pull_status: true,
        services: servicesArr,
        repo_env: getEnv.data,
        execute_result,
      };
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }

  async cloneRepository(connectionId: string, body: Record<string, any>) {
    const {
      name: repository_name,
      fine_grained_token,
      github_url,
      username,
    } = body;
    const baseFolder = 'projects';
    const sanitizedRepoName = repository_name.replace(/[^\w\-]/g, '_');
    const repoPath = `${baseFolder}/${sanitizedRepoName}`;

    const fullCommand = `
    set -e && \
    CURRENT_DIR=$(pwd) && \
    mkdir -p "${baseFolder}" && \
    cd "${baseFolder}" && \
    if [ ! -d "${sanitizedRepoName}" ]; then \
      timeout 30s git clone https://${username}:${fine_grained_token}@${github_url.replace('https://', '')} "${sanitizedRepoName}" || { echo "Error: Repository not found" && exit 1; } \
    fi && \
    if [ -d "${sanitizedRepoName}" ]; then \
      cd "${sanitizedRepoName}" && \
      timeout 30s git pull || { echo "Error: Git pull failed" && exit 1; } \
    else \
      echo "Error: Repository not cloned successfully!" && exit 1; \
    fi && \
    cd "$CURRENT_DIR" || exit 1
  `.trim();

    try {
      const execute_result = await this.serverService.executeTemporaryCommand(
        connectionId,
        fullCommand,
      );

      const getDockerComposeFile = await this.serverService.executeCommand(
        connectionId,
        `cd ${repoPath} && cat docker-compose.yml`,
      );

      const parseService =
        getDockerComposeFile.data && parse(getDockerComposeFile.data);

      const getEnv = await this.serverService.executeCommand(
        connectionId,
        `cd ${repoPath} && cat .env`,
      );

      const servicesArr = this.convertFileToJSON(
        parseService,
        sanitizedRepoName,
      );

      return {
        id: body?.id,
        server_id: body?.server_id,
        connectionId: body?.connectionId,
        server_path: repoPath,
        pull_status: true,
        services: servicesArr,
        repo_env: getEnv?.data || undefined,
        execute_result,
      };
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }

  async deleteRepository(connectionId: string, { path }: { path: string }) {
    const checkPathCommand = `if [ -d "${path}" ] || [ -f "${path}" ]; then echo "exists"; else echo "Path ${path} does not exist." >&2; fi`;
    const deleteCommand = `rm -rf ${path}`;

    try {
      await this.serverService.executeTemporaryCommand(
        connectionId,
        checkPathCommand,
      );

      const result = await this.serverService.executeTemporaryCommand(
        connectionId,
        deleteCommand.trim(),
      );
      return result;
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }

  async upDockerImage(
    connectionId: string,
    body: {
      imageName: string;
      imageId: string;
      serverPath: string;
      serviceName: string;
    },
  ) {
    const command = `cd ${body.serverPath} && docker-compose up ${body.serviceName} -d`;
    try {
      const result = await this.serverService.executeTemporaryCommand(
        connectionId,
        command.trim(),
      );
      const detail = await this.detailImageWithStatus(
        connectionId,
        body.imageId,
      );
      return { status: result.status, data: detail, error: result.error };
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }

  async downDockerImage(
    connectionId: string,
    body: {
      imageName: string;
      imageId: string;
      serverPath: string;
      serviceName: string;
    },
  ) {
    const command = `cd ${body.serverPath} && docker-compose down ${body.serviceName}`;
    try {
      const result = await this.serverService.executeTemporaryCommand(
        connectionId,
        command.trim(),
      );
      const detail = await this.detailImageWithStatus(
        connectionId,
        body.imageId,
      );
      return { status: result.status, data: detail, error: result.error };
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }

  async reBuildDockerImage(
    connectionId: string,
    body: {
      imageName: string;
      imageId: string;
      serverPath: string;
      serviceName: string;
    },
  ) {
    const command = `cd ${body.serverPath} && git pull && docker-compose build ${body.serviceName}`;
    try {
      const result = await this.serverService.executeTemporaryCommand(
        connectionId,
        command.trim(),
      );
      const detail = await this.detailImageWithStatus(
        connectionId,
        body.imageId,
      );

      return { ...result, data: detail };
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

      const container = JSON.parse(result?.data);
      return {
        ...result,
        data: {
          id: container?.ID,
          name: container?.Names,
          image: container?.Image,
          ports: container?.Ports,
          state: container?.State,
          status: container?.Status,
          running_for: container?.RunningFor,
          created_at: container?.CreatedSince,
        },
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
        ...result,
        data: {
          id: container?.ID,
          name: container?.Names,
          image: container?.Image,
          ports: container?.Ports,
          state: container?.State,
          status: container?.Status,
          running_for: container?.RunningFor,
          created_at: container?.CreatedSince,
        },
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
        ...result,
        data: {
          id: container?.ID,
          name: container?.Names,
          image: container?.Image,
          ports: container?.Ports,
          state: container?.State,
          status: container?.Status,
          running_for: container?.RunningFor,
          created_at: container?.CreatedSince,
        },
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

      const container = JSON.parse(result?.data);

      return {
        ...result,
        data: {
          id: container?.ID,
          name: container?.Names,
          image: container?.Image,
          ports: container?.Ports,
          state: container?.State,
          status: container?.Status,
          running_for: container?.RunningFor,
          created_at: container?.CreatedSince,
        },
      };
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }

  async removeContainer(connectionId: string, containerId: string) {
    const command = `docker rm ${containerId}`;

    try {
      return await this.serverService.executeTemporaryCommand(
        connectionId,
        command.trim(),
      );
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
        ...result,
        data: {
          id: container?.ID,
          name: container?.Names,
          image: container?.Image,
          ports: container?.Ports,
          state: container?.State,
          status: container?.Status,
          running_for: container?.RunningFor,
          created_at: container?.CreatedSince,
        },
      };
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }

  // Helper:

  generateDockerComposeFile = (
    services: Record<string, any>,
    sanitizedRepoName: string,
  ) => {
    const dockerComposeConfig = {
      services: {},
    };
    services?.forEach((service: any) => {
      const volumes = service.volumes
        ? service.volumes.reduce((acc: string[], volume: any) => {
            if (volume.hostPath && volume.containerPath) {
              acc.push(`${volume.hostPath}:${volume.containerPath}`);
            }
            return acc;
          }, [])
        : [];

      const environment = service.environment
        ? service.environment.reduce((acc: string[], env: any) => {
            if (env.variable && env.value) {
              acc.push(`${env.variable}=${env.value}`);
            }
            return acc;
          }, [])
        : [];

      dockerComposeConfig.services[service.serviceName] = {
        build: {
          context: service.buildContext,
        },
        image: sanitizedRepoName + '-' + service.serviceName + ':latest',
        env_file: service.envFile,
        ports: service.ports ? service.ports : [''],
        volumes: volumes,
        environment: environment,
      };
      if (environment.length == 0)
        delete dockerComposeConfig.services[service.serviceName].environment;
      if (volumes.length == 0)
        delete dockerComposeConfig.services[service.serviceName].volumes;
      if (service.ports == 0)
        delete dockerComposeConfig.services[service.serviceName].ports;
    });

    return stringify(dockerComposeConfig);
  };

  convertFileToJSON = (parseService: any, sanitizedRepoName: string) => {
    return Object.keys(parseService.services)?.map((serviceName: string) => {
      const service = parseService.services[serviceName];

      return {
        serviceName,
        image:
          service?.image ||
          sanitizedRepoName +
            (!!service?.serviceName ? '-' + service?.serviceName : '') +
            ':latest',
        buildContext: service?.build?.context,
        envFile: service?.env_file,
        ports: service?.ports,
        environment: service?.environment
          ? service.environment.map((env: string) => {
              const [variable, value] = env.split('=');
              return { variable, value };
            })
          : [],
        volumes: service?.volumes
          ? service.volumes.map((volume: string) => {
              const [hostPath, containerPath] = volume.split(':');
              return { hostPath, containerPath };
            })
          : [],
      };
    });
  };
}
