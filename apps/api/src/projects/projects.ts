import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Injectable, Module,
  NotFoundException, Param, ParseUUIDPipe, Post, Put, Req, UseGuards,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FIXTURE_MOUNTS, fitCeilingDecor, fitLight, furnitureBounds, furnitureFitsRoom, hasDisplay, openingFits, type Project, type SavedProject } from '../../../../packages/studio/model';
import { AuthModule, SessionGuard, type AuthRequest } from '../auth/auth';
import { ProjectEntity } from '../database/entities';
import { CreateProjectDto, UpdateProjectDto } from './project.dto';

function assertUnique(items: { id: string }[], label: string) {
  if (new Set(items.map(item => item.id)).size !== items.length) throw new BadRequestException(`Duplicate IDs in ${label}.`);
}

function checkLayout(project: Project) {
  assertUnique(project.rooms, 'rooms');
  for (const room of project.rooms) {
    for (const kind of ['openings', 'furniture', 'lights', 'options'] as const) assertUnique(room[kind], `${room.name} ${kind}`);
    const decor = room.ceilingDecor ?? [];
    assertUnique(decor, `${room.name} ceiling decor`);
    for (const item of decor) {
      const fitted = fitCeilingDecor(room.dimensions, item);
      if (Math.hypot(item.x - fitted.x, item.z - fitted.z) > 0.002) {
        throw new BadRequestException(`Ceiling decor extends outside ${room.name}.`);
      }
    }
    if (room.openings.some(opening => !openingFits(room, opening))) {
      throw new BadRequestException(`Openings in ${room.name} overlap or exceed the wall bounds.`);
    }
    for (const item of room.furniture) {
      if (item.display && (!hasDisplay(item.kind) || (item.kind === 'TV' && item.display.count !== 1))) {
        throw new BadRequestException(`Invalid display settings for ${item.kind} in ${room.name}.`);
      }
      const bounds = furnitureBounds(room.dimensions, item);
      if (!furnitureFitsRoom(room.dimensions, item) || Math.abs(item.x) > bounds.x + 0.002 || Math.abs(item.z) > bounds.z + 0.002) {
        throw new BadRequestException(`Furniture extends outside ${room.name}.`);
      }
    }
    for (const light of room.lights) {
      if (!FIXTURE_MOUNTS[light.kind].includes(light.mount ?? 'Free')) {
        throw new BadRequestException(`${light.kind} has an invalid mount in ${room.name}.`);
      }
      const fitted = fitLight(room.dimensions, light);
      if (Math.hypot(light.x - fitted.x, light.y - fitted.y, light.z - fitted.z) > 0.002) {
        throw new BadRequestException(`A light is outside ${room.name}.`);
      }
    }
  }
}

function toProject(project: ProjectEntity): SavedProject {
  return { id: project.id, name: project.name, rooms: project.rooms, version: project.version, updatedAt: project.updatedAt.toISOString() };
}

@Injectable()
class ProjectService {
  constructor(@InjectRepository(ProjectEntity) private readonly projects: Repository<ProjectEntity>) {}

  async list(accountId: string) {
    return this.projects.createQueryBuilder('project')
      .select('project.id', 'id').addSelect('project.name', 'name')
      .addSelect('project.version', 'version').addSelect('project.updatedAt', 'updatedAt')
      .addSelect('jsonb_array_length(project.rooms)', 'roomCount')
      .where('project.accountId = :accountId', { accountId })
      .orderBy('project.updatedAt', 'DESC').getRawMany();
  }

  async get(accountId: string, id: string) {
    const project = await this.projects.findOneBy({ id, accountId });
    if (!project) throw new NotFoundException('Project was not found.');
    return toProject(project);
  }

  async create(accountId: string, data: CreateProjectDto) {
    checkLayout(data);
    const result = await this.projects.createQueryBuilder().insert()
      .values({ accountId, id: data.id, name: data.name, rooms: data.rooms })
      .orIgnore().returning('*').execute();
    if (result.raw.length === 0) {
      const previous = await this.projects.findOneBy({ id: data.id, accountId });
      if (!previous) throw new ConflictException('This project ID is already in use.');
      return toProject(previous);
    }
    return this.get(accountId, data.id);
  }

  async update(accountId: string, id: string, data: UpdateProjectDto) {
    checkLayout(data);
    const result = await this.projects.createQueryBuilder().update()
      .set({ name: data.name, rooms: data.rooms, version: () => 'version + 1' })
      .where({ id, accountId, version: data.version }).returning('*').execute();
    if (!result.affected) {
      await this.get(accountId, id);
      throw new ConflictException('A newer version is saved. Open it or save your current edits as a copy.');
    }
    const row = result.raw[0];
    return toProject({ ...row, updatedAt: row.updated_at });
  }

  async remove(accountId: string, id: string) {
    const result = await this.projects.delete({ accountId, id });
    if (!result.affected) throw new NotFoundException('Project was not found.');
  }
}

@Controller('projects')
@UseGuards(SessionGuard)
class ProjectController {
  constructor(private readonly service: ProjectService) {}

  @Get() list(@Req() req: AuthRequest) {
    return this.service.list(req.account.id);
  }

  @Get(':id') get(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(req.account.id, id);
  }

  @Post() create(@Req() req: AuthRequest, @Body() data: CreateProjectDto) {
    return this.service.create(req.account.id, data);
  }

  @Put(':id') update(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body() data: UpdateProjectDto) {
    return this.service.update(req.account.id, id, data);
  }

  @Delete(':id') @HttpCode(204) remove(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(req.account.id, id);
  }
}

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([ProjectEntity])],
  controllers: [ProjectController],
  providers: [ProjectService],
})
export class ProjectModule {}
