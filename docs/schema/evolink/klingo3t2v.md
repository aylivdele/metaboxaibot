> ## Documentation Index
>
> Fetch the complete documentation index at: https://docs.evolink.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Kling-O3 Text to Video

> - Kling-O3 Text to Video (kling-o3-text-to-video) pure text-driven video generation, based on Kling AI kling-v3-omni model

- Supports single-shot and multi-shot modes, can generate videos with sound effects
- Asynchronous processing mode, use the returned task ID to [query status](/en/api-manual/task-management/get-task-detail)
- Generated video links are valid for 24 hours, please save them promptly

## OpenAPI

````yaml /en/api-manual/video-series/kling/kling-o3-text-to-video.json POST /v1/videos/generations
openapi: 3.1.0
info:
  title: kling-o3-text-to-video API
  description: Create text-to-video tasks using AI models
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
      summary: kling-o3-text-to-video API
      description: >-
        - Kling-O3 Text to Video (kling-o3-text-to-video) pure text-driven video
        generation, based on Kling AI kling-v3-omni model

        - Supports single-shot and multi-shot modes, can generate videos with
        sound effects

        - Asynchronous processing mode, use the returned task ID to [query
        status](/en/api-manual/task-management/get-task-detail)

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
              basic:
                summary: Basic Text to Video
                value:
                  model: kling-o3-text-to-video
                  prompt: A cat running on a grassy field under bright sunshine
                  duration: 5
                  aspect_ratio: "16:9"
                  quality: 720p
              pro_with_sound:
                summary: 1080P with Sound Effects
                value:
                  model: kling-o3-text-to-video
                  prompt: >-
                    Ocean waves crashing against rocks during a thunderstorm,
                    with rumbling thunder
                  duration: 10
                  aspect_ratio: "16:9"
                  quality: 1080p
                  sound: "on"
              multi_shot:
                summary: Multi-shot (Custom Shot Segments)
                value:
                  model: kling-o3-text-to-video
                  duration: 10
                  aspect_ratio: "16:9"
                  quality: 1080p
                  sound: "on"
                  model_params:
                    multi_shot: true
                    shot_type: customize
                    multi_prompt:
                      - index: 1
                        prompt: >-
                          A person standing on a mountain top gazing at the
                          sunrise
                        duration: "5"
                      - index: 2
                        prompt: >-
                          Camera pulls back to reveal the magnificent mountain
                          landscape
                        duration: "5"
              with_element:
                summary: With Element Control
                value:
                  model: kling-o3-text-to-video
                  prompt: <<<element_1>>> walking along the beach at sunset
                  duration: 8
                  aspect_ratio: "16:9"
                  quality: 1080p
                  model_params:
                    element_list:
                      - element_id: "123456"
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
                  message: "Token does not have access to model: kling-o3-text-to-video"
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
            - kling-o3-text-to-video
          default: kling-o3-text-to-video
          example: kling-o3-text-to-video
        prompt:
          type: string
          description: |-
            Text prompt describing what video to generate

            **Note:**
            - Maximum `2500` characters
            - Can be empty when `multi_shot=true` and `shot_type=customize`
            - You can reference elements using `<<<element_1>>>` syntax
          example: A cat running on a grassy field under bright sunshine
          maxLength: 2500
        duration:
          type: integer
          description: >-
            Video duration in seconds, defaults to `5` seconds


            **Note:**

            - Supports integers from `3` to `15`

            - Billing is based on the `duration` value, longer duration costs
            more
          minimum: 3
          maximum: 15
          default: 5
          example: 5
        aspect_ratio:
          type: string
          description: |-
            Video aspect ratio

            **Options:**
            - `16:9`: Landscape video
            - `9:16`: Portrait video
            - `1:1`: Square video
          enum:
            - "16:9"
            - "9:16"
            - "1:1"
          default: "16:9"
          example: "16:9"
        quality:
          type: string
          description: |-
            Resolution quality

            **Options:**
            - `720p`: Standard 720P
            - `1080p`: High quality 1080P
          enum:
            - 720p
            - 1080p
          default: 720p
          example: 720p
        sound:
          type: string
          description: |-
            Sound effect control

            **Options:**
            - `on`: Enable sound effects
            - `off`: Disable sound effects
          enum:
            - "on"
            - "off"
          default: "off"
          example: "off"
        model_params:
          type: object
          description: |-
            Model extension parameters

            **Constraint:** Maximum 7 elements
          properties:
            multi_shot:
              type: boolean
              description: >-
                Whether to use multi-shot mode. **When enabled, the `prompt`
                parameter will be ignored** — use `multi_prompt` to define
                content for each shot instead. **The sum of all shot `duration`
                values must equal the total video duration**
              default: false
              example: false
            shot_type:
              type: string
              description: |-
                Shot segmentation method

                **Options:**
                - `customize`: Custom shot segments
                - Required when `multi_shot=true`
              enum:
                - customize
              example: customize
            multi_prompt:
              type: array
              description: |-
                Shot segment information list

                **Note:**
                - Required when `multi_shot=true` and `shot_type=customize`
                - Maximum `6` shot segments
              items:
                type: object
                properties:
                  index:
                    type: integer
                    description: Shot segment index
                  prompt:
                    type: string
                    description: Shot segment description
                  duration:
                    type: string
                    description: Shot segment duration (seconds)
                required:
                  - index
                  - prompt
                  - duration
              maxItems: 6
            element_list:
              type: array
              description: |-
                Element library list

                **Constraint:** Maximum 7 elements
                - Reference in prompt using `<<<element_1>>>` syntax
              items:
                type: object
                properties:
                  element_id:
                    type: string
                    description: Element ID
                required:
                  - element_id
              maxItems: 7
            watermark_info:
              type: object
              description: Watermark configuration
              properties:
                enabled:
                  type: boolean
                  description: Whether to enable watermark
        callback_url:
          type: string
          description: >-
            HTTPS callback URL for task completion


            **Callback Timing:**

            - Triggered when task is completed, failed, or cancelled

            - Sent after billing confirmation


            **Security Restrictions:**

            - HTTPS protocol only

            - Internal IP addresses are prohibited (127.0.0.1, 10.x.x.x,
            172.16-31.x.x, 192.168.x.x, etc.)

            - URL length must not exceed `2048` characters


            **Callback Mechanism:**

            - Timeout: `10` seconds

            - Maximum `3` retries after failure (at `1`/`2`/`4` seconds after
            failure)

            - Callback response format is consistent with task query API

            - 2xx status code is considered successful, other codes trigger
            retry
          format: uri
          example: https://your-domain.com/webhooks/video-task-completed
    VideoGenerationResponse:
      type: object
      properties:
        created:
          type: integer
          description: Task creation timestamp
          example: 1757169743
        id:
          type: string
          description: Task ID
          example: task-unified-1757169743-7cvnl5zw
        model:
          type: string
          description: Actual model name used
          example: kling-o3-text-to-video
        object:
          type: string
          enum:
            - video.generation.task
          description: Task type
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
          description: Video task details
        type:
          type: string
          enum:
            - text
            - image
            - audio
            - video
          description: Task output type
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
          example: 300
        video_duration:
          type: integer
          description: Video duration (seconds)
          example: 9
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
          example: 7
        user_group:
          type: string
          description: User group category
          example: default
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      description: >-
        ## All APIs require Bearer Token authentication ##


        **Get API Key:**


        Visit [API Key Management Page](https://evolink.ai/dashboard/keys) to
        get your API Key


        **Add to request header:**

        ```

        Authorization: Bearer YOUR_API_KEY

        ```
````
