import { IsString, IsNotEmpty } from 'class-validator';

export class CommandDto {
  @IsString()
  @IsNotEmpty()
  host: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  owner_id: string;
}
