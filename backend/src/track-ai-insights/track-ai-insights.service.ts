import { PubSub } from 'graphql-subscriptions';
import OpenAI from 'openai';
import { Repository } from 'typeorm';
import { z } from 'zod';
import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TrackService } from '../track/track.service';
import { Track } from '../track/track.entity';
import { Song } from '../song/song.entity';
import { Scene } from '../scene/scene.entity';
import { Movie } from '../movie/movie.entity';
import { TrackAIInsights } from './track-ai-insights.entity';
import { PUB_SUB } from 'src/realtime/pubsub.token';
import { MovieEventKind, emitMovieEvent } from 'src/realtime/events';

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

const TrackInsightsSchema = z.object({
  trackId: z.string().min(1),
  summary: z.string().min(1).max(255),
  licenseSuggestion: z.string().trim().min(1).max(255).optional().nullable(),
});

type TrackInsightsPayload = z.infer<typeof TrackInsightsSchema>;

export const OPENAI_CLIENT = 'OPENAI_CLIENT';
const AI_PROVIDER = 'openai';
const OPENAI_MODEL = 'gpt-4o-mini';
const OPENAI_TEMPERATURE = 0.2;
const OPENAI_RESPONSE_TYPE = 'json_schema';

@Injectable()
export class TrackAIInsightsService {
  constructor(
    private readonly trackService: TrackService,
    @InjectRepository(TrackAIInsights)
    private readonly trackInsightsRepo: Repository<TrackAIInsights>,
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAI,
    @Inject(PUB_SUB) private readonly pubSub: PubSub,
  ) {}

  async generateMissingInsightsForAll(): Promise<TrackInsightsReport> {
    const tracks = await this.trackService.findEligibleTracksForInsights();
    const report = await this.generateInsightsForTracks(tracks);

    if (report.created > 0) {
      const movieIds = Array.from(new Set(tracks.map((t) => t.scene.movie.id)));

      for (const movieId of movieIds) {
        await emitMovieEvent(
          this.pubSub,
          movieId,
          MovieEventKind.TRACK_INSIGHTS_CREATED,
        );
      }
    }

    return report;
  }

  async generateMissingInsightsForMovie(
    movieId: string,
  ): Promise<TrackInsightsReport> {
    const tracks =
      await this.trackService.findEligibleTracksForInsightsByMovie(movieId);
    const report = await this.generateInsightsForTracks(tracks);

    if (report.created > 0) {
      await emitMovieEvent(
        this.pubSub,
        movieId,
        MovieEventKind.TRACK_INSIGHTS_CREATED,
      );
    }

    return report;
  }

  async generateMissingInsightsForTrack(
    trackId: string,
  ): Promise<TrackInsightsReport> {
    const track = await this.trackService.findEligibleTrackForInsights(trackId);
    if (!track) {
      return { processed: 0, created: 0, errors: [] };
    }
    const report = await this.generateInsightsForTracks([track]);

    if (report.created > 0) {
      await emitMovieEvent(
        this.pubSub,
        track.scene.movie.id,
        MovieEventKind.TRACK_INSIGHTS_CREATED,
      );
    }

    return report;
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
        console.error(reason);
        errors.push({ trackId: track.id, reason });
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

    const response = await this.openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: OPENAI_TEMPERATURE,
      response_format: {
        type: OPENAI_RESPONSE_TYPE,
        json_schema: {
          name: 'TrackInsights',
          schema: {
            type: 'object',
            properties: {
              trackId: { type: 'string' },
              summary: { type: 'string', maxLength: 255 },
              licenseSuggestion: { type: 'string', maxLength: 255 },
            },
            required: ['trackId', 'summary'],
            additionalProperties: false,
          },
        },
      },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    return this.validateAndParseOpenAIResponse(response, context.trackId);
  }

  private validateAndParseOpenAIResponse(
    response: OpenAI.Chat.Completions.ChatCompletion,
    expectedTrackId: string,
  ): TrackInsightsPayload {
    const text = response.choices?.[0]?.message?.content ?? '{}';
    const raw: unknown = JSON.parse(text);

    const result = TrackInsightsSchema.safeParse(raw);
    if (!result.success) {
      const details = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(', ');
      throw new Error(`Invalid LLM output: ${details}`);
    }

    const parsed = result.data;

    if (parsed.trackId !== expectedTrackId) {
      throw new Error(
        `trackId mismatch (expected ${expectedTrackId}, got ${parsed.trackId})`,
      );
    }

    return {
      trackId: parsed.trackId,
      summary: parsed.summary,
      licenseSuggestion:
        parsed.licenseSuggestion && parsed.licenseSuggestion.trim() !== ''
          ? parsed.licenseSuggestion
          : null,
    };
  }

  private async persistTrackInsights(
    trackInsightsPayload: TrackInsightsPayload,
  ) {
    const trackInsight = this.trackInsightsRepo.create({
      track: { id: trackInsightsPayload.trackId },
      summary: trackInsightsPayload.summary,
      licenseSuggestion: trackInsightsPayload.licenseSuggestion,
      provider: AI_PROVIDER,
      model: OPENAI_MODEL,
    });
    await this.trackInsightsRepo.save(trackInsight);
  }
}
