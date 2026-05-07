import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRoomDto {
  @ApiProperty({ example: '제주도 여행 2025', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;
}
