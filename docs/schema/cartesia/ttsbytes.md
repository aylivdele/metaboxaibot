> ## Documentation Index
>
> Fetch the complete documentation index at: https://docs.cartesia.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Text to Speech (Bytes)

## OpenAPI

```yaml /latest.yml POST /tts/bytes
openapi: 3.0.1
info:
  title: Cartesia API
  version: 0.0.1
servers:
  - url: https://api.cartesia.ai
    description: Production
security: []
paths:
  /tts/bytes:
    post:
      tags:
        - Tts
      summary: Text to Speech (Bytes)
      operationId: tts_bytes
      parameters:
        - $ref: "#/components/parameters/CartesiaVersionHeader"
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/TTSRequest"
      responses:
        "200":
          description: Audio bytes
          content:
            audio/*:
              schema:
                type: string
                format: binary
      security:
        - TokenAuth: []
        - APIKeyAuth: []
components:
  parameters:
    CartesiaVersionHeader:
      name: Cartesia-Version
      in: header
      description: API version header.
      required: true
      schema:
        type: string
        format: date
        example: "2026-03-01"
        enum:
          - "2024-06-10"
          - "2024-11-13"
          - "2025-04-16"
          - "2026-03-01"
  schemas:
    TTSRequest:
      title: TTSRequest
      type: object
      properties:
        model_id:
          type: string
          description: >-
            The ID of the model to use for the generation. See
            [Models](/build-with-cartesia/tts-models/latest) for available
            models.
        transcript:
          type: string
        voice:
          $ref: "#/components/schemas/TTSRequestVoiceSpecifier"
        language:
          $ref: "#/components/schemas/SupportedLanguage"
          nullable: true
        output_format:
          $ref: "#/components/schemas/OutputFormat"
        save:
          type: boolean
          nullable: true
          default: false
          description: >-
            Whether to save the generated audio file. When true, the response
            will include a `Cartesia-File-ID` header.
        pronunciation_dict_id:
          type: string
          nullable: true
          description: >-
            The ID of a pronunciation dictionary to use for the generation.
            Pronunciation dictionaries are supported by `sonic-3` models and
            newer.
        generation_config:
          $ref: "#/components/schemas/GenerationConfig"
        speed:
          $ref: "#/components/schemas/ModelSpeed"
      required:
        - model_id
        - transcript
        - voice
        - output_format
    TTSRequestVoiceSpecifier:
      title: TTSRequestVoiceSpecifier
      type: object
      properties:
        mode:
          type: string
          enum:
            - id
        id:
          $ref: "#/components/schemas/VoiceId"
      required:
        - mode
        - id
    SupportedLanguage:
      title: SupportedLanguage
      type: string
      enum:
        - en
        - fr
        - de
        - es
        - pt
        - zh
        - ja
        - hi
        - it
        - ko
        - nl
        - pl
        - ru
        - sv
        - tr
        - tl
        - bg
        - ro
        - ar
        - cs
        - el
        - fi
        - hr
        - ms
        - sk
        - da
        - ta
        - uk
        - hu
        - "no"
        - vi
        - bn
        - th
        - he
        - ka
        - id
        - te
        - gu
        - kn
        - ml
        - mr
        - pa
      description: >-
        The language that the given voice should speak the transcript in. For
        valid options, see [Models](/build-with-cartesia/tts-models/latest).
    OutputFormat:
      title: OutputFormat
      oneOf:
        - type: object
          title: RAWOutputFormat
          allOf:
            - type: object
              properties:
                container:
                  type: string
                  enum:
                    - raw
            - $ref: "#/components/schemas/RawOutputFormat"
          required:
            - container
        - type: object
          title: WAVOutputFormat
          allOf:
            - type: object
              properties:
                container:
                  type: string
                  enum:
                    - wav
            - $ref: "#/components/schemas/WAVOutputFormat"
          required:
            - container
        - type: object
          title: MP3OutputFormat
          allOf:
            - type: object
              properties:
                container:
                  type: string
                  enum:
                    - mp3
            - $ref: "#/components/schemas/MP3OutputFormat"
          required:
            - container
    GenerationConfig:
      title: GenerationConfig
      type: object
      description: >-
        Configure the various attributes of the generated speech. These are only
        for `sonic-3` and have no effect on earlier models.


        See [Volume, Speed, and Emotion in
        Sonic-3](/build-with-cartesia/sonic-3/volume-speed-emotion) for a guide
        on this option.
      properties:
        volume:
          type: number
          format: double
          default: 1
          description: >-
            Adjust the volume of the generated speech between 0.5x and 2.0x the
            original volume (default is 1.0x). Valid values are between [0.5,
            2.0] inclusive.
        speed:
          type: number
          format: double
          default: 1
          description: >-
            Adjust the speed of the generated speech between 0.6x and 1.5x the
            original speed (default is 1.0x). Valid values are between [0.6,
            1.5] inclusive.
        emotion:
          $ref: "#/components/schemas/Emotion"
          description: Guide the emotion of the generated speech.
    ModelSpeed:
      title: ModelSpeed
      deprecated: true
      type: string
      default: normal
      enum:
        - slow
        - normal
        - fast
      description: >-
        Use `generation_config.speed` for sonic-3.

        Speed setting for the model. Defaults to `normal`.

        This feature is experimental and may not work for all voices.

        Influences the speed of the generated speech. Faster speeds may reduce
        hallucination rate.
    VoiceId:
      title: VoiceId
      type: string
      description: The ID of the voice.
    RawOutputFormat:
      title: RawOutputFormat
      type: object
      properties:
        encoding:
          $ref: "#/components/schemas/RawEncoding"
        sample_rate:
          type: integer
          enum:
            - 8000
            - 16000
            - 22050
            - 24000
            - 44100
            - 48000
      required:
        - encoding
        - sample_rate
    WAVOutputFormat:
      title: WAVOutputFormat
      type: object
      properties: {}
      allOf:
        - $ref: "#/components/schemas/RawOutputFormat"
    MP3OutputFormat:
      title: MP3OutputFormat
      type: object
      properties:
        sample_rate:
          type: integer
          enum:
            - 8000
            - 16000
            - 22050
            - 24000
            - 44100
            - 48000
        bit_rate:
          type: integer
          enum:
            - 32000
            - 64000
            - 96000
            - 128000
            - 192000
      required:
        - sample_rate
        - bit_rate
    Emotion:
      title: Emotion
      type: string
      description: >-
        The primary emotions are `neutral`, `calm`, `angry`, `content`, `sad`,
        `scared`. For more options, see [Prompting
        Sonic-3](/build-with-cartesia/sonic-3/volume-speed-emotion#emotion-controls-beta).
      enum:
        - neutral
        - happy
        - excited
        - enthusiastic
        - elated
        - euphoric
        - triumphant
        - amazed
        - surprised
        - flirtatious
        - curious
        - content
        - peaceful
        - serene
        - calm
        - grateful
        - affectionate
        - trust
        - sympathetic
        - anticipation
        - mysterious
        - angry
        - mad
        - outraged
        - frustrated
        - agitated
        - threatened
        - disgusted
        - contempt
        - envious
        - sarcastic
        - ironic
        - sad
        - dejected
        - melancholic
        - disappointed
        - hurt
        - guilty
        - bored
        - tired
        - rejected
        - nostalgic
        - wistful
        - apologetic
        - hesitant
        - insecure
        - confused
        - resigned
        - anxious
        - panicked
        - alarmed
        - scared
        - proud
        - confident
        - distant
        - skeptical
        - contemplative
        - determined
    RawEncoding:
      title: RawEncoding
      type: string
      description: >-
        The encoding format for output audio. See [Choosing TTS
        Parameters](/build-with-cartesia/capability-guides/choosing-tts-parameters)
        if you're unsure what to use.
      enum:
        - pcm_f32le
        - pcm_s16le
        - pcm_mulaw
        - pcm_alaw
  securitySchemes:
    TokenAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: A short-lived access token to make API requests from a client.
    APIKeyAuth:
      type: http
      scheme: bearer
      bearerFormat: API Key
      description: >-
        Cartesia API key (`sk_car_...`). Get one at
        [play.cartesia.ai/keys](https://play.cartesia.ai/keys).
```
