> ## Documentation Index
>
> Fetch the complete documentation index at: https://heygen-1fa696a7.mintlify.app/llms.txt
> Use this file to discover all available pages before exploring further.

# Create Video

> Creates a video from a HeyGen avatar or an arbitrary image. Supports scripts or pre-recorded audio for lip-sync. Supports the Avatar IV engine and the upcoming Avatar V, while Avatar III video generation requires the legacy API (v1 or v2).

## OpenAPI

```yaml /openapi/external-api.json post /v3/videos
openapi: 3.1.0
info:
  title: HeyGen External API
  version: 1.0.0
  description: >-
    HeyGen's external API for programmatic AI video creation. See
    https://docs.heygen.com for full documentation.
  contact:
    name: HeyGen Product Infra
    url: https://heygen.com
servers:
  - url: https://api.heygen.com
    description: Production
security:
  - ApiKeyAuth: []
  - BearerAuth: []
tags:
  - name: Video Agent
    description: Create videos from text prompts using AI
  - name: Videos
    description: Create, list, retrieve, and delete videos
  - name: Voices
    description: Text-to-speech and voice management
  - name: Video Translate
    description: Translate videos into other languages
  - name: User
    description: Account information and billing
  - name: Avatars
    description: List and manage avatars and looks
  - name: Assets
    description: Upload files for use in video creation
  - name: Webhooks
    description: Manage webhook endpoints and events
  - name: Lipsync
    description: Dub or replace audio on existing videos
paths:
  /v3/videos:
    post:
      tags:
        - Videos
      summary: Create Video
      description: >-
        Creates a video from a HeyGen avatar or an arbitrary image. Supports
        scripts or pre-recorded audio for lip-sync. Supports the Avatar IV
        engine and the upcoming Avatar V, while Avatar III video generation
        requires the legacy API (v1 or v2).
      operationId: createVideo
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateVideoV3RequestBody"
      responses:
        "200":
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: "#/components/schemas/CreateAvatarVideoResponse"
        "400":
          description: Invalid request parameters
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    $ref: "#/components/schemas/StandardAPIError"
              example:
                error:
                  code: invalid_parameter
                  message: >-
                    Exactly one visual source required: avatar_id, image_url, or
                    image_asset_id.
                  param: avatar_id
                  doc_url: null
        "401":
          description: Authentication failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    $ref: "#/components/schemas/StandardAPIError"
              example:
                error:
                  code: authentication_failed
                  message: Invalid or expired API key. Verify your x-api-key header.
                  param: null
                  doc_url: null
        "429":
          description: Rate limit exceeded
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    $ref: "#/components/schemas/StandardAPIError"
              example:
                error:
                  code: rate_limit_exceeded
                  message: >-
                    Too many requests. Retry after the duration specified in the
                    Retry-After header.
                  param: null
                  doc_url: null
          headers:
            Retry-After:
              description: Seconds to wait before retrying
              schema:
                type: integer
      security:
        - ApiKeyAuth: []
        - BearerAuth: []
components:
  schemas:
    CreateVideoV3RequestBody:
      description: Discriminated union for POST /v3/videos request body.
      discriminator:
        mapping:
          avatar:
            $ref: "#/components/schemas/CreateVideoFromAvatar"
          image:
            $ref: "#/components/schemas/CreateVideoFromImage"
        propertyName: type
      oneOf:
        - $ref: "#/components/schemas/CreateVideoFromAvatar"
        - $ref: "#/components/schemas/CreateVideoFromImage"
      title: CreateVideoV3RequestBody
    CreateAvatarVideoResponse:
      properties:
        video_id:
          description: Unique identifier for the created video.
          examples:
            - v_abc123def456
          title: Video Id
          type: string
        status:
          description: Initial video status (e.g. 'waiting').
          examples:
            - waiting
          title: Status
          type: string
        output_format:
          $ref: "#/components/schemas/VideoOutputFormat"
          default: mp4
          description: Resolved output format for the video.
      required:
        - video_id
        - status
      title: CreateAvatarVideoResponse
      type: object
    StandardAPIError:
      type: object
      properties:
        code:
          type: string
          description: Machine-readable error code
          example: invalid_parameter
        message:
          type: string
          description: Human-readable error message
          example: Video not found
        param:
          type:
            - string
            - "null"
          description: Which request field caused the error
        doc_url:
          type:
            - string
            - "null"
          description: Link to error documentation
      required:
        - code
        - message
    CreateVideoFromAvatar:
      description: |-
        Create a video from a HeyGen avatar (video or photo avatar).

        Provide an avatar_id to use a previously created avatar. The server
        automatically selects the appropriate engine based on the avatar type
        (video avatar or photo avatar).
      properties:
        title:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: Display title for the video in the HeyGen dashboard.
          title: Title
        resolution:
          anyOf:
            - $ref: "#/components/schemas/VideoResolution"
            - type: "null"
          default: null
          description: Output video resolution.
        aspect_ratio:
          anyOf:
            - $ref: "#/components/schemas/VideoAspectRatio"
            - type: "null"
          default: null
          description: Output video aspect ratio.
        background:
          anyOf:
            - $ref: "#/components/schemas/BackgroundSetting"
            - type: "null"
          default: null
          description: Background settings for the video.
        remove_background:
          anyOf:
            - type: boolean
            - type: "null"
          default: null
          description: >-
            Remove the avatar background. Video avatars must be trained with
            matting enabled.
          title: Remove Background
        callback_url:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: Webhook URL to receive a POST notification when the video is ready.
          title: Callback Url
        callback_id:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: Caller-defined identifier echoed back in the webhook payload.
          title: Callback Id
        output_format:
          $ref: "#/components/schemas/VideoOutputFormat"
          default: mp4
          description: >-
            Output container. 'webm' returns a video with a transparent
            background (alpha channel); 'mp4' (default) returns a standard
            video. 'webm' requires an avatar that supports matting. When 'webm'
            is selected, any 'background' value is rejected and background
            removal is applied automatically — the caller does not need to set
            'remove_background'.
        script:
          anyOf:
            - minLength: 1
              type: string
            - type: "null"
          default: null
          description: >-
            Text script for the avatar to speak. Pair with voice_id, or omit
            voice_id when using avatar_id to use the avatar's default voice.
            Mutually exclusive with audio_url/audio_asset_id.
          title: Script
        voice_id:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: >-
            Voice ID for text-to-speech. Required when script is provided,
            unless avatar_id is set (the avatar's default voice is used as
            fallback).
          title: Voice Id
        audio_url:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: >-
            Public URL of an audio file to lip-sync. Mutually exclusive with
            script.
          title: Audio Url
        audio_asset_id:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: >-
            HeyGen asset ID of an uploaded audio file. Mutually exclusive with
            script.
          title: Audio Asset Id
        voice_settings:
          anyOf:
            - $ref: "#/components/schemas/VoiceSettingsInput"
            - type: "null"
          default: null
          description: Voice tuning parameters (speed, pitch, locale).
        type:
          const: avatar
          description: Must be 'avatar' for avatar-based video creation.
          title: Type
          type: string
        avatar_id:
          description: HeyGen avatar ID (video avatar or photo avatar look ID).
          title: Avatar Id
          type: string
        motion_prompt:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: >-
            Natural-language prompt controlling avatar body motion. Photo
            avatars only.
          title: Motion Prompt
        expressiveness:
          anyOf:
            - $ref: "#/components/schemas/Expressiveness"
            - type: "null"
          default: null
          description: >-
            Avatar expressiveness level. Photo avatars only. Defaults to 'low'
            when omitted.
      required:
        - type
        - avatar_id
      title: CreateVideoFromAvatar
      type: object
    CreateVideoFromImage:
      description: |-
        Create a video by animating an arbitrary image.

        Provide an image via URL, asset ID, or inline base64. The image will be
        animated with lip-sync to the provided audio or generated speech.
      properties:
        title:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: Display title for the video in the HeyGen dashboard.
          title: Title
        resolution:
          anyOf:
            - $ref: "#/components/schemas/VideoResolution"
            - type: "null"
          default: null
          description: Output video resolution.
        aspect_ratio:
          anyOf:
            - $ref: "#/components/schemas/VideoAspectRatio"
            - type: "null"
          default: null
          description: Output video aspect ratio.
        background:
          anyOf:
            - $ref: "#/components/schemas/BackgroundSetting"
            - type: "null"
          default: null
          description: Background settings for the video.
        remove_background:
          anyOf:
            - type: boolean
            - type: "null"
          default: null
          description: >-
            Remove the avatar background. Video avatars must be trained with
            matting enabled.
          title: Remove Background
        callback_url:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: Webhook URL to receive a POST notification when the video is ready.
          title: Callback Url
        callback_id:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: Caller-defined identifier echoed back in the webhook payload.
          title: Callback Id
        output_format:
          $ref: "#/components/schemas/VideoOutputFormat"
          default: mp4
          description: >-
            Output container. 'webm' returns a video with a transparent
            background (alpha channel); 'mp4' (default) returns a standard
            video. 'webm' requires an avatar that supports matting. When 'webm'
            is selected, any 'background' value is rejected and background
            removal is applied automatically — the caller does not need to set
            'remove_background'.
        script:
          anyOf:
            - minLength: 1
              type: string
            - type: "null"
          default: null
          description: >-
            Text script for the avatar to speak. Pair with voice_id, or omit
            voice_id when using avatar_id to use the avatar's default voice.
            Mutually exclusive with audio_url/audio_asset_id.
          title: Script
        voice_id:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: >-
            Voice ID for text-to-speech. Required when script is provided,
            unless avatar_id is set (the avatar's default voice is used as
            fallback).
          title: Voice Id
        audio_url:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: >-
            Public URL of an audio file to lip-sync. Mutually exclusive with
            script.
          title: Audio Url
        audio_asset_id:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: >-
            HeyGen asset ID of an uploaded audio file. Mutually exclusive with
            script.
          title: Audio Asset Id
        voice_settings:
          anyOf:
            - $ref: "#/components/schemas/VoiceSettingsInput"
            - type: "null"
          default: null
          description: Voice tuning parameters (speed, pitch, locale).
        type:
          const: image
          description: Must be 'image' for image-based video creation.
          title: Type
          type: string
        image:
          description: Image to animate. Accepts URL, asset ID, or base64-encoded data.
          discriminator:
            mapping:
              asset_id:
                $ref: "#/components/schemas/AssetId"
              base64:
                $ref: "#/components/schemas/AssetBase64"
              url:
                $ref: "#/components/schemas/AssetUrl"
            propertyName: type
          oneOf:
            - $ref: "#/components/schemas/AssetUrl"
            - $ref: "#/components/schemas/AssetId"
            - $ref: "#/components/schemas/AssetBase64"
          title: Image
        motion_prompt:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: Natural-language prompt controlling avatar body motion.
          title: Motion Prompt
        expressiveness:
          anyOf:
            - $ref: "#/components/schemas/Expressiveness"
            - type: "null"
          default: null
          description: Avatar expressiveness level. Defaults to 'low' when omitted.
      required:
        - type
        - image
      title: CreateVideoFromImage
      type: object
    VideoOutputFormat:
      description: Output container for the generated video.
      enum:
        - mp4
        - webm
      title: VideoOutputFormat
      type: string
    VideoResolution:
      description: Output video resolution.
      enum:
        - 4k
        - 1080p
        - 720p
      title: VideoResolution
      type: string
    VideoAspectRatio:
      description: Output video aspect ratio.
      enum:
        - "16:9"
        - "9:16"
      title: VideoAspectRatio
      type: string
    BackgroundSetting:
      description: Background configuration for the generated video.
      properties:
        type:
          description: >-
            Background type. 'color' uses a solid hex color; 'image' uses an
            image from url or asset_id.
          enum:
            - color
            - image
          title: Type
          type: string
        value:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: Hex color code (e.g. '#ff0000'). Required when type is 'color'.
          title: Value
        url:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: >-
            URL of the background image. Used when type is 'image'. Mutually
            exclusive with asset_id.
          title: Url
        asset_id:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: >-
            HeyGen asset ID of the background image. Used when type is 'image'.
            Mutually exclusive with url.
          title: Asset Id
      required:
        - type
      title: BackgroundSetting
      type: object
    VoiceSettingsInput:
      description: >-
        Voice tuning parameters for text-to-speech.


        Applies only when 'script' + 'voice_id' are provided — not when
        audio_url/audio_asset_id

        is used (uploaded audio bypasses TTS).
      properties:
        speed:
          default: 1
          description: Playback speed multiplier. 0.5 (half speed) to 1.5 (1.5x speed).
          maximum: 1.5
          minimum: 0.5
          title: Speed
          type: number
        pitch:
          default: 0
          description: Pitch adjustment in semitones. -50 to +50.
          maximum: 50
          minimum: -50
          title: Pitch
          type: number
        volume:
          default: 1
          description: >-
            Voice audio volume. 1.0 = full, 0.0 = silent. Useful when mixing
            spoken voice with background audio.
          maximum: 1
          minimum: 0
          title: Volume
          type: number
        locale:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: Locale/accent hint for multi-lingual voices (e.g. 'en-US').
          title: Locale
        engine_settings:
          anyOf:
            - discriminator:
                mapping:
                  elevenlabs:
                    $ref: "#/components/schemas/ElevenLabsEngineSettings"
                  fish:
                    $ref: "#/components/schemas/FishEngineSettings"
                  starfish:
                    $ref: "#/components/schemas/StarfishEngineSettings"
                propertyName: engine_type
              oneOf:
                - $ref: "#/components/schemas/ElevenLabsEngineSettings"
                - $ref: "#/components/schemas/FishEngineSettings"
                - $ref: "#/components/schemas/StarfishEngineSettings"
            - type: "null"
          default: null
          description: >-
            Engine-specific voice tuning, discriminated by 'engine_type'. Use
            the variant matching the engine backing the chosen voice (e.g.
            engine_type='elevenlabs' for ElevenLabs-backed voices). The request
            is rejected if the voice_id is not compatible with the selected
            engine.
          title: Engine Settings
      title: VoiceSettingsInput
      type: object
    Expressiveness:
      description: Avatar expressiveness level for photo avatars.
      enum:
        - high
        - medium
        - low
      title: Expressiveness
      type: string
    AssetId:
      additionalProperties: false
      description: Asset input via HeyGen asset ID (from POST /v1/asset).
      properties:
        type:
          const: asset_id
          description: Input type discriminator
          title: Type
          type: string
        asset_id:
          description: HeyGen asset ID from POST /v1/asset upload endpoint
          title: Asset Id
          type: string
      required:
        - type
        - asset_id
      title: AssetId
      type: object
    AssetBase64:
      additionalProperties: false
      description: Asset input via base64-encoded content.
      properties:
        type:
          const: base64
          description: Input type discriminator
          title: Type
          type: string
        media_type:
          description: MIME type of the encoded content (e.g. "image/png")
          title: Media Type
          type: string
        data:
          description: Base64-encoded file content
          title: Data
          type: string
      required:
        - type
        - media_type
        - data
      title: AssetBase64
      type: object
      x-mcp-visible: false
    AssetUrl:
      additionalProperties: false
      description: Asset input via publicly accessible HTTPS URL.
      properties:
        type:
          const: url
          description: Input type discriminator
          title: Type
          type: string
        url:
          description: Publicly accessible HTTPS URL for the asset
          title: Url
          type: string
      required:
        - type
        - url
      title: AssetUrl
      type: object
    ElevenLabsEngineSettings:
      description: >-
        Engine-specific voice settings for ElevenLabs-backed voices.


        Inherits the ElevenLabs tuning fields (model, stability,
        similarity_boost, style,

        use_speaker_boost) along with the eleven_v3 stability validator from

        :class:`movio.api_service.app.api_types.video.ElevenLabsSettings`.
      properties:
        model:
          anyOf:
            - $ref: "#/components/schemas/ElevenLabsModel"
            - type: "null"
          default: null
          description: The model ID to use for ElevenLabs.
        similarity_boost:
          anyOf:
            - maximum: 1
              minimum: 0
              type: number
            - type: "null"
          default: null
          description: The similarity boost parameter for ElevenLabs.
          title: Similarity Boost
        stability:
          anyOf:
            - maximum: 1
              minimum: 0
              type: number
            - type: "null"
          default: null
          description: The stability parameter for ElevenLabs.
          title: Stability
        style:
          anyOf:
            - maximum: 1
              minimum: 0
              type: number
            - type: "null"
          default: null
          description: The style parameter for ElevenLabs.
          title: Style
        use_speaker_boost:
          anyOf:
            - type: boolean
            - type: "null"
          default: null
          description: Whether to use speaker boost for ElevenLabs.
          title: Use Speaker Boost
        engine_type:
          const: elevenlabs
          description: >-
            Engine type discriminator. Must be 'elevenlabs' for
            ElevenLabs-backed voices.
          title: Engine Type
          type: string
      required:
        - engine_type
      title: ElevenLabsEngineSettings
      type: object
    FishEngineSettings:
      description: |-
        Engine-specific voice settings for Fish Audio-backed voices.

        Inherits Fish's tuning fields (model, stability, similarity).
      properties:
        model:
          anyOf:
            - $ref: "#/components/schemas/FishModel"
            - type: "null"
          default: null
          description: Fish Audio model version (default 's1').
        stability:
          anyOf:
            - maximum: 1
              minimum: 0
              type: number
            - type: "null"
          default: null
          description: Stability parameter; higher is more consistent.
          title: Stability
        similarity:
          anyOf:
            - maximum: 1
              minimum: 0
              type: number
            - type: "null"
          default: null
          description: Similarity parameter; how closely to match the source voice.
          title: Similarity
        engine_type:
          const: fish
          description: >-
            Engine type discriminator. Must be 'fish' for Fish Audio-backed
            voices.
          title: Engine Type
          type: string
      required:
        - engine_type
      title: FishEngineSettings
      type: object
    StarfishEngineSettings:
      description: >-
        Engine-selection for Starfish-backed voices.


        Starfish has no user-tunable settings today; set
        ``engine_type='starfish'`` to force

        Starfish routing on voices that support multiple engines.
      properties:
        engine_type:
          const: starfish
          description: >-
            Engine type discriminator. Must be 'starfish' for Starfish-backed
            voices.
          title: Engine Type
          type: string
      required:
        - engine_type
      title: StarfishEngineSettings
      type: object
    ElevenLabsModel:
      description: >-
        ElevenLabs model IDs exposed on the public API.


        Only current models are included — deprecated models (monolingual_v1,
        multilingual_v1,

        turbo_v2) are not accepted. The web auto-remaps them to newer
        equivalents; the API

        should not offer models we wouldn't recommend using.
      enum:
        - eleven_multilingual_v2
        - eleven_turbo_v2_5
        - eleven_flash_v2_5
        - eleven_v3
      title: ElevenLabsModel
      type: string
    FishModel:
      description: >-
        Fish Audio model version. Mirrors the choices exposed on the web
        (FISH_MODELS).
      enum:
        - s1
        - s2-pro
      title: FishModel
      type: string
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: x-api-key
      description: HeyGen API key. Obtain from your HeyGen dashboard.
    BearerAuth:
      type: http
      scheme: bearer
      description: OAuth2 bearer token.
```
