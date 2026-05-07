import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateBlogDto {
  @ApiProperty({ example: 'uuid-room' })
  @IsUUID()
  roomId: string;

  @ApiProperty({ example: 'Day 1 in Jeju' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: '오늘은 제주도 첫날...' })
  @IsString()
  content: string;

  @ApiProperty({ example: ['uuid-photo-1', 'uuid-photo-2'], required: false })
  @IsArray()
  @IsUUID('all', { each: true })
  @IsOptional()
  photoIds?: string[];
}
