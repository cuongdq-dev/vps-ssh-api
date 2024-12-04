import { Injectable } from '@nestjs/common';
import { ServerService } from '../server/server.service';

@Injectable()
export class DockerService {
  constructor(private readonly serverService: ServerService) {}

  async listContainers(connectionId: string): Promise<string[]> {
    const command = 'docker ps --format "{{.Names}}"';
    const result = await this.serverService.executeCommand(
      connectionId,
      command,
    );
    return result ? result.split('\n') : [];
  }

  async restartContainer(
    connectionId: string,
    containerName: string,
  ): Promise<string> {
    const command = `docker restart ${containerName}`;
    return await this.serverService.executeCommand(connectionId, command);
  }

  async stopContainer(
    connectionId: string,
    containerName: string,
  ): Promise<string> {
    const command = `docker stop ${containerName}`;
    return await this.serverService.executeCommand(connectionId, command);
  }

  async startContainer(
    connectionId: string,
    containerName: string,
  ): Promise<string> {
    const command = `docker start ${containerName}`;
    return await this.serverService.executeCommand(connectionId, command);
  }
}
