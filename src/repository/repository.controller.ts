import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { RepositoryService } from './repository.service';

@Controller('repository')
export class RepositoryController {
  constructor(private readonly repositoryService: RepositoryService) {}

  @Post('clone/:connectionId')
  async cloneRepository(
    @Param('connectionId') connectionId: string,
    @Body() body: Record<string, any>,
  ) {
    return await this.repositoryService.cloneRepository(connectionId, body);
  }

  @Post('build/:connectionId')
  async buildRepository(
    @Param('connectionId') connectionId: string,
    @Body() body: Record<string, any>,
  ) {
    return await this.repositoryService.buildRepository(connectionId, body);
  }

  @Delete('delete/:connectionId')
  async removeRepository(
    @Param('connectionId') connectionId: string,
    @Body() body: { path: string },
  ) {
    return await this.repositoryService.deleteRepository(connectionId, {
      path: body?.path,
    });
  }
}
