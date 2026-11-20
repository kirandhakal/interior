import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import type { Room } from '../../../../packages/studio/model';

@Entity('accounts')
export class UserAccount {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 254, unique: true }) email!: string;
  @Column({ type: 'varchar', length: 180, name: 'password_hash' }) passwordHash!: string;
}

@Entity('sessions')
@Index('IDX_sessions_account', ['accountId'])
@Index('IDX_sessions_expiry', ['expiresAt'])
export class Session {
  @PrimaryColumn({ type: 'varchar', length: 64, name: 'token_hash' }) tokenHash!: string;
  @Column({ type: 'uuid', name: 'account_id' }) accountId!: string;
  @ManyToOne(() => UserAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' }) account!: UserAccount;
  @Column({ type: 'timestamptz', name: 'expires_at' }) expiresAt!: Date;
}

@Entity('projects')
@Index('IDX_projects_account_updated', ['accountId', 'updatedAt'])
export class ProjectEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column({ type: 'uuid', name: 'account_id' }) accountId!: string;
  @ManyToOne(() => UserAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' }) account!: UserAccount;
  @Column({ type: 'varchar', length: 80 }) name!: string;
  @Column({ type: 'jsonb' }) rooms!: Room[];
  @Column({ type: 'integer', default: 1 }) version!: number;
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' }) updatedAt!: Date;
}
