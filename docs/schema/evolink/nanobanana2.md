> ## Documentation Index
>
> Fetch the complete documentation index at: https://docs.evolink.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Nanobanana 2 Image Generation

> - Nano Banana 2 (gemini-3.1-flash-image-preview) model supports text-to-image, image-to-image, image editing and other generation modes

- Asynchronous processing mode, use the returned task ID to [query](/en/api-manual/task-management/get-task-detail)
- Generated image links are valid for 24 hours, please save them promptly

## OpenAPI

````yaml /en/api-manual/image-series/nanobanana/nanobanana-2-image-generate.json POST /v1/images/generations
openapi: 3.1.0
info:
  title: Nano Banana 2 Interface
  description: >-
    Create image generation tasks using AI models, supporting various models and
    parameter configurations
  license:
    name: MIT
  version: 1.0.0
servers:
  - url: https://api.evolink.ai
    description: Production environment
security:
  - bearerAuth: []
tags:
  - name: Image Generation
    description: AI image generation related APIs
paths:
  /v1/images/generations:
    post:
      tags:
        - Image Generation
      summary: Nano Banana 2 Interface
      description: >-
        - Nano Banana 2 (gemini-3.1-flash-image-preview) model supports
        text-to-image, image-to-image, image editing and other generation modes

        - Asynchronous processing mode, use the returned task ID to
        [query](/en/api-manual/task-management/get-task-detail)

        - Generated image links are valid for 24 hours, please save them
        promptly
      operationId: createImageGenerationNanoBanana2
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ImageGenerationRequest"
            examples:
              text_to_image:
                summary: Text to Image
                value:
                  model: gemini-3.1-flash-image-preview
                  prompt: A cat playing on the grass
      responses:
        "200":
          description: Image generation task created successfully
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ImageGenerationResponse"
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
                    gemini-3.1-flash-image-preview
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
    ImageGenerationRequest:
      type: object
      required:
        - model
        - prompt
      properties:
        model:
          type: string
          description: >-
            Image generation model name, official channel, better stability and
            controllability, suitable for commercial scenarios
          example: gemini-3.1-flash-image-preview
          enum:
            - gemini-3.1-flash-image-preview
          default: gemini-3.1-flash-image-preview
        prompt:
          type: string
          description: >-
            Prompt describing the image to be generated, or describing how to
            edit the input image, limited to 2000 tokens
          example: A cat playing in the grass
          maxLength: 2000
        size:
          type: string
          description: Aspect ratio of the generated image, default is `auto`
          enum:
            - auto
            - "1:1"
            - "1:4"
            - "4:1"
            - "1:8"
            - "8:1"
            - "2:3"
            - "3:2"
            - "3:4"
            - "4:3"
            - "4:5"
            - "5:4"
            - "9:16"
            - "16:9"
            - "21:9"
        quality:
          type: string
          description: |-
            Quality of the generated image, default is `2K`

            **Note:**
            - Different quality levels have different pricing
          enum:
            - 0.5K
            - 1K
            - 2K
            - 4K
        image_urls:
          type: array
          description: >-
            Reference image URL list for image-to-image and image editing
            functions


            **Note:**

            - Maximum number of input images per request: `14`

            - Image size: not exceeding `20MB`

            - Supported file formats: `.jpeg`, `.jpg`, `.png`, `.webp`

            - Image URLs must be directly accessible by the server, or the image
            URL should directly download when accessed (typically these URLs end
            with image file extensions, such as `.png`, `.jpg`)

            - Maximum of `4` real person images can be uploaded
          items:
            type: string
            format: uri
          example:
            - https://example.com/image1.png
            - https://example.com/image2.png
        model_params:
          type: object
          description: Model extension parameters
          properties:
            web_search:
              type: boolean
              description: >-
                Whether to enable web search. When enabled, the model will use
                web search results to optimize image generation
              example: true
            image_search:
              type: boolean
              description: >-
                Whether to enable image search. When enabled, the model will use
                web image search results to optimize image generation
              example: true
            thinking_level:
              type: string
              description: >-
                Thinking level, controls the depth of reasoning the model
                performs before generating images, defaults to `auto`


                - `auto`: Automatically selects thinking level

                - `min`: Minimal reasoning, fastest

                - `high`: Deep reasoning, best quality
              enum:
                - auto
                - min
                - high
              example: auto
        callback_url:
          type: string
          description: >-
            HTTPS callback address after task completion


            **Callback Timing:**

            - Triggered when task is completed, failed, or cancelled

            - Sent after billing confirmation is completed


            **Security Restrictions:**

            - Only HTTPS protocol is supported

            - Callback to internal IP addresses is prohibited (127.0.0.1,
            10.x.x.x, 172.16-31.x.x, 192.168.x.x, etc.)

            - URL length must not exceed `2048` characters


            **Callback Mechanism:**

            - Timeout: `10` seconds

            - Maximum `3` retries on failure (retries after `1` second/`2`
            seconds/`4` seconds)

            - Callback response body format is consistent with the task query
            API response format

            - Callback address returning 2xx status code is considered
            successful, other status codes will trigger retry
          format: uri
          example: https://your-domain.com/webhooks/image-task-completed
    ImageGenerationResponse:
      type: object
      properties:
        created:
          type: integer
          description: Task creation timestamp
          example: 1757165031
        id:
          type: string
          description: Task ID
          example: task-unified-1757165031-uyujaw3d
        model:
          type: string
          description: Actual model name used
          example: gemini-3.1-flash-image-preview
        object:
          type: string
          enum:
            - image.generation.task
          description: Specific task type
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
          $ref: "#/components/schemas/TaskInfo"
          description: Asynchronous task information
        type:
          type: string
          enum:
            - text
            - image
            - audio
            - video
          description: Task output type
          example: image
        usage:
          $ref: "#/components/schemas/Usage"
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
    TaskInfo:
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
          example: 45
    Usage:
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
          example: 8.7
        user_group:
          type: string
          description: User group category
          enum:
            - default
            - vip
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
