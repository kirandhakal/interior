import { applyDecorators } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDefined, IsIn, IsInt, IsNumber, IsObject,
  IsString, IsUUID, Length, Matches, Max, Min, Validate, ValidateIf, ValidateNested, ValidatorConstraint,
} from 'class-validator';
import {
  CEILING_DECOR, CEILING_DECOR_SCALE, CEILING_FINISHES, type CeilingDecorKind, type CeilingFinish,
  CURTAIN_LENGTHS, DAYLIGHTS, DIMENSION_BOUNDS, FINISHES, FURNITURE, FURNITURE_SCALE, HEX_COLOR, HINGE_SIDES,
  LIGHTS, LIMITS, MAX_LIGHT_LUMENS, MAX_ROOM_COORDINATE, OPENINGS, WALL_ID_PATTERN, WALL_THICKNESS_BOUNDS,
  type Curtains, type Daylight, type FurnitureKind, type LightKind, type LightMount, type Opening, type OpeningKind, type Project, type Wall, type WallPaint,
} from '../../../../packages/studio/model';
import { MAX_PLAN_VERTICES } from '../../../../packages/studio/polygon';
import { MAX_WALL_ITEMS, WALL_ITEM_KINDS, type WallItem, type WallDesign } from '../../../../packages/studio/wall-design';
import { WALL_SURFACES } from '../../../../packages/studio/wall-surface';

const idPattern = /^[a-zA-Z0-9_-]{1,64}$/;
const trimmed = () => Transform(({ value }) => typeof value === 'string' ? value.trim() : value);
const number = () => IsNumber({ allowInfinity: false, allowNaN: false });

const optional = () => ValidateIf((_item, value) => value !== undefined);
const thickness = () => applyDecorators(optional(), number(), Min(WALL_THICKNESS_BOUNDS[0]), Max(WALL_THICKNESS_BOUNDS[1]));

class WallThicknessDto {
  @thickness() north?: number;
  @thickness() east?: number;
  @thickness() south?: number;
  @thickness() west?: number;
}

class OutlineVertexDto {
  @Matches(WALL_ID_PATTERN) wallId!: Wall;
  @number() @Min(-MAX_ROOM_COORDINATE) @Max(MAX_ROOM_COORDINATE) x!: number;
  @number() @Min(-MAX_ROOM_COORDINATE) @Max(MAX_ROOM_COORDINATE) z!: number;
  @thickness() thickness?: number;
}

class DimensionsDto {
  @number() @Min(0) @Max(2 * MAX_ROOM_COORDINATE) length!: number;
  @number() @Min(0) @Max(2 * MAX_ROOM_COORDINATE) width!: number;
  @number() @Min(DIMENSION_BOUNDS.height[0]) @Max(DIMENSION_BOUNDS.height[1]) height!: number;
  @optional() @number() @Min(DIMENSION_BOUNDS.length[0]) @Max(DIMENSION_BOUNDS.length[1]) southLength?: number;
  @optional() @number() @Min(DIMENSION_BOUNDS.width[0]) @Max(DIMENSION_BOUNDS.width[1]) westLength?: number;
  @optional() @IsObject() @ValidateNested() @Type(() => WallThicknessDto) wallThickness?: WallThicknessDto;
  @optional() @IsArray() @ArrayMinSize(3) @ArrayMaxSize(MAX_PLAN_VERTICES)
  @IsObject({ each: true }) @ValidateNested({ each: true }) @Type(() => OutlineVertexDto) outline?: OutlineVertexDto[];
}

@ValidatorConstraint({ name: 'wallPaint' })
class WallPaintConstraint {
  validate(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const entries = Object.entries(value);
    return entries.length >= 3 && entries.length <= MAX_PLAN_VERTICES && entries.every(([key, paint]) =>
      WALL_ID_PATTERN.test(key) && paint && typeof paint === 'object' && !Array.isArray(paint) &&
      Object.keys(paint).length === 2 && typeof paint.color === 'string' && HEX_COLOR.test(paint.color) && FINISHES.includes(paint.finish));
  }

  defaultMessage() { return 'Each wall must have a valid paint color and finish.'; }
}

class CurtainsDto implements Curtains {
  @Matches(HEX_COLOR) color!: string;
  @number() @Min(0) @Max(100) drawn!: number;
  @IsIn(CURTAIN_LENGTHS) length!: Curtains['length'];
}

