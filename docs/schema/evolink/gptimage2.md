> ## Documentation Index
>
> Fetch the complete documentation index at: https://docs.evolink.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# GPT Image 2 Image Generation

> - GPT Image 2 (gpt-image-2) model supports text-to-image, image-to-image, image editing and other generation modes

- Asynchronous processing mode, use the returned task ID to [query](/en/api-manual/task-management/get-task-detail)
- Generated image links are valid for 24 hours, please save them promptly

## OpenAPI

````yaml /en/api-manual/image-series/gpt-image-2/gpt-image-2-image-generation.json POST /v1/images/generations
openapi: 3.1.0
info:
  title: gpt-image-2 API
  description: >-
    Create image tasks using AI models with support for multiple models and
    parameter configurations
  license:
    name: MIT
  version: 1.0.0
servers:
  - url: https://api.evolink.ai
    description: Production
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
      summary: gpt-image-2 API
      description: >-
        - GPT Image 2 (gpt-image-2) model supports text-to-image,
        image-to-image, image editing and other generation modes

        - Asynchronous processing mode, use the returned task ID to
        [query](/en/api-manual/task-management/get-task-detail)

        - Generated image links are valid for 24 hours, please save them
        promptly
      operationId: createImageGenerationGptImage2
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ImageGenerationRequest"
            examples:
              text_to_image:
                summary: Text to Image (simple)
                value:
                  model: gpt-image-2
                  prompt: A beautiful colorful sunset over the ocean
              text_to_image_hd:
                summary: Text to Image (HD 16:9)
                value:
                  model: gpt-image-2
                  prompt: Cinematic wide shot of a futuristic city skyline at dusk
                  size: "16:9"
                  resolution: 4K
                  quality: high
                  "n": 1
              text_to_image_pixel:
                summary: Text to Image (explicit pixels)
                value:
                  model: gpt-image-2
                  prompt: Minimalist logo design
                  size: 1024x1024
                  quality: medium
              image_edit:
                summary: Image-to-Image / Edit
                value:
                  model: gpt-image-2
                  prompt: Add a cute cat next to her
                  size: "1:1"
                  resolution: 1K
                  quality: medium
                  image_urls:
                    - https://example.com/input.png
                  callback_url: https://your-domain.com/webhook/image-done
              batch_generation:
                summary: Batch generation
                value:
                  model: gpt-image-2
                  prompt: A cute robot in pixel art style
                  size: "1:1"
                  resolution: 2K
                  quality: high
                  "n": 4
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
                  message: "Token does not have access to model: gpt-image-2"
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
          enum:
            - gpt-image-2
          default: gpt-image-2
          example: gpt-image-2
        prompt:
          type: string
          description: >-
            Prompt describing the image to be generated, or describing how to
            edit the input image


            **Limits:**

            - Up to `32000` characters (counted by Unicode code points, works
            for CJK and other languages)
          example: A beautiful colorful sunset over the ocean
          maxLength: 32000
        image_urls:
          type: array
          description: >-
            Reference image URL list for image-to-image and image editing
            functions


            **Note:**

            - Number of input images per request: `1~16`

            - Size of a single image: not exceeding `50MB`

            - Supported file formats: `.jpeg`, `.jpg`, `.png`, `.webp`

            - Image URLs must be directly accessible by the server, or the image
            URL should directly download when accessed (typically these URLs end
            with image file extensions, such as `.png`, `.jpg`)

            - In image-to-image / image editing scenarios, the reference images
            themselves also incur additional image input token consumption
          items:
            type: string
            format: uri
          example:
            - https://example.com/image1.png
            - https://example.com/image2.png
        size:
          type: string
          description: >-
            Size of the generated image. Supports both **ratio format** and
            **explicit pixel format**, defaults to `auto`


            **① Ratio format (recommended, 15 options)**


            - `1:1`: Square

            - `1:2` / `2:1`: Extreme portrait / landscape

            - `1:3` / `3:1`: Ultra portrait / landscape (3:1 limit)

            - `2:3` / `3:2`: Standard portrait / landscape

            - `3:4` / `4:3`: Classic portrait / landscape

            - `4:5` / `5:4`: Common social media

            - `9:16` / `16:9`: Mobile / desktop widescreen

            - `9:21` / `21:9`: Ultra-wide


            **② Explicit pixel format**: `WxH` (or `W×H`), e.g. `1024x1024`,
            `1536x1024`, `3840×2160`


            - Both width and height must be multiples of `16`

            - Each edge range: `[16, 3840]`

            - Pixel budget: `655,360 ≤ width × height ≤ 8,294,400` (about 0.65
            MP ~ 8.29 MP)

            - Aspect ratio: `≤ 3:1`


            **③ `auto`**: The model decides the size automatically (`resolution`
            does not apply in this mode)


            **Out-of-range handling:**

            - If a ratio + `resolution` combination exceeds the pixel budget,
            dimensions are automatically scaled down proportionally (e.g. 4K 2:1
            → 3840×1904)
          default: auto
          example: auto
        resolution:
          type: string
          description: >-
            Resolution tier shortcut, only effective when `size` is a ratio;
            ignored in explicit pixel mode


            **Pixel budget rules** (dimensions are derived from the target pixel
            count and the `size` ratio, aligned to multiples of 16):


            - `1K`: ~1 MP (1024² = 1,048,576 pixels)

            - `2K`: ~4 MP (2048² = 4,194,304 pixels)

            - `4K`: ~8.29 MP (3840×2160 = 8,294,400 pixels, the maximum)


            **Landscape / square output dimensions** (portrait dimensions are
            the landscape width/height swapped, e.g. `2:3` = `3:2` reversed):


            | Ratio | 1K | 2K | 4K |

            |---|---|---|---|

            | `1:1` | 1024×1024 | 2048×2048 | 2880×2880 |

            | `2:1` | 1456×720 | 2896×1456 | 3840×1904 \* |

            | `3:1` | 1776×592 | 3552×1184 | 3840×1280 \* |

            | `3:2` | 1248×832 | 2512×1680 | 3520×2352 |

            | `4:3` | 1184×880 | 2368×1776 | 3312×2480 \* |

            | `5:4` | 1152×912 | 2288×1824 | 3216×2576 |

            | `16:9` | 1360×768 | 2736×1536 | 3840×2160 (UHD) |

            | `21:9` | 1568×672 | 3136×1344 | 3840×1632 \* |


            \* Marks combinations that are auto-downscaled to fit the pixel
            budget. Values are case-insensitive.
          enum:
            - 1K
            - 2K
            - 4K
          default: 1K
          example: 1K
        quality:
          type: string
          description: >-
            Rendering quality that controls the model's "reasoning depth",
            directly affecting output token count and cost. Defaults to `medium`


            | Value | Tile base | Relative cost (1024²) |

            |---|---|---|

            | `low` | 16 | ~0.11× |

            | `medium` | 48 | 1.0× |

            | `high` | 96 | ~4.0× |
          enum:
            - low
            - medium
            - high
          default: medium
          example: medium
        "n":
          type: integer
          description: |-
            Number of images to generate, each billed independently

            **Note:**
            - Text input tokens scale linearly with `n`
          minimum: 1
          maximum: 10
          default: 1
          example: 1
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
          example: 1757156493
        id:
          type: string
          description: Task ID
          example: task-unified-1757156493-imcg5zqt
        model:
          type: string
          description: Actual model name used
          example: gpt-image-2
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
          example: 100
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
          example: 2.5
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
