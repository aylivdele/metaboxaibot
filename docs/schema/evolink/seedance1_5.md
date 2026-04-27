> ## Documentation Index
>
> Fetch the complete documentation index at: https://docs.evolink.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Seedance-1.5-Pro Video Generation

> - Seedance 1.5 Pro (seedance-1.5-pro) model supports multiple generation modes including text-to-video, image-to-video, and first-last-frame

- Asynchronous processing mode, use the returned task ID to [query](/en/api-manual/task-management/get-task-detail)
- Generated video links are valid for 24 hours, please save them promptly

## OpenAPI

````yaml /en/api-manual/video-series/seedance1.5/seedance-1.5-pro-video-generate.json POST /v1/videos/generations
openapi: 3.1.0
info:
  title: seedance-1.5-pro API
  description: >-
    Create video generation tasks using AI models, supporting text-to-video
    generation mode
  license:
    name: MIT
  version: 1.0.0
servers:
  - url: https://api.evolink.ai
    description: Production environment
security:
  - bearerAuth: []
tags:
  - name: Video Generation
    description: AI video generation related APIs
paths:
  /v1/videos/generations:
    post:
      tags:
        - Video Generation
      summary: seedance-1.5-pro API
      description: >-
        - Seedance 1.5 Pro (seedance-1.5-pro) model supports multiple generation
        modes including text-to-video, image-to-video, and first-last-frame

        - Asynchronous processing mode, use the returned task ID to
        [query](/en/api-manual/task-management/get-task-detail)

        - Generated video links are valid for 24 hours, please save them
        promptly
      operationId: createVideoGeneration
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/VideoGenerationRequest"
            examples:
              text_to_video_basic:
                summary: Text to Video (Basic)
                value:
                  model: seedance-1.5-pro
                  prompt: A cat playing piano
      responses:
        "200":
          description: Video generation task created successfully
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/VideoGenerationResponse"
        "400":
          description: Invalid request parameters
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
              example:
                error:
                  code: invalid_request
                  message: Invalid request parameters
                  type: invalid_request_error
        "401":
          description: Unauthenticated, invalid or expired token
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
              example:
                error:
                  code: unauthorized
                  message: Invalid or expired token
                  type: authentication_error
        "402":
          description: Insufficient quota, recharge required
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
              example:
                error:
                  code: insufficient_quota
                  message: Insufficient quota. Please top up your account.
                  type: insufficient_quota
        "403":
          description: Access denied
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
              example:
                error:
                  code: model_access_denied
                  message: "Token does not have access to model: seedance-1.5-pro"
                  type: invalid_request_error
        "429":
          description: Rate limit exceeded
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
              example:
                error:
                  code: rate_limit_exceeded
                  message: Too many requests, please try again later
                  type: rate_limit_error
        "500":
          description: Internal server error
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
              example:
                error:
                  code: internal_error
                  message: Internal server error
                  type: api_error
