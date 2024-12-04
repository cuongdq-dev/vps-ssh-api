import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CommandDto } from './dto/command.dto';
import { ServerStatusDto } from './dto/server.dto';
import { ServerService } from './server.service';

@Controller('server')
export class ServerController {
  constructor(private readonly serverService: ServerService) {}

  @Post('connect')
  connect(@Body() { host, username, password }: CommandDto): Promise<string> {
    return this.serverService.connect(host, username, password);
  }

  @Get('status/:connectionId')
  async getServerStatus(
    @Param('connectionId') connectionId: string,
  ): Promise<ServerStatusDto> {
    return this.serverService.serverStatus(connectionId);
  }

  @Post('service/:connectionId')
  async getService(
    @Param('connectionId') connectionId: string,
    @Body() { service }: { service: string },
  ): Promise<{ service: string }> {
    return this.serverService.getService(connectionId, service);
  }

  @Post('execute/:connectionId')
  async execute(
    @Param('connectionId') connectionId: string,
    @Body() { command }: { command: string },
  ): Promise<string> {
    return this.serverService.executeCommand(connectionId, command);
  }

  @Delete('disconnect/:connectionId')
  disconnect(@Param('connectionId') connectionId: string): string {
    this.serverService.disconnect(connectionId);
    return `Disconnected ${connectionId}`;
  }
}
