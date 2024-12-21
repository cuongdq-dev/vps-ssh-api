import { BadRequestException, Injectable } from '@nestjs/common';
import { Config, NodeSSH } from 'node-ssh';
import { parse, stringify } from 'yaml';
import { ServiceStatusDto } from './dto/server.dto';

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
      return { status: 0, data: { connectionId: connectionId } };
    } catch (err) {
      return { status: 0, data: { is_connected: false } };
    }
  }

  async disconnect(connectionId: string) {
    const client = this.clients[connectionId];
    if (client) {
      client.dispose();
      delete this.clients[connectionId];
      console.log(`SSH connection closed for ${connectionId}`);
      return { status: 0, data: true };
    }
    return { status: 0, data: true };
  }

  async executeCommand(connectionId: string, command: string) {
    const client = this.clients[connectionId];
    if (!client?.isConnected())
      throw new BadRequestException('Connection not found');

    try {
      const result = await client.execCommand(command + ' 2>&1');
      console.log('------->', command, '<---------');
      console.log('------->', result, '<---------');
      return {
        status: result.code,
        data: result?.stdout?.trim(),
        error: result?.stderr?.trim(),
      };
    } catch (err) {
      throw new BadRequestException(`${err.message || err}`);
    }
  }

  async executeTemporaryCommand(connectionId: string, command: string) {
    const client = this.clients[connectionId];
    const clientConfig = client?.connection?.config as Config;

    if (!client?.isConnected())
      throw new BadRequestException('Connection not found');

    const temporarySsh = new NodeSSH();

    try {
      await temporarySsh.connect(clientConfig);
      const result = await temporarySsh.execCommand(command);
      console.log('------->', command, '<---------');
      console.log('------->', result, '<---------');

      return {
        status: result.code,
        data: result?.stdout?.trim(),
        error: result?.stderr?.trim(),
      };
    } catch (err) {
      throw new BadRequestException(`${err.message || err}`);
    } finally {
      temporarySsh.dispose();
    }
  }

  async setupDocker(connectionId: string, script: string) {
    if (!script) throw new BadRequestException('Script not found!');
    if (!connectionId) throw new BadRequestException('Server disconnected!');
    return await this.executeTemporaryCommand(
      connectionId,
      `echo '${script}' > install-docker.sh && chmod +x install-docker.sh && ./install-docker.sh`,
    );
  }

  async updateDockerCompose(connectionId: string, values: Record<string, any>) {
    if (!values) throw new BadRequestException('Values not found!');
    if (!connectionId) throw new BadRequestException('Server disconnected!');

    const result = await this.executeTemporaryCommand(
      connectionId,
      `echo '${stringify(values)}' > docker-compose.yml && chmod +x docker-compose.yml && docker-compose up -d`,
    );
    const service = await this.getService(connectionId, 'docker');
    return { ...result, data: service.data };
  }

  async updateNginx(
    connectionId: string,
    fileContent: string,
    fileName: string,
  ) {
    const command = `echo '${fileContent.toString()}' > nginx/${fileName}`;

    await this.executeTemporaryCommand(connectionId, command);

    const result = await this.executeTemporaryCommand(
      connectionId,
      `find nginx -name "${fileName}"`,
    );

    const content = await this.readFileContent(connectionId, result.data);

    return {
      ...result,
      data: { name: result?.data?.split('/')[1] || fileName, content: content },
    };
  }

  async deleteNginx(connectionId: string, fileName: string) {
    const command = `rm -rf nginx/${fileName}`;
    const result = await this.executeTemporaryCommand(connectionId, command);
    return { ...result };
  }

  async serverStatus(connectionId: string) {
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
      status: 0,
      data: {
        categories: ['ram', 'cpu', 'disk'],
        used: [ram.used, cpu.used, disk.used],
        available: [ram.available, cpu.available, disk.available],
        units: ['MB', '%', 'GB'],
      },
    };
  }

  async getService(connectionId: string, service: string) {
    const dockerInfo = await this.executeTemporaryCommand(
      connectionId,
      `which ${service}`,
    );

    const services = await this.executeTemporaryCommand(
      connectionId,
      `cat docker-compose.yml`,
    );

    return {
      status: 0,
      data: {
        name: service,
        is_installed: !!dockerInfo.data.trim(),
        is_active: true,
        port: 'N/A',
        memory_usage: 'Not found data',
        service_docker: parse(services?.data),
      },
    };
  }
  async getNginx(connectionId: string) {
    const result = await this.executeTemporaryCommand(
      connectionId,
      'find nginx -name "*.conf"',
    );

    const files = result?.data
      ?.split('\n')
      .filter((file) => file?.trim() !== '');

    const fileDetails = await Promise.all(
      files?.map(async (file) => {
        const content = await this.readFileContent(connectionId, file);
        const fileName = file?.split('/')[1];
        return {
          name: fileName,
          content: content,
        };
      }),
    );
    return {
      ...result,
      data: fileDetails,
    };
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

  //Helper
  async readFileContent(connectionId: string, filePath: string) {
    const contentResult = await this.executeTemporaryCommand(
      connectionId,
      `cat ${filePath}`,
    );

    return contentResult?.data;
  }
}
