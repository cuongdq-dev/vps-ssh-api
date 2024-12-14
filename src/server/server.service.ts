import { BadRequestException, Injectable } from '@nestjs/common';
import { Config, NodeSSH } from 'node-ssh';
import { ServerStatusDto, ServiceStatusDto } from './dto/server.dto';

@Injectable()
export class ServerService {
  public clients: Record<string, NodeSSH> = {};

  async connect(
    host: string,
    username: string,
    password: string,
    owner_id: string,
  ) {
    try {
      const ssh = new NodeSSH();
      await ssh.connect({ host, username, password, tryKeyboard: true });

      const connectionId = `${owner_id}_${host}_${username}`;
      this.clients[connectionId] = ssh;
      return { status: 200, connectionId: connectionId };
    } catch (err) {
      throw new BadRequestException(err.message || err);
    }
  }

  async executeCommand(connectionId: string, command: string) {
    const client = this.clients[connectionId];
    if (!client.isConnected())
      throw new BadRequestException('Connection not found');

    try {
      const result = await client.execCommand(command + ' 2>&1');
      if (result.code !== 0 || result.stderr.length > 0)
        throw new BadRequestException(result.stderr);
      return { status: 200, data: result.stdout.trim() };
    } catch (err) {
      throw new BadRequestException(`${err.message || err}`);
    }
  }

  disconnect(connectionId: string): void {
    const client = this.clients[connectionId];
    if (client) {
      client.dispose();
      delete this.clients[connectionId];
      console.log(`SSH connection closed for ${connectionId}`);
    }
  }
  async executeTemporaryCommand(connectionId: string, command: string) {
    const client = this.clients[connectionId];
    const clientConfig = client?.connection?.config as Config;

    if (!client.isConnected())
      throw new BadRequestException('Connection not found');

    const temporarySsh = new NodeSSH();

    try {
      await temporarySsh.connect(clientConfig);
      const result = await temporarySsh.execCommand(command + ' 2>&1', {});
      console.log('------->', command, '<---------');
      console.log('------->', result);
      if (result.code !== 0 || result.stderr.length > 0)
        throw new BadRequestException(result?.stderr);
      return { status: 200, data: result.stdout.trim() };
    } catch (err) {
      throw new BadRequestException(`${err.message || err}`);
    } finally {
      temporarySsh.dispose();
    }
  }

  async setupDocker(connectionId: string, script: string) {
    if (!script) throw new BadRequestException('Script not found!');
    if (!connectionId) throw new BadRequestException('Server disconnected!');
    const result = await this.executeTemporaryCommand(connectionId, script);
    return result;
  }

  async serverStatus(connectionId: string): Promise<ServerStatusDto> {
    const ramCommand = 'free -m';
    const cpuCommand = "top -bn1 | grep 'Cpu(s)'";
    const diskCommand = 'df -h --total | grep total';

    const [ramInfo, cpuInfo, diskInfo] = await Promise.all([
      this.executeTemporaryCommand(connectionId, ramCommand),
      this.executeTemporaryCommand(connectionId, cpuCommand),
      this.executeTemporaryCommand(connectionId, diskCommand),
    ]);

    const ram = this.parseRamInfo(ramInfo.data);
    const cpu = this.parseCpuInfo(cpuInfo.data);
    const disk = this.parseDiskInfo(diskInfo.data);

    return {
      categories: ['ram', 'cpu', 'disk'],
      used: [ram.used, cpu.used, disk.used],
      available: [ram.available, cpu.available, disk.available],
      units: ['MB', '%', 'GB'],
    };
  }

  async cloneRepository(
    connectionId: string,
    body: {
      github_url: string;
      repository_name: string;
      fine_grained_token: string;
      username: string;
    },
  ) {
    const { repository_name, fine_grained_token, github_url, username } = body;

    const baseFolder = 'projects';
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
      cd "${sanitizedRepoName}" && \
      if [ -f "docker-compose.yml" ]; then \
        BỎ QUA; \
      else \
        TẠO NỘI DUNG CHO FILE DOCKER_COMPOSE.YML \
      fi && \
      cd "$CURRENT_DIR"
    `;

    try {
      const result = await this.executeTemporaryCommand(
        connectionId,
        command.trim(),
      );
      return result; //TRẢ VỀ THÔNG TIN IMAGES ĐÃ BUILD
    } catch (error) {
      throw new BadRequestException(`${error.message}`);
    }
  }

  async getService(
    connectionId: string,
    service: string,
  ): Promise<ServiceStatusDto> {
    const netstatCommand = 'ss -tuln';
    const netstatInfo = await this.executeTemporaryCommand(
      connectionId,
      netstatCommand,
    );
    const serviceInfo = await this.executeTemporaryCommand(
      connectionId,
      `which ${service}`,
    );

    return await this.parseServiceInfo(
      connectionId,
      service,
      serviceInfo.data,
      netstatInfo.data,
    );
  }

  private parseRamInfo(data: string) {
    const lines = data.split('\n');
    const memLine = lines.find((line) => line.includes('Mem:')) || '';
    const [_, total, used, available] = memLine.split(/\s+/);
    return {
      used: parseInt(used, 10),
      available: parseInt(available, 10),
    };
  }

  private parseCpuInfo(data: string) {
    const usage = data.match(/(\d+\.\d+)\s+us/);
    const used = usage ? parseFloat(usage[1]) : 0;
    return {
      used,
      available: 100 - used,
    };
  }

  private parseDiskInfo(data: string) {
    const [_, total, used, available] = data.split(/\s+/);
    return {
      used: parseFloat(used.replace('G', '')),
      available: parseFloat(available.replace('G', '')),
    };
  }

  private async parseServiceInfo(
    connectionId: string,
    service: string,
    serviceInfo: string,
    netstatInfo: string,
  ): Promise<ServiceStatusDto> {
    const isInstalled = serviceInfo.trim() !== '';
    let port = '';
    let memoryUsage = 'N/A';
    let isActive = false;

    if (isInstalled) {
      const servicePortMatch = netstatInfo.match(new RegExp(`.*:${service}.*`));
      if (servicePortMatch) {
        port = servicePortMatch[0].split(' ')[3];
      }

      const systemctlStatus = await this.executeTemporaryCommand(
        connectionId,
        `systemctl is-active ${service === 'psql' ? 'postgresql' : service}`,
      );
      isActive = systemctlStatus?.data?.trim() === 'active';

      if (service === 'docker') {
        const dockerStats = await this.executeTemporaryCommand(
          connectionId,
          'docker stats --no-stream --format "{{.MemUsage}}"',
        );
        memoryUsage = dockerStats?.data?.trim();
      } else {
        const serviceSize = await this.executeTemporaryCommand(
          connectionId,
          `du -sh /var/lib/${service}`,
        );
        memoryUsage = serviceSize?.data?.split('\t')[0];
      }
    }

    return {
      service,
      is_installed: isInstalled,
      is_active: isActive,
      port,
      memory_usage: 'Memory Usage - ' + memoryUsage,
    };
  }
}
