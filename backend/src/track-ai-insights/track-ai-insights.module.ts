import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import OpenAI from 'openai';
import { TrackAIInsights } from './track-ai-insights.entity';
import {
  TrackAIInsightsService,
  OPENAI_CLIENT,
} from './track-ai-insights.service';
import { TrackAIInsightsController } from './track-ai-insights.controller';
import { TrackModule } from '../track/track.module';

@Module({
  imports: [TypeOrmModule.forFeature([TrackAIInsights]), TrackModule],
  providers: [
    {
      provide: OPENAI_CLIENT,
      useFactory: () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
    },
    TrackAIInsightsService,
  ],
  controllers: [TrackAIInsightsController],
})
export class TrackAIInsightsModule {}
