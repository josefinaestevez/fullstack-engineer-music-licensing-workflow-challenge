import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Track } from './track.entity';

@Injectable()
export class TrackService {
  constructor(private readonly dataSource: DataSource) {}

  async findWithoutInsights(): Promise<Track[]> {
    return this.dataSource
      .createQueryBuilder(Track, 't')
      .innerJoinAndSelect('t.song', 'song')
      .innerJoinAndSelect('t.scene', 'scene')
      .innerJoinAndSelect('scene.movie', 'movie')
      .leftJoin('t.track_ai_insights', 'ins')
      .where('ins.id IS NULL')
      .orderBy('t.createdAt', 'ASC')
      .getMany();
  }
}
