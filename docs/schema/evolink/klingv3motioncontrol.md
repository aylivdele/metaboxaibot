> ## Documentation Index
>
> Fetch the complete documentation index at: https://docs.evolink.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Kling-V3 Motion Control

> - Kling-V3 Motion Control (kling-v3-motion-control) model supports generating motion-driven videos using **reference image + reference video**

- The system extracts motion trajectories from the reference video and applies them to the character/object in the reference image, generating a new video with motions consistent with the reference video
- The generated video duration matches the input reference video length (3–30 seconds)
- Asynchronous processing mode, use the returned task ID to [query task status](/en/api-manual/task-management/get-task-detail)
- Generated video links are valid for 24 hours, please save them promptly

## OpenAPI

````yaml /en/api-manual/video-series/kling/kling-v3-motion-control.json POST /v1/videos/generations
openapi: 3.1.0
info:
  title: kling-v3-motion-control API
  description: Create motion control video tasks using AI models
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
    description: AI video generation related API endpoints
paths:
  /v1/videos/generations:
    post:
      tags:
        - Video Generation
      summary: kling-v3-motion-control API
      description: >-
        - Kling-V3 Motion Control (kling-v3-motion-control) model supports
        generating motion-driven videos using **reference image + reference
        video**

        - The system extracts motion trajectories from the reference video and
        applies them to the character/object in the reference image, generating
        a new video with motions consistent with the reference video

        - The generated video duration matches the input reference video length
        (3–30 seconds)

        - Asynchronous processing mode, use the returned task ID to [query task
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
                summary: Basic Motion Control
                value:
                  model: kling-v3-motion-control
                  prompt: A girl dancing gracefully
                  image_urls:
                    - https://example.com/character.jpg
                  video_urls:
                    - https://example.com/dance-reference.mp4
                  quality: 720p
                  model_params:
                    character_orientation: image
              hd_no_sound:
                summary: HD + No Original Sound
                value:
                  model: kling-v3-motion-control
                  prompt: A robot performing martial arts
                  image_urls:
                    - https://example.com/robot.png
                  video_urls:
                    - https://example.com/martial-arts.mp4
                  quality: 1080p
                  model_params:
                    character_orientation: video
                    keep_sound: false
              with_element:
                summary: With Subject Element Control
                value:
                  model: kling-v3-motion-control
                  image_urls:
                    - https://example.com/person.jpg
                  video_urls:
                    - https://example.com/walking.mp4
                  model_params:
                    character_orientation: video
                    element_list:
                      - element_id: "123456789"
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
          description: Unauthenticated, token is invalid or expired
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
          description: Insufficient quota, top-up required
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
                  message: "Token does not have access to model: kling-v3-motion-control"
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
        - image_urls
        - video_urls
        - model_params
      properties:
        model:
          type: string
          description: Video generation model name
          enum:
            - kling-v3-motion-control
          default: kling-v3-motion-control
          example: kling-v3-motion-control
        image_urls:
          type: array
          items:
            type: string
            format: uri
          description: >-
            Array of reference image URLs, used to provide the appearance source
            of the character/object


            **Note:**

            - Provide one reference image

            - Image size: no larger than `10MB`

            - Supported file formats: `.jpg`, `.jpeg`, `.png`

            - Image dimensions: width and height ≥ `300px`, aspect ratio between
            `1:2.5` and `2.5:1`

            - Image URL must be directly accessible by the server
          example:
            - https://example.com/character.jpg
        video_urls:
          type: array
          items:
            type: string
            format: uri
          description: >-
            Array of reference video URLs, used to provide the motion trajectory
            source


            **Note:**

            - Provide one reference video

            - Video duration: `3` to `30` seconds

            - The generated video duration matches the reference video length

            - Video URL must be directly accessible by the server
          example:
            - https://example.com/dance-reference.mp4
        prompt:
          type: string
          description: >-
            Text prompt (optional), used to guide the generated content


            **Note:**

            - Maximum `2500` characters

            - Can be left empty; the model will automatically generate based on
            the reference image and video
          example: A girl dancing gracefully
          maxLength: 2500
        quality:
          type: string
          description: |-
            Resolution tier

            **Details:**
            - `720p`: Standard quality (std)
            - `1080p`: High quality (pro)
          enum:
            - 720p
            - 1080p
          default: 720p
          example: 720p
        model_params:
          type: object
          required:
            - character_orientation
          description: >-
            Model-specific parameters (required), used for motion control
            configuration
          properties:
            character_orientation:
              type: string
              description: >-
                Character orientation source (**required**)


                **Details:**

                - `image`: Use the character orientation from the reference
                image

                - `video`: Use the character orientation from the reference
                video


                **Restriction:** When using `element_list`, only `video` is
                supported
              enum:
                - image
                - video
              example: image
            element_list:
              type: array
              description: >-
                Subject element list, used to specify the character/object to
                control


                **Note:**

                - Maximum `1` subject element (Motion Control limitation)

                - `element_id`: Subject element ID

                - Only supports elements created via `video_refer` reference
                type (`image_refer` is not supported)
              items:
                type: object
                properties:
                  element_id:
                    type: string
                    description: Subject element ID
                required:
                  - element_id
              maxItems: 1
            keep_sound:
              type: boolean
              description: |-
                Whether to keep the original sound from the reference video

                **Details:**
                - `true`: Keep original sound (default)
                - `false`: Mute
              default: true
              example: true
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
            HTTPS callback URL triggered upon task completion


            **Callback Timing:**

            - Triggered when the task is completed, failed, or cancelled

            - Sent after billing confirmation is complete


            **Security Restrictions:**

            - Only HTTPS protocol is supported

            - Callbacks to private IP addresses are prohibited (127.0.0.1,
            10.x.x.x, 172.16-31.x.x, 192.168.x.x, etc.)

            - URL length must not exceed `2048` characters


            **Callback Mechanism:**

            - Timeout: `10` seconds

            - Up to `3` retries after failure (retries at `1`/`2`/`4` seconds
            after failure)

            - Callback response body format is consistent with the task query
            API response

            - A 2xx status code from the callback URL is considered successful;
            other status codes will trigger a retry
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
          example: kling-v3-motion-control
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
          description: Video task details
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
              description: Error description message
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
          description: Video duration (seconds), matches the reference video length
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
          example: per_second
        credits_reserved:
          type: number
          description: Estimated credits consumed
          minimum: 0
          example: 408240
        user_group:
          type: string
          description: User group category
          example: default
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      description: >-
        ## All API endpoints require Bearer Token authentication ##


        **Get your API Key:**


        Visit the [API Key Management Page](https://evolink.ai/dashboard/keys)
        to obtain your API Key


        **Add the following to your request headers:**

        ```

        Authorization: Bearer YOUR_API_KEY

        ```
````
