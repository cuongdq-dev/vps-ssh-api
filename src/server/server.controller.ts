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

  @Post('execute/:connectionId')
  async execute(
    @Param('connectionId') connectionId: string,
    @Body() { command }: { command: string },
  ) {
    return this.serverService.executeCommand(connectionId, command);
  }

  @Delete('disconnect/:connectionId')
  disconnect(@Param('connectionId') connectionId: string): string {
    this.serverService.disconnect(connectionId);
    return `Disconnected ${connectionId}`;
  }

  @Post('repository/clone/:connectionId')
  async buildImage(
    @Param('connectionId') connectionId: string,
    @Body('github_url') github_url: string,
    @Body('fine_grained_token') fine_grained_token: string,
    @Body('username') username: string,
    @Body('repository_name') repository_name: string,
  ) {
    return await this.serverService.cloneRepository(connectionId, {
      fine_grained_token,
      repository_name,
      github_url,
      username,
    });
  }
}