components:
  schemas:
    VideoGenerationRequest:
      type: object
      required:
        - model
        - prompt
      properties:
        model:
          type: string
          description: Video generation model name
          enum:
            - seedance-1.5-pro
          default: seedance-1.5-pro
          example: seedance-1.5-pro
        prompt:
          type: string
          description: >-
            Prompt describing the video you want to generate, limited to 2000
            tokens
          example: A cat playing piano
          maxLength: 2000
        image_urls:
          type: array
          description: >-
            Reference image URL list for image-to-video functionality


            **Mode Detection:**

            - 0 images = text-to-video

            - 1 image = image-to-video

            - 2 images = first-last-frame


            **Note:**

            - Number of images supported per request: `2` images

            - Image size: Not exceeding `10MB`

            - Supported file formats: `.jpg`, `.jpeg`, `.png`, `.webp`

            - Aspect ratio (width/height): `0.4` ~ `2.5`

            - Width and height: `300` ~ `6000` px

            - Image URLs must be directly viewable by the server, or the URL
            should trigger a direct download when accessed (typically these URLs
            end with image extensions like `.png`, `.jpg`)
          items:
            type: string
            format: uri
          maxItems: 2
          example:
            - https://example.com/image.jpg
        duration:
          type: integer
          description: >-
            Specifies the duration of the generated video (in seconds), defaults
            to `5` seconds


            **Note:**

            - Supports any integer value between `4` and `12` seconds

            - Billing for a single request is based on the `duration` value;
            longer durations result in higher costs
          minimum: 4
          maximum: 12
        quality:
          type: string
          description: >-
            Video resolution, defaults to `720p`


            **Note:**

            - `480p`: Lower resolution, lower pricing

            - `720p`: Standard definition, standard pricing, this is the default
            value

            - `1080p`: High definition, higher pricing
          enum:
            - 480p
            - 720p
            - 1080p
          example: 720p
        aspect_ratio:
          type: string
          description: >-
            Video aspect ratio


            **Supported values:**

            - `16:9` (landscape), `9:16` (portrait), `1:1` (square), `4:3`,
            `3:4`, `21:9` (ultra-wide), `adaptive`

            - Default value: `16:9`
          example: "16:9"
        generate_audio:
          type: boolean
          description: >-
            Whether to generate audio, enabling will increase cost, defaults to
            `true`


            **Options:**

            - `true`: Model output video includes synchronized audio. Seedance
            1.5 Pro can automatically generate matching voice, sound effects,
            and background music based on text prompts and visual content. It is
            recommended to place dialogue within double quotes to optimize audio
            generation. Example: The man stopped the woman and said: "Remember,
            you must never point at the moon with your finger."

            - `false`: Model output video is silent
          default: true
          example: true
        callback_url:
          type: string
          description: >-
            HTTPS callback URL after task completion


            **Callback timing:**

            - Triggered when task is completed, failed, or cancelled

            - Sent after billing confirmation is completed


            **Security restrictions:**

            - Only HTTPS protocol is supported

            - Callbacks to internal network IP addresses are prohibited
            (127.0.0.1, 10.x.x.x, 172.16-31.x.x, 192.168.x.x, etc.)

            - URL length must not exceed `2048` characters


            **Callback mechanism:**

            - Timeout: `10` seconds

            - Maximum of `3` retries after failure (retries occur after
            `1`/`2`/`4` seconds following failure)

            - Callback response body format is consistent with task query API
            response format

            - Callback URL returning 2xx status code is considered successful;
            other status codes will trigger retries
          format: uri
          example: https://your-domain.com/webhooks/video-task-completed
    VideoGenerationResponse:
      type: object
      properties:
        created:
          type: integer
          description: Task creation timestamp
          example: 1761313744
        id:
          type: string
          description: Task ID
          example: task-unified-1761313744-vux2jw0k
        model:
          type: string
          description: Actual model name used
          example: seedance-1.5-pro
        object:
          type: string
          enum:
            - video.generation.task
          description: Specific type of the task
        progress:
          type: integer
          description: Task progress percentage (0-100)
          minimum: 0
          maximum: 100
          example: 0
        status:
          type: string
          description: Task status
          enum:
            - pending
            - processing
            - completed
            - failed
          example: pending
        task_info:
          $ref: "#/components/schemas/VideoTaskInfo"
          description: Video task detailed information
        type:
          type: string
          enum:
            - text
            - image
            - audio
            - video
          description: Output type of the task
          example: video
        usage:
          $ref: "#/components/schemas/VideoUsage"
          description: Usage and billing information
    ErrorResponse:
      type: object
      properties:
        error:
          type: object
          properties:
            code:
              type: string
              description: Error code identifier
            message:
              type: string
              description: Error description
            type:
              type: string
              description: Error type
    VideoTaskInfo:
      type: object
      properties:
        can_cancel:
          type: boolean
          description: Whether the task can be cancelled
          example: true
        estimated_time:
          type: integer
          description: Estimated completion time (seconds)
          minimum: 0
          example: 165
        video_duration:
          type: integer
          description: Video duration (seconds)
          example: 8
    VideoUsage:
      type: object
      description: Usage and billing information
      properties:
        billing_rule:
          type: string
          description: Billing rule
          enum:
            - per_call
            - per_token
            - per_second
          example: per_call
        credits_reserved:
          type: number
          description: Estimated credits consumed
          minimum: 0
          example: 8
        user_group:
          type: string
          description: User group category
          example: default
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      description: >-
        ##All APIs require Bearer Token authentication##


        **Get API Key:**


        Visit [API Key Management Page](https://evolink.ai/dashboard/keys) to
        get your API Key


        **Add to request header:**

        ```

        Authorization: Bearer YOUR_API_KEY

        ```
````
