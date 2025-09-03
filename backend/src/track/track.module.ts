import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Track } from './track.entity';
import { Song } from '../song/song.entity';
import { Scene } from '../scene/scene.entity';
import { TrackResolver } from './track.resolver';
import { TrackService } from './track.service';

@Module({
  imports: [TypeOrmModule.forFeature([Track, Song, Scene])],
  providers: [TrackResolver, TrackService],
  exports: [TrackService],
})
export class TrackModule {}
