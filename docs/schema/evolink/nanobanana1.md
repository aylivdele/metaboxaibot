> ## Documentation Index
>
> Fetch the complete documentation index at: https://docs.evolink.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Nanobanana Image Generation Beta

> - Nano Banana (nano-banana-beta) model supports text-to-image, image-to-image, image editing and other generation modes

- Asynchronous processing mode, use the returned task ID to [query](/en/api-manual/task-management/get-task-detail)
- Generated image links are valid for 24 hours, please save them promptly

## OpenAPI

````yaml /en/api-manual/image-series/nanobanana/nanobanana-image-generate.json POST /v1/images/generations
openapi: 3.1.0
info:
  title: nano-banana Interface
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
      summary: nano-banana Interface
      description: >-
        - Nano Banana (nano-banana-beta) model supports text-to-image,
        image-to-image, image editing and other generation modes

        - Asynchronous processing mode, use the returned task ID to
        [query](/en/api-manual/task-management/get-task-detail)

        - Generated image links are valid for 24 hours, please save them
        promptly
      operationId: createImageGeneration
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
                  model: nano-banana-beta
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
                  message: "Token does not have access to model: nano-banana-beta"
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
            Image generation model name


            **Backward Compatible:** The previously integrated model name
            `gemini-2.5-flash-image` is still supported and will be
            automatically mapped to `nano-banana-beta`
          enum:
            - nano-banana-beta
          default: nano-banana-beta
          example: nano-banana-beta
        prompt:
          type: string
          description: >-
            Prompt describing the image to be generated, or describing how to
            edit the input image, limited to 2000 tokens
          example: A cat playing in the grass
          maxLength: 2000
        size:
          type: string
          description: Aspect ratio of the generated image, default value is `auto`
          enum:
            - auto
            - "1:1"
            - "2:3"
            - "3:2"
            - "4:3"
            - "3:4"
            - "16:9"
            - "9:16"
        image_urls:
          type: array
          description: >-
            Reference image URL list for image-to-image and image editing
            functions


            **Note:**

            - Maximum number of input images per request: `5`

            - Image size: not exceeding `10MB`

            - Supported file formats: `.jpeg`, `.jpg`, `.png`, `.webp`

            - Image URLs must be directly accessible by the server, or the image
            URL should directly download when accessed (typically these URLs end
            with image file extensions, such as `.png`, `.jpg`)
          items:
            type: string
            format: uri
          example:
            - https://example.com/image1.png
            - https://example.com/image2.png
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
          example: nano-banana-beta
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
          example: 1.6
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
