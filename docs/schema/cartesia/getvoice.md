> ## Documentation Index
>
> Fetch the complete documentation index at: https://docs.cartesia.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Get Voice

## OpenAPI

```yaml /latest.yml GET /voices/{id}
openapi: 3.0.1
info:
  title: Cartesia API
  version: 0.0.1
servers:
  - url: https://api.cartesia.ai
    description: Production
security: []
paths:
  /voices/{id}:
    get:
      tags:
        - Voices
      summary: Get Voice
      operationId: voices_get
      parameters:
        - $ref: "#/components/parameters/CartesiaVersionHeader"
        - name: id
          in: path
          required: true
          schema:
            $ref: "#/components/schemas/VoiceId"
        - name: expand[]
          in: query
          description: Additional fields to include in the response.
          required: false
          schema:
            type: array
            items:
              $ref: "#/components/schemas/VoiceExpandOptions"
            nullable: true
      responses:
        "200":
          description: ""
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Voice"
      security:
        - APIKeyAuth: []
components:
  parameters:
    CartesiaVersionHeader:
      name: Cartesia-Version
      in: header
      description: API version header.
      required: true
      schema:
        type: string
        format: date
        example: "2026-03-01"
        enum:
          - "2024-06-10"
          - "2024-11-13"
          - "2025-04-16"
          - "2026-03-01"
  schemas:
    VoiceId:
      title: VoiceId
      type: string
      description: The ID of the voice.
    VoiceExpandOptions:
      title: VoiceExpandOptions
      type: string
      enum:
        - preview_file_url
    Voice:
      title: Voice
      type: object
      properties:
        id:
          $ref: "#/components/schemas/VoiceId"
        is_owner:
          type: boolean
          description: Whether your organization owns the voice.
        is_public:
          type: boolean
          description: Whether the voice is publicly accessible.
        name:
          type: string
          description: The name of the voice.
        description:
          type: string
          description: The description of the voice.
        gender:
          $ref: "#/components/schemas/GenderPresentation"
          nullable: true
          description: The gender of the voice, if specified.
        created_at:
          type: string
          format: date-time
          description: The date and time the voice was created.
        preview_file_url:
          type: string
          nullable: true
          description: >-
            A URL to download a preview audio file for this voice. Useful to
            avoid consuming credits when looking for the right voice. The URL
            requires the same Authorization header. Voice previews may be
            changed, moved, or deleted so you should avoid storing the URL
            permanently. This property will be null if there's no preview
            available. Only included when `expand[]` includes
            `preview_file_url`.
        language:
          $ref: "#/components/schemas/SupportedLanguage"
      required:
        - id
        - is_owner
        - is_public
        - name
        - description
        - created_at
        - language
      example:
        id: <string>
        is_owner: true
        is_public: false
        name: <string>
        description: <string>
        language: en
        created_at: "2024-11-04T05:31:56Z"
    GenderPresentation:
      title: GenderPresentation
      type: string
      enum:
        - masculine
        - feminine
        - gender_neutral
    SupportedLanguage:
      title: SupportedLanguage
      type: string
      enum:
        - en
        - fr
        - de
        - es
        - pt
        - zh
        - ja
        - hi
        - it
        - ko
        - nl
        - pl
        - ru
        - sv
        - tr
        - tl
        - bg
        - ro
        - ar
        - cs
        - el
        - fi
        - hr
        - ms
        - sk
        - da
        - ta
        - uk
        - hu
        - "no"
        - vi
        - bn
        - th
        - he
        - ka
        - id
        - te
        - gu
        - kn
        - ml
        - mr
        - pa
      description: >-
        The language that the given voice should speak the transcript in. For
        valid options, see [Models](/build-with-cartesia/tts-models/latest).
  securitySchemes:
    APIKeyAuth:
      type: http
      scheme: bearer
      bearerFormat: API Key
      description: >-
        Cartesia API key (`sk_car_...`). Get one at
        [play.cartesia.ai/keys](https://play.cartesia.ai/keys).
```
