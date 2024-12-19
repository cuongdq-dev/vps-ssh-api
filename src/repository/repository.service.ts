import { BadRequestException, Injectable } from '@nestjs/common';
import { stringify } from 'yaml';
import { ServerService } from '../server/server.service';
@Injectable()
export class RepositoryService {
  constructor(private readonly serverService: ServerService) {}

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
      git clone https://${username}:${fine_grained_token}@${github_url.replace('https://', '')} "${sanitizedRepoName}" || { echo "Error: Repository not found" && exit 1; } \
    fi && \
    if [ -d "${sanitizedRepoName}" ]; then \
      cd "${sanitizedRepoName}" && \
      git pull || { echo "Error: Git pull failed" && exit 1; } \
    else \
      echo "Error: Repository not cloned successfully!" && exit 1; \
    fi && \
    cd "$CURRENT_DIR" || exit 1
  `.trim();

    try {
      const { error, status } =
        await this.serverService.executeTemporaryCommand(
          connectionId,
          fullCommand,
        );

      return {
        error,
        status,
        data: {
          id: body?.id,
          server_id: body?.server_id,
          connectionId: body?.connectionId,
          server_path: repoPath,
          pull_status: true,
        },
      };
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }
  async buildRepository(connectionId: string, body: Record<string, any>) {
    const { name: repository_name, server_path, services, repo_env } = body;
    const dockerComposeValue = this.generateDockerComposeFile(
      services,
      repository_name,
    );
    const dockerComposeCommand =
      Number(services?.length) > 0
        ? `echo '${stringify(dockerComposeValue)}' > docker-compose.yml && `
        : '';

    const envCommand = !!repo_env?.trim()
      ? `echo '${repo_env.trim()}' > .env && `
      : '';

    const fullCommand =
      `cd ${server_path} && ${dockerComposeCommand} ${envCommand} docker-compose build`.trim();

    try {
      const result = await this.serverService.executeTemporaryCommand(
        connectionId,
        fullCommand,
      );

      const newServices = services?.map((service) => {
        return {
          ...service,
          image: dockerComposeValue?.services[service?.serviceName]?.image,
        };
      });
      return { ...result, data: { service: newServices } };
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
        ports: [service?.ports],
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

  // HELPER
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
        ports: service.ports ? [service.ports] : [''],
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

    return dockerComposeConfig;
  };
}
