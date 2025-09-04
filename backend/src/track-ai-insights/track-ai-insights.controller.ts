import { Controller, Post, Param } from '@nestjs/common';
import { TrackAIInsightsService } from './track-ai-insights.service';

@Controller('tracks/insights')
export class TrackAIInsightsController {
  constructor(
    private readonly trackAIInsightsService: TrackAIInsightsService,
  ) {}

  @Post('generate')
  async generate() {
    return this.trackAIInsightsService.generateMissingInsightsForAll();
  }

  @Post('generate/for-movie/:movieId')
  async generateForMovie(@Param('movieId') movieId: string) {
    return this.trackAIInsightsService.generateMissingInsightsForMovie(movieId);
  }

  @Post('generate/for-track/:trackId')
  async generateForTrack(@Param('trackId') trackId: string) {
    return this.trackAIInsightsService.generateMissingInsightsForTrack(trackId);
  }
}
