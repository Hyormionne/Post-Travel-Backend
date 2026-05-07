import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class UpdateBlogDto {
  @ApiProperty({ example: 'Updated title', required: false })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  title?: string;

  @ApiProperty({ example: 'Updated content...', required: false })
  @IsString()
  @IsOptional()
  content?: string;

  @ApiProperty({ example: ['uuid-photo-1'], required: false })
  @IsArray()
  @IsUUID('all', { each: true })
  @IsOptional()
  photoIds?: string[];
}
