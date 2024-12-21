import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CommandDto } from './dto/command.dto';
import { ServerService } from './server.service';

@Controller('server')
export class ServerController {
  constructor(private readonly serverService: ServerService) {}

  @Post('connect')
  connect(@Body() { owner_id, host, username, password }: CommandDto) {
    return this.serverService.connect(host, username, password, owner_id);
  }

  @Delete('disconnect/:connectionId')
  async disconnect(@Param('connectionId') connectionId: string) {
    return this.serverService.disconnect(connectionId);
  }

  @Post('setup/service/:connectionId')
  setupDocker(
    @Param('connectionId') connectionId: string,
    @Body() { script }: { script: string },
  ) {
    return this.serverService.setupDocker(connectionId, script);
  }

  @Post('update-docker-compose/:connectionId')
  updateDockerCompose(
    @Param('connectionId') connectionId: string,
    @Body()
    { values }: { values: Record<string, any>; serviceName: string },
  ) {
    return this.serverService.updateDockerCompose(connectionId, values);
  }

  @Post('update-nginx/:connectionId')
  updateNginx(
    @Param('connectionId') connectionId: string,
    @Body()
    { fileContent, fileName }: { fileContent?: string; fileName?: string },
  ) {
    return this.serverService.updateNginx(connectionId, fileContent, fileName);
  }

  @Delete('delete-nginx/:connectionId')
  deleteNginx(
    @Param('connectionId') connectionId: string,
    @Body()
    { fileName }: { fileName?: string },
  ) {
    return this.serverService.deleteNginx(connectionId, fileName);
  }

  @Get('status/:connectionId')
  async getServerStatus(@Param('connectionId') connectionId: string) {
    return this.serverService.serverStatus(connectionId);
  }

  @Post('service/:connectionId')
  async getService(
    @Param('connectionId') connectionId: string,
    @Body() { service }: { service: string },
  ) {
    return this.serverService.getService(connectionId, service);
  }

  @Post('nginx/:connectionId')
  async getNginx(@Param('connectionId') connectionId: string) {
    return this.serverService.getNginx(connectionId);
  }
}
