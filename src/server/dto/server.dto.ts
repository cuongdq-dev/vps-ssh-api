export class ServiceStatusDto {
  service: string; // Tên dịch vụ như nginx, docker, postgresql, mongodb
  is_active: boolean;
  is_installed: boolean; // Trạng thái cài đặt của dịch vụ
  port?: number | string;
  memory_usage?: number | string;
}

export class ServerStatusDto {
  categories: string[]; // Các loại tài nguyên (ram, cpu, disk, services)
  used: number[]; // Dữ liệu đã sử dụng
  available: number[]; // Dữ liệu còn lại
  units: string[]; // Đơn vị của từng loại tài nguyên
}
