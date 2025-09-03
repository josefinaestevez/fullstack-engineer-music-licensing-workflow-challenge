import { ObjectType, Field, ID } from '@nestjs/graphql';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Track } from '../track/track.entity';
import { BaseEntityTimestamps } from '../common/base-entity';

@ObjectType()
@Entity('track_ai_insights')
export class TrackAIInsights extends BaseEntityTimestamps {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @OneToOne(() => Track, (track) => track.trackAIInsights, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'track_id' })
  track!: Track;

  @Field()
  @Column({ type: 'varchar', length: 255 })
  summary!: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  licenseSuggestion?: string | null;

  @Field(() => String)
  @Column()
  provider!: string;

  @Field(() => String)
  @Column()
  model!: string;
}
