import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsUUID } from 'class-validator';

export const BLOG_PERSONAS = [
  'friendly_diary',
  'emotional_essay',
  'witty',
  'concise_log',
  'magazine',
] as const;

export type BlogPersona = (typeof BLOG_PERSONAS)[number];

export class GenerateBlogDto {
  @ApiProperty({
    enum: BLOG_PERSONAS,
    required: false,
    example: 'friendly_diary',
  })
  @IsOptional()
  @IsIn(BLOG_PERSONAS)
  persona?: BlogPersona;

  @ApiProperty({ example: ['uuid-photo-1', 'uuid-photo-2'], required: false })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  photoIds?: string[];
}
