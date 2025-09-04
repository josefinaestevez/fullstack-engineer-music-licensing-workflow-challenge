import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Track } from './track.entity';

@Injectable()
export class TrackService {
  constructor(
    @InjectRepository(Track)
    private readonly trackRepo: Repository<Track>,
  ) {}

  private baseEligibleQB(): SelectQueryBuilder<Track> {
    return this.trackRepo
      .createQueryBuilder('track')
      .innerJoinAndSelect('track.song', 'song')
      .innerJoinAndSelect('track.scene', 'scene')
      .innerJoinAndSelect('scene.movie', 'movie')
      .leftJoin('track.trackAIInsights', 'ins')
      .where('ins.id IS NULL');
  }

  async findEligibleTracksForInsights(): Promise<Track[]> {
    return this.baseEligibleQB().getMany();
  }

  async findEligibleTracksForInsightsByMovie(
    movieId: string,
  ): Promise<Track[]> {
    return this.baseEligibleQB()
      .andWhere('movie.id = :movieId', { movieId })
      .getMany();
  }

  async findEligibleTrackForInsights(trackId: string): Promise<Track | null> {
    return this.baseEligibleQB()
      .andWhere('track.id = :trackId', { trackId })
      .getOne();
  }
}
