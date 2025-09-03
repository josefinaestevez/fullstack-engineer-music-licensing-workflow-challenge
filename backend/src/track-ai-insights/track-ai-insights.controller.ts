import { Controller, Post } from '@nestjs/common';
import { TrackAIInsightsService } from './track-ai-insights.service';

@Controller('tracks/insights')
export class TrackAIInsightsController {
  constructor(
    private readonly trackAIInsightsService: TrackAIInsightsService,
  ) {}

  @Post('generate')
  async generate() {
    return this.trackAIInsightsService.generateMissingInsights();
  }
}
