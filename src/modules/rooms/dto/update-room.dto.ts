import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateRoomDto {
  @ApiProperty({ example: '제주도 여행 2025' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title: string;
}
