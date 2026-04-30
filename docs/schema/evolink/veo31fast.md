> ## Documentation Index
>
> Fetch the complete documentation index at: https://docs.evolink.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Veo3.1-Fast Video Generation

> - Veo 3.1 Fast Generate Preview supports text-to-video, first-frame image-to-video and more

- Async processing, use returned task ID to [query status](/en/api-manual/task-management/get-task-detail)
- Generated video links are valid for 24 hours, please save promptly

## OpenAPI

````yaml /en/api-manual/video-series/veo3.1/veo-3.1-fast-generate-preview-generate.json POST /v1/videos/generations
openapi: 3.1.0
info:
  title: Veo-3.1-Fast-Generate-Preview API
  description: >-
    Create video generation tasks using AI models, supporting text-to-video,
    image-to-video and more
  license:
    name: MIT
  version: 1.0.0
servers:
  - url: https://api.evolink.ai
    description: Production
security:
  - bearerAuth: []
tags:
  - name: Video Generation
    description: AI video generation APIs
paths:
  /v1/videos/generations:
    post:
      tags:
        - Video Generation
      summary: Veo-3.1-Fast-Generate-Preview API
      description: >-
        - Veo 3.1 Fast Generate Preview supports text-to-video, first-frame
        image-to-video and more

        - Async processing, use returned task ID to [query
        status](/en/api-manual/task-management/get-task-detail)

        - Generated video links are valid for 24 hours, please save promptly
      operationId: createVideoGeneration
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/VideoGenerationRequest"
            examples:
              text_to_video:
                summary: Text-to-Video
                value:
                  model: veo-3.1-fast-generate-preview
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
                  message: >-
                    Token does not have access to model:
                    veo-3.1-fast-generate-preview
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
          default: veo-3.1-fast-generate-preview
          example: veo-3.1-fast-generate-preview
        prompt:
          type: string
          description: Prompt describing the video, max 2000 tokens
          example: A cat playing piano
          maxLength: 2000
        image_urls:
          type: array
          description: >-
            Reference image URLs, max 3 images (FIRST&LAST mode supports 1-2,
            REFERENCE mode supports up to 3), max 10MB each
          items:
            type: string
            format: uri
          maxItems: 3
        generation_type:
          type: string
          description: >-
            Generation mode:

            - `TEXT`: Text-to-video

            - `FIRST&LAST`: First-last frame, 1-2 images

            - `REFERENCE`: Reference image, max 3 images, duration fixed at 8s,
            aspect ratio fixed at 16:9, except `generate_audio`, other advanced
            params not supported
          enum:
            - TEXT
            - FIRST&LAST
            - REFERENCE
        aspect_ratio:
          type: string
          description: >-
            Video aspect ratio. When set to `auto`: image-to-video will
            automatically select based on the input image ratio, text-to-video
            will automatically select based on the prompt content
          enum:
            - auto
            - "16:9"
            - "9:16"
        generate_audio:
          type: boolean
          description: Generate audio (extra cost), default `true`
        duration:
          type: integer
          description: Duration (seconds), default `4`
          enum:
            - 4
            - 6
            - 8
        "n":
          type: integer
          description: Number of videos, default `1`
          minimum: 1
          maximum: 4
        quality:
          type: string
          description: Resolution, default `720p`
          enum:
            - 720p
            - 1080p
            - 4k
        seed:
          type: integer
          minimum: 1
          maximum: 4294967295
        negative_prompt:
          type: string
        person_generation:
          type: string
          description: Person generation control, default `allow_adult`
          enum:
            - allow_adult
            - dont_allow
        resize_mode:
          type: string
          description: Resize mode (I2V only), default `pad`
          enum:
            - pad
            - crop
        callback_url:
          type: string
          format: uri
    VideoGenerationResponse:
      type: object
      properties:
        created:
          type: integer
          example: 1757169743
        id:
          type: string
          example: task-unified-1757169743-7cvnl5zw
        model:
          type: string
          example: veo-3.1-fast-generate-preview
        status:
          type: string
          enum:
            - pending
            - processing
            - completed
            - failed
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
