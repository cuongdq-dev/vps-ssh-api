import { Injectable } from '@nestjs/common';
import { Client, ConnectConfig } from 'ssh2';
import { ServerStatusDto, ServiceStatusDto } from './dto/server.dto';

@Injectable()
export class ServerService {
  private clients: Record<string, Client> = {};

  /**
   * Kết nối tới server SSH và trả về connectionId
   * @param host - Địa chỉ host của server
   * @param username - Tên đăng nhập
   * @param password - Mật khẩu đăng nhập
   */
  async connect(
    host: string,
    username: string,
    password: string,
  ): Promise<string> {
    const client = new Client();
    const connectionId = `${host}_${username}`;
    const config: ConnectConfig = { host, username, password };

    return new Promise<string>((resolve, reject) => {
      client
        .on('ready', () => {
          console.log(`SSH connected to ${host}`);
          this.clients[connectionId] = client;
          resolve(connectionId); // Trả về connectionId sau khi kết nối thành công
        })
        .on('error', (err) => {
          console.error(`SSH connection error: ${err.message}`);
          reject(err);
        })
        .connect(config);
    });
  }

  /**
   * Thực thi lệnh SSH và trả về kết quả
   * @param connectionId - connectionId của kết nối cần sử dụng
   * @param command - Lệnh cần thực thi
   */
  async executeCommand(connectionId: string, command: string): Promise<string> {
    const client = this.clients[connectionId];
    if (!client) throw new Error('Connection not found');

    return new Promise<string>((resolve, reject) => {
      client.exec(command, (err, stream) => {
        if (err) return reject(err);

        let output = '';
        stream
          .on('data', (data) => (output += data.toString()))
          .stderr.on('data', (data) => (output += data.toString()))
          .on('close', () => resolve(output.trim()));
      });
    });
  }

  /**
   * Ngắt kết nối SSH
   * @param connectionId - connectionId của kết nối cần ngắt
   */
  disconnect(connectionId: string): void {
    const client = this.clients[connectionId];
    if (client) {
      client.end();
      delete this.clients[connectionId]; // Xóa kết nối khỏi danh sách khi ngắt
    }
  }

  /**
   * Lấy trạng thái tài nguyên của server
   * @param connectionId - connectionId của kết nối SSH
   */

  private async executeCommandAsync(
    client: Client,
    command: string,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      client.exec(command, (err, stream) => {
        if (err) return reject(err);

        let output = '';
        stream
          .on('data', (data) => (output += data.toString()))
          .stderr.on('data', (data) => (output += data.toString()))
          .on('close', () => resolve(output.trim()));
      });
    });
  }

  async serverStatus(connectionId: string): Promise<ServerStatusDto> {
    const client = this.clients[connectionId];
    if (!client) throw new Error('Connection not found');

    const ramCommand = 'free -m';
    const cpuCommand = "top -bn1 | grep 'Cpu(s)'";
    const diskCommand = 'df -h --total | grep total';
    const services = ['nginx', 'docker', 'psql', 'mongod']; // Các service cần kiểm tra

    const serviceCommands = services.map((service) => `which ${service}`);
    const netstatCommand = 'ss -tuln'; // Lệnh xem các cổng đang lắng nghe

    // Thực hiện các lệnh đồng thời
    const [ramInfo, cpuInfo, diskInfo, serviceInfos, netstatInfo] =
      await Promise.all([
        this.executeCommandAsync(client, ramCommand),
        this.executeCommandAsync(client, cpuCommand),
        this.executeCommandAsync(client, diskCommand),
        Promise.all(
          serviceCommands.map((command) =>
            this.executeCommandAsync(client, command),
          ),
        ),
        this.executeCommandAsync(client, netstatCommand),
      ]);

    // Kiểm tra các dịch vụ đã được cài đặt và lấy thông tin chi tiết
    const serviceStatus = await Promise.all(
      services.map((service, index) =>
        this.parseServiceInfo(
          service,
          serviceInfos[index],
          client,
          netstatInfo,
        ),
      ),
    );
    const ram = this.parseRamInfo(ramInfo);
    const cpu = this.parseCpuInfo(cpuInfo);
    const disk = this.parseDiskInfo(diskInfo);

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
    const netstatCommand = 'ss -tuln'; // Lệnh xem các cổng đang lắng nghe

    const [netstatInfo] = await Promise.all([
      this.executeCommandAsync(client, netstatCommand),
    ]);

    switch (service) {
      case 'postgresql':
        const psqlInfo = await this.executeCommandAsync(client, `which psql`);

        return await this.parseServiceInfo(
          service,
          psqlInfo,
          client,
          netstatInfo,
        );

      default:
        const serviceInfo = await this.executeCommandAsync(
          client,
          `which ${service}`,
        );

        return await this.parseServiceInfo(
          service,
          serviceInfo,
          client,
          netstatInfo,
        );
    }
  }

  // FUNCTION:

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
    service: string,
    serviceInfo: string,
    client: Client,
    netstatInfo: string,
  ): Promise<ServiceStatusDto> {
    const isInstalled = serviceInfo.trim() !== '';
    let port = '';
    let memoryUsage = 'N/A';
    let isActive = false; // Biến để lưu trạng thái dịch vụ (active hoặc inactive)

    if (isInstalled) {
      // Kiểm tra thông tin cổng của dịch vụ qua netstat
      const servicePortMatch = netstatInfo.match(new RegExp(`.*:${service}.*`));
      if (servicePortMatch) {
        port = servicePortMatch[0].split(' ')[3]; // Lấy cổng từ output của netstat
      }

      // Kiểm tra trạng thái hoạt động của dịch vụ qua systemctl
      const systemctlStatus = await this.executeCommandAsync(
        client,
        `systemctl is-active ${service === 'psql' ? 'postgresql' : service}`,
      );
      isActive = systemctlStatus.trim() === 'active'; // Nếu trạng thái là 'active', thì dịch vụ đang hoạt động

      // Nếu là Docker, lấy thông tin bộ nhớ sử dụng của Docker container
      if (service === 'docker') {
        const dockerStats = await this.executeCommandAsync(
          client,
          'docker stats --no-stream --format "{{.MemUsage}}"',
        );
        memoryUsage = dockerStats.trim();
      } else {
        // Lấy dung lượng bộ nhớ của các dịch vụ còn lại
        const serviceSize = await this.executeCommandAsync(
          client,
          `du -sh /var/lib/${service}`,
        );
        memoryUsage = serviceSize.split('\t')[0]; // Lấy dung lượng của thư mục cài đặt dịch vụ
      }
    }

    return {
      service,
      is_installed: isInstalled,
      is_active: isActive, // Trạng thái hoạt động của dịch vụ
      port,
      memory_usage: memoryUsage,
    };
  }
}
