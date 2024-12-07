import { BadRequestException, Injectable } from '@nestjs/common';
import { NodeSSH, Config, SSHExecCommandResponse } from 'node-ssh';
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
      await ssh.connect({ host, username, password });
      const connectionId = `${owner_id}_${host}_${username}`;
      this.clients[connectionId] = ssh;
      return { status: 200, connectionId: connectionId };
    } catch (err) {
      throw new BadRequestException(err.message || err);
    }
  }

  async executeCommand(connectionId: string, command: string) {
    const client = this.clients[connectionId];
    if (!client) throw new BadRequestException('Connection not found');

    try {
      const result = await client.execCommand(command);
      if (result.code !== 0) throw new BadRequestException(result.stderr);
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
  async executeTemporaryCommand(sshConfig: Config, command: string) {
    const temporarySsh = new NodeSSH();
    try {
      await temporarySsh.connect(sshConfig);

      const result = await temporarySsh.execCommand(command);

      if (result.code !== 0) throw new BadRequestException(result.stderr);
      return { status: 200, data: result.stdout.trim() };
    } catch (err) {
      throw new BadRequestException(
        `Error executing temporary command: ${err.message || err}`,
      );
    } finally {
      temporarySsh.dispose();
    }
  }

  async serverStatus(connectionId: string): Promise<ServerStatusDto> {
    const client = this.clients[connectionId];
    if (!client) throw new Error('Connection not found');

    const ramCommand = 'free -m';
    const cpuCommand = "top -bn1 | grep 'Cpu(s)'";
    const diskCommand = 'df -h --total | grep total';
    const services = ['nginx', 'docker', 'psql', 'mongod'];

    const serviceCommands = services.map((service) => `which ${service}`);
    const netstatCommand = 'ss -tuln';

    const [ramInfo, cpuInfo, diskInfo, serviceInfos, netstatInfo] =
      await Promise.all([
        client.execCommand(ramCommand),
        client.execCommand(cpuCommand),
        client.execCommand(diskCommand),
        Promise.all(
          serviceCommands.map((command) => client.execCommand(command)),
        ),
        client.execCommand(netstatCommand),
      ]);

    const serviceStatus = await Promise.all(
      services.map((service, index) =>
        this.parseServiceInfo(
          connectionId,
          service,
          serviceInfos[index].stdout,
          netstatInfo.stdout,
        ),
      ),
    );
    const ram = this.parseRamInfo(ramInfo.stdout);
    const cpu = this.parseCpuInfo(cpuInfo.stdout);
    const disk = this.parseDiskInfo(diskInfo.stdout);

    return {
      categories: ['ram', 'cpu', 'disk'],
      used: [ram.used, cpu.used, disk.used],
      available: [ram.available, cpu.available, disk.available],
      units: ['MB', '%', 'GB'],
      services: serviceStatus,
    };
  }

  async getService(
    connectionId: string,
    service: string,
  ): Promise<ServiceStatusDto> {
    const client = this.clients[connectionId];
    if (!client) throw new Error('Connection not found');

    const netstatCommand = 'ss -tuln';
    const netstatInfo = await client.execCommand(netstatCommand);
    const serviceInfo = await client.execCommand(`which ${service}`);

    return await this.parseServiceInfo(
      connectionId,
      service,
      serviceInfo.stdout,
      netstatInfo.stdout,
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

      const systemctlStatus = await this.clients[connectionId].execCommand(
        `systemctl is-active ${service === 'psql' ? 'postgresql' : service}`,
      );
      isActive = systemctlStatus.stdout.trim() === 'active';

      if (service === 'docker') {
        const dockerStats = await this.clients[connectionId].execCommand(
          'docker stats --no-stream --format "{{.MemUsage}}"',
        );
        memoryUsage = dockerStats.stdout.trim();
      } else {
        const serviceSize = await this.clients[connectionId].execCommand(
          `du -sh /var/lib/${service}`,
        );
        memoryUsage = serviceSize.stdout.split('\t')[0];
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
