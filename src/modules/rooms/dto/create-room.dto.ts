import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateRoomDto {
  @ApiProperty({ example: '제주도 여행 2025', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiProperty({
    example:
      'https://app.example.com/join/550e8400-e29b-41d4-a716-446655440000',
    required: true,
  })
  @IsNotEmpty()
  @IsUrl()
  inviteUrl: string;
}
