> ## Documentation Index
>
> Fetch the complete documentation index at: https://docs.evolink.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Kling Custom Element

> - Kling Custom Element (kling-custom-element) creates reusable subject elements (characters/objects) from reference images or videos

- After successful creation, the returned `element_id` can be referenced in Kling O3 series and Kling V3 Image-to-Video via the `element_list` parameter, enabling consistent character appearance control
- Asynchronous processing mode, use the returned task ID to [query status](/en/api-manual/task-management/get-task-detail)
- Upon task completion, `result_data` will contain the `element_id` for video generation

**Important Notes:**

- This model is used to create reusable subjects (elements), **it does not generate videos**, no prompt / duration / quality / aspect_ratio parameters are needed

## OpenAPI

````yaml /en/api-manual/video-series/kling/kling-custom-element.json POST /v1/videos/generations
openapi: 3.1.0
info:
  title: kling-custom-element API
  description: >-
    Create reusable subject elements (characters/objects) for consistent
    character appearance in Kling O3 series and Kling V3 Image-to-Video
    generation
  license:
    name: MIT
  version: 1.0.0
servers:
  - url: https://api.evolink.ai
    description: Production
security:
  - bearerAuth: []
tags:
  - name: Subject Element Creation
    description: >-
      Create reusable subject elements for consistent character appearance
      control in video generation
paths:
  /v1/videos/generations:
    post:
      tags:
        - Subject Element Creation
      summary: kling-custom-element API
      description: >-
        - Kling Custom Element (kling-custom-element) creates reusable subject
        elements (characters/objects) from reference images or videos

        - After successful creation, the returned `element_id` can be referenced
        in Kling O3 series and Kling V3 Image-to-Video via the `element_list`
        parameter, enabling consistent character appearance control

        - Asynchronous processing mode, use the returned task ID to [query
        status](/en/api-manual/task-management/get-task-detail)

        - Upon task completion, `result_data` will contain the `element_id` for
        video generation


        **Important Notes:**

        - This model is used to create reusable subjects (elements), **it does
        not generate videos**, no prompt / duration / quality / aspect_ratio
        parameters are needed
      operationId: createCustomElement
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CustomElementRequest"
            examples:
              image_refer:
                summary: Create Subject from Reference Images
                value:
                  model: kling-custom-element
                  model_params:
                    element_name: My Character
                    element_description: >-
                      A young male character with short hair, wearing a white
                      T-shirt
                    reference_type: image_refer
                    element_image_list:
                      frontal_image: https://example.com/front.jpg
                      refer_images:
                        - image_url: https://example.com/side.jpg
              video_refer:
                summary: Create Subject from Reference Video
                value:
                  model: kling-custom-element
                  model_params:
                    element_name: My Character
                    element_description: A female character with long hair, wearing a red dress
                    reference_type: video_refer
                    element_video_list:
                      video_url: https://example.com/reference.mp4
      responses:
        "200":
          description: Subject element creation task submitted successfully
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/CustomElementResponse"
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
          description: Unauthenticated, token invalid or expired
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
                  message: "Token does not have access to model: kling-custom-element"
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
        "502":
          description: Upstream service error
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
              example:
                error:
                  code: upstream_error
                  message: Upstream AI service unavailable
                  type: upstream_error
components:
  schemas:
    CustomElementRequest:
      type: object
      required:
        - model
        - model_params
      properties:
        model:
          type: string
          description: Model name
          enum:
            - kling-custom-element
          default: kling-custom-element
          example: kling-custom-element
        model_params:
          type: object
          description: Model parameters
          required:
            - element_name
            - element_description
            - reference_type
          properties:
            element_name:
              type: string
              description: |-
                Subject element name

                **Note:**
                - Maximum `20` characters
              maxLength: 20
              example: My Character
            element_description:
              type: string
              description: >-
                Subject element description, helps the model understand the
                subject's appearance features


                **Note:**

                - Maximum `100` characters
              maxLength: 100
              example: A young male character with short hair, wearing a white T-shirt
            reference_type:
              type: string
              description: |-
                Reference material type

                | Value | Description |
                |---|---|
                | `image_refer` | Create subject using reference images |
                | `video_refer` | Create subject using reference video |
              enum:
                - image_refer
                - video_refer
              example: image_refer
            element_image_list:
              type: object
              description: >-
                Reference image list for creating subject elements. Required
                when `reference_type = image_refer`


                **Note:**

                - It is recommended to use clear, well-lit images with a
                prominent subject

                - Image dimensions: width and height ≥ `300px`, aspect ratio
                between `1:2.5` and `2.5:1`

                - `frontal_image` (recommended): Frontal reference image URL

                - `refer_images`: Additional reference image list, each item
                contains an `image_url` field
              properties:
                frontal_image:
                  type: string
                  format: uri
                  description: Frontal reference image URL (recommended)
                refer_images:
                  type: array
                  description: Additional reference image list
                  items:
                    type: object
                    properties:
                      image_url:
                        type: string
                        format: uri
                        description: Reference image URL
                    required:
                      - image_url
              example:
                frontal_image: https://example.com/front.jpg
                refer_images:
                  - image_url: https://example.com/side.jpg
            element_video_list:
              type: object
              description: >-
                Reference video for creating subject elements. Required when
                `reference_type = video_refer`


                **Note:**

                - `video_url`: Reference video URL
              properties:
                video_url:
                  type: string
                  format: uri
                  description: Reference video URL
              required:
                - video_url
              example:
                video_url: https://example.com/reference.mp4
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
    CustomElementResponse:
      type: object
      properties:
        created:
          type: integer
          description: Task creation timestamp
          example: 1757169743
        id:
          type: string
          description: Task ID
          example: task-unified-1757169743-8dxnm6yz
        model:
          type: string
          description: Actual model name used
          example: kling-custom-element
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
          type: object
          description: Task details
          properties:
            can_cancel:
              type: boolean
              description: Whether the task can be cancelled
              example: true
            estimated_time:
              type: integer
              description: Estimated completion time (seconds)
              minimum: 0
              example: 600
        type:
          type: string
          enum:
            - video
          description: Task output type
          example: video
        usage:
          type: object
          description: Usage and billing information
          properties:
            billing_rule:
              type: string
              description: Billing rule
              enum:
                - per_call
              example: per_call
            credits_reserved:
              type: number
              description: Estimated credits consumed
              minimum: 0
              example: 1
            user_group:
              type: string
              description: User group category
              example: default
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
        ## All APIs require Bearer Token authentication ##


        **Get API Key:**


        Visit [API Key Management Page](https://evolink.ai/dashboard/keys) to
        get your API Key


        **Add to request header:**

        ```

        Authorization: Bearer YOUR_API_KEY

        ```
````