class OpeningDto {
  @Matches(idPattern) id!: string;
  @IsIn(OPENINGS) kind!: OpeningKind;
  @Matches(WALL_ID_PATTERN) wall!: Wall;
  @number() @Min(-MAX_ROOM_COORDINATE * Math.SQRT2) @Max(MAX_ROOM_COORDINATE * Math.SQRT2) offset!: number;
  @number() @Min(0) @Max(6) sill!: number;
  @number() @Min(0.4) @Max(18) width!: number;
  @number() @Min(0.4) @Max(6) height!: number;
  @ValidateIf((_item, value) => value !== undefined) @number() @Min(0) @Max(90) openAngle?: number;
  @ValidateIf((_item, value) => value !== undefined) @IsIn(HINGE_SIDES) hinge?: Opening['hinge'];
  @ValidateIf((_item, value) => value !== undefined) @IsObject() @ValidateNested() @Type(() => CurtainsDto) curtains?: CurtainsDto;
}

class DisplayDto {
  @IsBoolean() enabled!: boolean;
  @number() @Min(0) @Max(100) brightness!: number;
  @Matches(HEX_COLOR) color!: string;
  @IsInt() @Min(1) @Max(3) count!: number;
}

class FurnitureDto {
  @Matches(idPattern) id!: string;
  @IsIn(FURNITURE) kind!: FurnitureKind;
  @number() @Min(-MAX_ROOM_COORDINATE) @Max(MAX_ROOM_COORDINATE) x!: number;
  @number() @Min(-MAX_ROOM_COORDINATE) @Max(MAX_ROOM_COORDINATE) z!: number;
  @number() @Min(0) @Max(360) rotation!: number;
  @ValidateIf((_item, value) => value !== undefined) @number() @Min(FURNITURE_SCALE.min) @Max(FURNITURE_SCALE.max) scale?: number;
  @ValidateIf((_item, value) => value !== undefined) @Matches(HEX_COLOR) color?: string;
  @ValidateIf((_item, value) => value !== undefined) @IsObject() @ValidateNested() @Type(() => DisplayDto) display?: DisplayDto;
  @ValidateIf((_item, value) => value !== undefined) @number() @Min(0) @Max(90) doorAngle?: number;
}

class LightDto {
  @Matches(idPattern) id!: string;
  @IsIn(LIGHTS) kind!: LightKind;
  @number() @Min(-MAX_ROOM_COORDINATE) @Max(MAX_ROOM_COORDINATE) x!: number;
  @number() @Min(0) @Max(6) y!: number;
  @number() @Min(-MAX_ROOM_COORDINATE) @Max(MAX_ROOM_COORDINATE) z!: number;
  @number() @Min(0) @Max(100) brightness!: number;
  @number() @Min(2300) @Max(7500) warmth!: number;
  @number() @Min(0) @Max(360) direction!: number;
  @number() @Min(0) @Max(75) tilt!: number;
  @optional() @Matches(/^(Ceiling|Floor|Free|north|east|south|west|wall-[a-zA-Z0-9_-]{1,59})$/) mount?: LightMount;
  @ValidateIf((_light, value) => value !== undefined) @IsInt() @Min(0) @Max(MAX_LIGHT_LUMENS) lumens?: number;
  @ValidateIf((_light, value) => value !== undefined) @IsBoolean() enabled?: boolean;
}

class PaintOptionDto {
  @Matches(idPattern) id!: string;
  @trimmed() @IsString() @Length(1, LIMITS.name) name!: string;
  @IsDefined() @IsObject() @Validate(WallPaintConstraint) walls!: WallPaint;
}

class CeilingDecorDto {
  @Matches(idPattern) id!: string;
  @IsIn(CEILING_DECOR) kind!: CeilingDecorKind;
  @number() @Min(-MAX_ROOM_COORDINATE) @Max(MAX_ROOM_COORDINATE) x!: number;
  @number() @Min(-MAX_ROOM_COORDINATE) @Max(MAX_ROOM_COORDINATE) z!: number;
  @number() @Min(0) @Max(360) rotation!: number;
  @number() @Min(CEILING_DECOR_SCALE.min) @Max(CEILING_DECOR_SCALE.max) scale!: number;
  @Matches(HEX_COLOR) color!: string;
}

