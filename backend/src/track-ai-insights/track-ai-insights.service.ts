import OpenAI from 'openai';
import { Repository } from 'typeorm';
import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TrackService } from '../track/track.service';
import { Track } from '../track/track.entity';
import { Song } from '../song/song.entity';
import { Scene } from '../scene/scene.entity';
import { Movie } from '../movie/movie.entity';
import { TrackAIInsights } from './track-ai-insights.entity';

export type TrackInsightsReport = {
  processed: number;
  created: number;
  errors: Array<{ trackId: string; reason: string }>;
};

type TrackInsightsContext = {
  trackId: string;
  track: Pick<Track, 'startTime' | 'endTime' | 'licenseStatus'>;
  song: Pick<Song, 'title' | 'artist' | 'description' | 'duration'>;
  scene: Pick<Scene, 'name' | 'description'>;
  movie: Pick<Movie, 'title' | 'description'>;
};

type TrackInsightsPayload = {
  trackId: string;
  summary: string;
  licenseSuggestion?: string | null;
};

export const OPENAI_CLIENT = 'OPENAI_CLIENT';

@Injectable()
export class TrackAIInsightsService {
  private readonly logger = new Logger(TrackAIInsightsService.name);
  private readonly MODEL = 'gpt-4o-mini' as const;

  constructor(
    private readonly tracks: TrackService,
    @InjectRepository(TrackAIInsights)
    private readonly trackInsightsRepo: Repository<TrackAIInsights>,
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAI,
  ) {}

  async generateMissingInsights(): Promise<TrackInsightsReport> {
    const tracks = await this.tracks.findWithoutInsights();
    return this.generateInsightsForTracks(tracks);
  }

  async generateInsightsForTracks(
    tracks: Track[],
  ): Promise<TrackInsightsReport> {
    const errors: TrackInsightsReport['errors'] = [];
    let created = 0;

    for (const track of tracks) {
      try {
        const context = this.makeTrackInsightsContext(track);
        const payload = await this.callOpenAIForTrackInsights(context);
        await this.persistTrackInsights(payload);
        created += 1;
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        this.logger.warn(`Insight failed for track ${track.id}: ${reason}`);
        errors.push({ trackId: track.id, reason: String(e) });
      }
    }
    return { processed: tracks.length, created, errors };
  }

  private makeTrackInsightsContext(track: Track): TrackInsightsContext {
    return {
      trackId: track.id,
      track: {
        startTime: track.startTime,
        endTime: track.endTime,
        licenseStatus: track.licenseStatus,
      },
      song: {
        title: track.song?.title ?? '',
        artist: track.song?.artist ?? '',
        description: track.song?.description,
        duration: track.song?.duration,
      },
      scene: {
        name: track.scene.name,
        description: track.scene.description,
      },
      movie: {
        title: track.scene.movie.title,
        description: track.scene.movie.description,
      },
    };
  }

  private async callOpenAIForTrackInsights(
    context: TrackInsightsContext,
  ): Promise<TrackInsightsPayload> {
    const system = `
      You are a music licensing assistant. 
      Return STRICT JSON only. 
      Output must include: 
      - trackId (string) 
      - summary (<=255 chars) 
      Include licenseSuggestion if you can reasonably infer a first step for licensing (e.g. type of contract, duration, channel). If not, omit it.
      No extra text, no markdown.
      `;

    const examples = `
      Examples of valid JSON outputs:
      {"trackId":"abc-123","summary":"This song conveys an epic and melancholic tone.","licenseSuggestion":"An exclusive 6-month contract for streaming use is recommended."}
      {"trackId":"xyz-456","summary":"Soft piano underscoring the emotional dialogue."}
      `;

    const user = `
      Analyze the following JSON describing a movie track. 
      Echo back the given trackId unchanged. 
      Follow the rules above.

      ${examples}

      INPUT:
      ${JSON.stringify(context)}
      `;

    const resp = await this.openai.chat.completions.create({
      model: this.MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    const text = resp.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(text) as TrackInsightsPayload;

    const suggestion =
      parsed.licenseSuggestion && String(parsed.licenseSuggestion).trim() !== ''
        ? String(parsed.licenseSuggestion).slice(0, 255)
        : null;

    return {
      trackId: parsed.trackId,
      summary: parsed.summary,
      licenseSuggestion: suggestion,
    };
  }

  private async persistTrackInsights(
    trackInsightsPayload: TrackInsightsPayload,
  ) {
    const trackInsight = this.trackInsightsRepo.create({
      track: { id: trackInsightsPayload.trackId },
      summary: trackInsightsPayload.summary,
      licenseSuggestion: trackInsightsPayload.licenseSuggestion,
      provider: 'openai',
      model: this.MODEL,
    });
    await this.trackInsightsRepo.save(trackInsight);
  }
}
