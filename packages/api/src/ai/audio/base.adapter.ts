export interface AudioInput {
  /** Text to synthesize / describe (music prompt, sound description, etc.) */
  prompt: string;
  /** Optional: voice ID for TTS / voice-clone */
  voiceId?: string;
  /** Optional: source audio URL for voice cloning */
  sourceAudioUrl?: string;
}

export interface AudioResult {
  /** Raw audio bytes — returned by sync providers (OpenAI TTS, ElevenLabs). */
  buffer?: Buffer;
  /** Provider URL — returned by async providers after polling. */
  url?: string;
  /** File extension: 'mp3' | 'wav' | 'ogg' */
  ext: string;
  /** MIME type: 'audio/mpeg' | 'audio/wav' | 'audio/ogg' */
  contentType: string;
}

/**
 * Sync adapter: generate() returns the result directly (buffer or URL).
 * Async adapter: submit() queues the job; poll() checks for completion.
 */
export interface AudioAdapter {
  readonly modelId: string;
  readonly isAsync: boolean;
  /** Sync generation. Only implemented on sync adapters. */
  generate?(input: AudioInput): Promise<AudioResult>;
  /** Submit async job. Returns provider-side job ID. */
  submit?(input: AudioInput): Promise<string>;
  /** Poll async result. Returns null if still processing. */
  poll?(jobId: string): Promise<AudioResult | null>;
}