class SurfacePaintDto {
  @Matches(HEX_COLOR) color!: string;
  @IsIn(FINISHES) finish!: WallItem['finish'];
}

class PaintVertexDto {
  @number() @Min(0) @Max(1) u!: number;
  @number() @Min(0) @Max(1) v!: number;
}
class WallItemDto implements WallItem {
  @optional() @IsIn(['Plain','Linen','Stipple']) texture?: WallItem['texture'];
  @optional() @IsIn(['Paint','Plaster','Metallic']) material?: WallItem['material'];
  @optional() @IsArray() @ArrayMaxSize(64) @ValidateNested({ each: true }) @Type(() => PaintVertexDto) polygon?: PaintVertexDto[];
  @Matches(idPattern) id!: string;
  @trimmed() @IsString() @Length(1, 80) name!: string;
  @IsIn(WALL_ITEM_KINDS) kind!: WallItem['kind'];
  @number() @Min(0) @Max(200) u!: number;
  @number() @Min(0) @Max(6) v!: number;
  @number() @Min(0.02) @Max(200) width!: number;
  @number() @Min(0.02) @Max(200) height!: number;
  @number() @Min(0) @Max(360) rotation!: number;
  @number() @Min(0) @Max(0.6) depth!: number;
  @Matches(HEX_COLOR) color!: string;
  @IsIn(FINISHES) finish!: WallItem['finish'];
}

class WallDesignDto implements WallDesign {
  @Matches(WALL_ID_PATTERN) wall!: Wall;
  @IsIn(WALL_SURFACES) surface!: WallDesign['surface'];
  @optional() @IsObject() @ValidateNested() @Type(() => SurfacePaintDto) paint?: SurfacePaintDto;
  @IsArray() @ArrayMaxSize(MAX_WALL_ITEMS) @IsObject({ each: true }) @ValidateNested({ each: true }) @Type(() => WallItemDto) items!: WallItemDto[];
}

class RoomDto {
  @Matches(idPattern) id!: string;
  @trimmed() @IsString() @Length(1, LIMITS.name) name!: string;
  @IsDefined() @IsObject() @ValidateNested() @Type(() => DimensionsDto) dimensions!: DimensionsDto;
  @IsDefined() @IsObject() @Validate(WallPaintConstraint) walls!: WallPaint;
  @IsIn(DAYLIGHTS) daylight!: Daylight;
  @optional() @IsArray() @ArrayMaxSize(MAX_PLAN_VERTICES * 2) @IsObject({ each: true }) @ValidateNested({ each: true }) @Type(() => WallDesignDto) wallDesigns?: WallDesignDto[];
  @IsArray() @ArrayMaxSize(LIMITS.openings) @IsObject({ each: true }) @ValidateNested({ each: true }) @Type(() => OpeningDto) openings!: OpeningDto[];
  @IsArray() @ArrayMaxSize(LIMITS.furniture) @IsObject({ each: true }) @ValidateNested({ each: true }) @Type(() => FurnitureDto) furniture!: FurnitureDto[];
  @IsArray() @ArrayMaxSize(LIMITS.lights) @IsObject({ each: true }) @ValidateNested({ each: true }) @Type(() => LightDto) lights!: LightDto[];
  @IsArray() @ArrayMaxSize(LIMITS.options) @IsObject({ each: true }) @ValidateNested({ each: true }) @Type(() => PaintOptionDto) options!: PaintOptionDto[];
  @ValidateIf((_room, value) => value !== undefined) @IsIn(CEILING_FINISHES) ceilingFinish?: CeilingFinish;
  @ValidateIf((_room, value) => value !== undefined) @IsArray() @ArrayMaxSize(LIMITS.ceilingDecor)
  @IsObject({ each: true }) @ValidateNested({ each: true }) @Type(() => CeilingDecorDto) ceilingDecor?: CeilingDecorDto[];
}

export class ProjectDto implements Project {
  @trimmed() @IsString() @Length(1, LIMITS.name) name!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(LIMITS.rooms) @IsObject({ each: true }) @ValidateNested({ each: true }) @Type(() => RoomDto) rooms!: RoomDto[];
}

export class CreateProjectDto extends ProjectDto {
  @IsUUID('4') id!: string;
}

export class UpdateProjectDto extends ProjectDto {
  @IsInt() @Min(1) @Max(2147483646) version!: number;
}
