import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Check,
  OneToOne,
} from 'typeorm';
import { ObjectType, Field, ID, Int, registerEnumType } from '@nestjs/graphql';
import { Scene } from '../scene/scene.entity';
import { Song } from '../song/song.entity';
import { TrackAIInsights } from '../track-ai-insights/track-ai-insights.entity';
import { BaseEntityTimestamps } from '../common/base-entity';

export enum LicenseStatus {
  PENDING = 'pending',
  NEGOTIATION = 'negotiation',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

// Register the enum for GraphQL
registerEnumType(LicenseStatus, { name: 'LicenseStatus' });

@ObjectType()
@Check('chk_track_time_order', `"endTime" > "startTime"`)
@Check('chk_track_time_non_negative', `"startTime" >= 0`)
@Entity('tracks')
export class Track extends BaseEntityTimestamps {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field(() => Scene)
  @ManyToOne(() => Scene, (scene) => scene.tracks, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'scene_id' })
  scene!: Scene;

  @Field(() => Song, { nullable: true })
  @ManyToOne(() => Song, { onDelete: 'SET NULL', eager: true, nullable: true })
  @JoinColumn({ name: 'song_id' })
  song: Song | null = null;

  @Field(() => Int)
  @Column({ type: 'int' })
  startTime!: number; // seconds

  @Field(() => Int)
  @Column({ type: 'int' })
  endTime!: number; // seconds

  @Field(() => LicenseStatus)
  @Column({
    type: 'enum',
    enum: LicenseStatus,
    default: LicenseStatus.PENDING,
  })
  licenseStatus!: LicenseStatus;

  @OneToOne(
    () => TrackAIInsights,
    (track_ai_insights) => track_ai_insights.track,
  )
  track_ai_insights?: TrackAIInsights;
}
