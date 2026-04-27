> ## Documentation Index
>
> Fetch the complete documentation index at: https://docs.evolink.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Kling-O3 Image to Video

> - Kling-O3 Image to Video (kling-o3-image-to-video) generates videos based on input images, powered by the Kling AI kling-v3-omni model

- Supports first frame, last frame, reference images, element control, multi-shot, and sound effects
- Asynchronous processing mode, use the returned task ID to [query status](/en/api-manual/task-management/get-task-detail)
- Generated video links are valid for 24 hours, please save them promptly

## OpenAPI

````yaml /en/api-manual/video-series/kling/kling-o3-image-to-video.json POST /v1/videos/generations
openapi: 3.1.0
info:
  title: kling-o3-image-to-video API
  description: >-
    Generate videos based on input images. Supports first frame, last frame,
    reference images, element control, multi-shot, and sound effects. Based on
    the Kling AI kling-v3-omni model.
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
      summary: kling-o3-image-to-video API
      description: >-
        - Kling-O3 Image to Video (kling-o3-image-to-video) generates videos
        based on input images, powered by the Kling AI kling-v3-omni model

        - Supports first frame, last frame, reference images, element control,
        multi-shot, and sound effects

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
              first_frame:
                summary: Single Image First Frame (Minimal)
                value:
                  model: kling-o3-image-to-video
                  prompt: The person in the image slowly turns their head and smiles
                  image_start: https://example.com/portrait.jpg
                  duration: 5
                  quality: 720p
              first_last_frame:
                summary: First Frame + Last Frame
                value:
                  model: kling-o3-image-to-video
                  prompt: Transition from daytime to nighttime
                  image_start: https://example.com/day.jpg
                  image_end: https://example.com/night.jpg
                  duration: 10
                  quality: 1080p
                  sound: "on"
              with_reference_and_element:
                summary: Reference Image + Element Control
                value:
                  model: kling-o3-image-to-video
                  prompt: <<<element_1>>> dancing in the scene of <<<image_1>>>
                  image_urls:
                    - https://example.com/scene.jpg
                  duration: 8
                  aspect_ratio: "16:9"
                  quality: 1080p
                  model_params:
                    element_list:
                      - element_id: "123456"
              multi_shot:
                summary: Multi-Shot Image to Video
                value:
                  model: kling-o3-image-to-video
                  image_start: https://example.com/portrait.jpg
                  image_urls:
                    - https://example.com/bg.jpg
                  duration: 10
                  aspect_ratio: "16:9"
                  quality: 1080p
                  model_params:
                    multi_shot: true
                    shot_type: customize
                    multi_prompt:
                      - index: 1
                        prompt: <<<image_1>>> person sitting in a park
                        duration: "5"
                      - index: 2
                        prompt: Camera switches to <<<image_2>>> street view
                        duration: "5"
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
                  message: "Token does not have access to model: kling-o3-image-to-video"
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
            - kling-o3-image-to-video
          default: kling-o3-image-to-video
          example: kling-o3-image-to-video
        prompt:
          type: string
          description: >-
            Text prompt. Required when multi_shot=false (default), provided by
            multi_prompt for each shot when multi_shot=true


            **Note:**

            - Maximum `2500` characters

            - Use `<<<element_1>>>` to reference elements, `<<<image_1>>>` to
            reference images
          maxLength: 2500
        image_start:
          type: string
          format: uri
          description: >-
            First frame image URL


            **Image format requirements:**

            - Format: JPG / JPEG / PNG

            - Size: <= 10MB

            - Dimensions: width and height >= 300px, aspect ratio between 1:2.5
            and 2.5:1
        image_end:
          type: string
          format: uri
          description: |-
            Last frame image URL

            **Constraints:**
            - Last frame requires a first frame
            - Last frame not supported when total image count exceeds 2
        image_urls:
          type: array
          description: >-
            Reference image URL array (not first/last frame, for
            style/scene/element reference)
          items:
            type: string
            format: uri
        duration:
          type: integer
          description: Video duration (seconds), integer in range 3-15
          minimum: 3
          maximum: 15
          default: 5
        aspect_ratio:
          type: string
          description: Video aspect ratio
          enum:
            - "16:9"
            - "9:16"
            - "1:1"
        quality:
          type: string
          description: Resolution tier
          enum:
            - 720p
            - 1080p
        sound:
          type: string
          description: Sound effect control
          enum:
            - "on"
            - "off"
          default: "off"
        model_params:
          type: object
          description: Model extension parameters
          properties:
            multi_shot:
              type: boolean
              description: >-
                Whether to enable multi-shot mode. **When enabled, the `prompt`
                parameter will be ignored** — use `multi_prompt` to define
                content for each shot instead. **The sum of all shot `duration`
                values must equal the total video duration**
            shot_type:
              type: string
              description: Shot segmentation method. Required when multi_shot=true
              enum:
                - customize
            multi_prompt:
              type: array
              description: >-
                Shot information list. Required when multi_shot=true &&
                shot_type=customize


                Format: [{"index": int, "prompt": "string", "duration":
                "string"}, ...]

                - Maximum 6 shots

                - Each shot prompt maximum 512 characters

                - Sum of all shot durations must equal total duration
            element_list:
              type: array
              description: |-
                Element library list

                **Constraints:**
                - Element count <= 3 when first frame is provided
                - Image count + element count <= 7 when no video
                - Reference in prompt using `<<<element_1>>>` syntax
              items:
                type: object
                properties:
                  element_id:
                    type: string
                    description: Element ID
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
          example: kling-o3-image-to-video
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
