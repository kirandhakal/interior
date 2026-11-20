import {
  Body, CanActivate, ConflictException, Controller, ExecutionContext, Get, HttpCode, Injectable, Module,
  Post, Req, Res, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { LessThanOrEqual, MoreThan, QueryFailedError, Repository } from 'typeorm';
import type { CookieOptions, Request, Response } from 'express';
import { Session, UserAccount } from '../database/entities';

const derive = promisify(scrypt);
const SESSION_COOKIE = 'studio_session';
const SESSION_AGE = 30 * 24 * 60 * 60 * 1000;
const dummyHash = '0'.repeat(32) + '.' + '0'.repeat(128);
type AuthRequest = Request & { account: UserAccount };

class CredentialsDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Length(8, 128) password!: string;
}

function tokenFrom(request: Request) {
  const cookie = request.headers.cookie?.split(';').map(part => part.trim())
    .find(part => part.startsWith(SESSION_COOKIE + '='));
  const value = cookie?.slice(SESSION_COOKIE.length + 1);
  return value && /^[0-9a-f]{64}$/.test(value) ? value : undefined;
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function cookieOptions(): CookieOptions {
  return { httpOnly: true, sameSite: 'strict', secure: process.env.COOKIE_SECURE === 'true', path: '/api' };
}

@Injectable()
class AuthService {
  constructor(
    @InjectRepository(UserAccount) private readonly accounts: Repository<UserAccount>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
  ) {}

  async register(data: CredentialsDto) {
    const salt = randomBytes(16).toString('hex');
    const hash = await derive(data.password, salt, 64) as Buffer;
    try {
      return await this.accounts.save(this.accounts.create({ email: data.email, passwordHash: salt + '.' + hash.toString('hex') }));
    } catch (error) {
      if (error instanceof QueryFailedError && error.driverError.code === '23505') {
        throw new ConflictException('An account already exists for that email.');
      }
      throw error;
    }
  }

  async login(data: CredentialsDto) {
    const account = await this.accounts.findOneBy({ email: data.email });
    const [salt, stored] = (account?.passwordHash ?? dummyHash).split('.');
    const hash = await derive(data.password, salt, 64) as Buffer;
    if (!timingSafeEqual(hash, Buffer.from(stored, 'hex')) || !account) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }
    return account;
  }

  async startSession(account: UserAccount, request: Request, response: Response) {
    const token = randomBytes(32).toString('hex');
    const previous = tokenFrom(request);
    await this.sessions.manager.transaction(async manager => {
      await manager.delete(Session, { expiresAt: LessThanOrEqual(new Date()) });
      if (previous) await manager.delete(Session, { tokenHash: hashToken(previous) });
      await manager.insert(Session, { tokenHash: hashToken(token), accountId: account.id, expiresAt: new Date(Date.now() + SESSION_AGE) });
    });
    response.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_AGE });
    return { email: account.email };
  }

  async getAccount(request: Request) {
    const token = tokenFrom(request);
    if (!token) return;
    const session = await this.sessions.findOne({
      where: { tokenHash: hashToken(token), expiresAt: MoreThan(new Date()) },
      relations: { account: true },
    });
    return session?.account;
  }

  async logout(request: Request, response: Response) {
    const token = tokenFrom(request);
    if (token) await this.sessions.delete({ tokenHash: hashToken(token) });
    response.clearCookie(SESSION_COOKIE, cookieOptions());
  }
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const account = await this.auth.getAccount(request);
    if (!account) throw new UnauthorizedException('Sign in to access saved projects.');
    request.account = account;
    return true;
  }
}

@Controller('auth')
class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body() data: CredentialsDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.auth.startSession(await this.auth.register(data), request, response);
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() data: CredentialsDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.auth.startSession(await this.auth.login(data), request, response);
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() request: AuthRequest) {
    return { email: request.account.email };
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.auth.logout(request, response);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([UserAccount, Session])],
  controllers: [AuthController],
  providers: [AuthService, SessionGuard],
  exports: [SessionGuard],
})
export class AuthModule {}

export type { AuthRequest };
