import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const MARKER_SHAPES = [
  'classic',
  'polaroid',
  'sticker',
  'dot',
  'flag',
  'ribbon',
] as const;
const MARKER_BG_COLORS = [
  '#d8c9a5',
  '#cfd8c2',
  '#e2c9bc',
  '#c9d2db',
  '#decfd8',
  '#f0ead2',
] as const;

export class UpdateRoomDto {
  @ApiProperty({ example: '제주도 여행 2025' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title: string;

  @ApiProperty({ example: 'classic', enum: MARKER_SHAPES, required: false })
  @IsOptional()
  @IsIn(MARKER_SHAPES)
  markerShape?: string;

  @ApiProperty({ example: '#d8c9a5', enum: MARKER_BG_COLORS, required: false })
  @IsOptional()
  @IsIn(MARKER_BG_COLORS)
  markerBgColor?: string;

  @ApiProperty({ example: '🌴', required: false })
  @IsOptional()
  @IsString()
  markerEmoji?: string;
}
