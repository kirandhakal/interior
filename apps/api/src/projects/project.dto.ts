import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDefined, IsIn, IsInt, IsNumber, IsObject,
  IsString, IsUUID, Length, Matches, Max, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import {
  DAYLIGHTS, DIMENSION_BOUNDS, FINISHES, FURNITURE, HEX_COLOR, LIGHTS, LIGHT_MOUNTS, LIMITS, MAX_LIGHT_LUMENS, OPENINGS, WALLS,
  type Daylight, type Finish, type FurnitureKind, type LightKind, type LightMount, type OpeningKind, type Project, type Wall,
} from '../../../../packages/studio/model';

const idPattern = /^[a-zA-Z0-9_-]{1,64}$/;
const trimmed = () => Transform(({ value }) => typeof value === 'string' ? value.trim() : value);
const number = () => IsNumber({ allowInfinity: false, allowNaN: false });

class DimensionsDto {
  @number() @Min(DIMENSION_BOUNDS.length[0]) @Max(DIMENSION_BOUNDS.length[1]) length!: number;
  @number() @Min(DIMENSION_BOUNDS.width[0]) @Max(DIMENSION_BOUNDS.width[1]) width!: number;
  @number() @Min(DIMENSION_BOUNDS.height[0]) @Max(DIMENSION_BOUNDS.height[1]) height!: number;
}

class PaintDto {
  @Matches(HEX_COLOR) color!: string;
  @IsIn(FINISHES) finish!: Finish;
}

class WallPaintDto {
  @IsDefined() @IsObject() @ValidateNested() @Type(() => PaintDto) north!: PaintDto;
  @IsDefined() @IsObject() @ValidateNested() @Type(() => PaintDto) east!: PaintDto;
  @IsDefined() @IsObject() @ValidateNested() @Type(() => PaintDto) south!: PaintDto;
  @IsDefined() @IsObject() @ValidateNested() @Type(() => PaintDto) west!: PaintDto;
}

class OpeningDto {
  @Matches(idPattern) id!: string;
  @IsIn(OPENINGS) kind!: OpeningKind;
  @IsIn(WALLS) wall!: Wall;
  @number() @Min(-9) @Max(9) offset!: number;
  @number() @Min(0) @Max(6) sill!: number;
  @number() @Min(0.4) @Max(18) width!: number;
  @number() @Min(0.4) @Max(6) height!: number;
}

class FurnitureDto {
  @Matches(idPattern) id!: string;
  @IsIn(FURNITURE) kind!: FurnitureKind;
  @number() @Min(-9) @Max(9) x!: number;
  @number() @Min(-9) @Max(9) z!: number;
  @number() @Min(0) @Max(360) rotation!: number;
}

class LightDto {
  @Matches(idPattern) id!: string;
  @IsIn(LIGHTS) kind!: LightKind;
  @number() @Min(-9) @Max(9) x!: number;
  @number() @Min(0) @Max(6) y!: number;
  @number() @Min(-9) @Max(9) z!: number;
  @number() @Min(0) @Max(100) brightness!: number;
  @number() @Min(2300) @Max(7500) warmth!: number;
  @number() @Min(0) @Max(360) direction!: number;
  @number() @Min(0) @Max(75) tilt!: number;
  @ValidateIf((_light, value) => value !== undefined) @IsIn(LIGHT_MOUNTS) mount?: LightMount;
  @ValidateIf((_light, value) => value !== undefined) @IsInt() @Min(0) @Max(MAX_LIGHT_LUMENS) lumens?: number;
  @ValidateIf((_light, value) => value !== undefined) @IsBoolean() enabled?: boolean;
}

class PaintOptionDto {
  @Matches(idPattern) id!: string;
  @trimmed() @IsString() @Length(1, LIMITS.name) name!: string;
  @IsDefined() @IsObject() @ValidateNested() @Type(() => WallPaintDto) walls!: WallPaintDto;
}

class RoomDto {
  @Matches(idPattern) id!: string;
  @trimmed() @IsString() @Length(1, LIMITS.name) name!: string;
  @IsDefined() @IsObject() @ValidateNested() @Type(() => DimensionsDto) dimensions!: DimensionsDto;
  @IsDefined() @IsObject() @ValidateNested() @Type(() => WallPaintDto) walls!: WallPaintDto;
  @IsIn(DAYLIGHTS) daylight!: Daylight;
  @IsArray() @ArrayMaxSize(LIMITS.openings) @IsObject({ each: true }) @ValidateNested({ each: true }) @Type(() => OpeningDto) openings!: OpeningDto[];
  @IsArray() @ArrayMaxSize(LIMITS.furniture) @IsObject({ each: true }) @ValidateNested({ each: true }) @Type(() => FurnitureDto) furniture!: FurnitureDto[];
  @IsArray() @ArrayMaxSize(LIMITS.lights) @IsObject({ each: true }) @ValidateNested({ each: true }) @Type(() => LightDto) lights!: LightDto[];
  @IsArray() @ArrayMaxSize(LIMITS.options) @IsObject({ each: true }) @ValidateNested({ each: true }) @Type(() => PaintOptionDto) options!: PaintOptionDto[];
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
