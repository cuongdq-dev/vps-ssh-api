import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DockerService } from './docker.service';

@ApiTags('docker')
@Controller({ path: 'docker', version: '1' })
export class DockerController {
  constructor(private service: DockerService) {}

  @Get('')
  async getOne() {
    return true;
  }
}
