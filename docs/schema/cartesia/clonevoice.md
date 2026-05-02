> ## Documentation Index
>
> Fetch the complete documentation index at: https://docs.cartesia.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Clone Voice

> Clone a high similarity voice from an audio clip. Clones are more similar to the source clip, but may reproduce background noise. For these, use an audio clip about 5 seconds long.

## OpenAPI

```yaml /latest.yml POST /voices/clone
openapi: 3.0.1
info:
  title: Cartesia API
  version: 0.0.1
servers:
  - url: https://api.cartesia.ai
    description: Production
security: []
paths:
  /voices/clone:
    post:
      tags:
        - Voices
      summary: Clone Voice
      description: >-
        Clone a high similarity voice from an audio clip. Clones are more
        similar to the source clip, but may reproduce background noise. For
        these, use an audio clip about 5 seconds long.
      operationId: voices_clone
      parameters:
        - $ref: "#/components/parameters/CartesiaVersionHeader"
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                clip:
                  type: string
                  format: binary
                name:
                  type: string
                  description: The name of the voice.
                description:
                  description: A description for the voice.
                  type: string
                  nullable: true
                language:
                  $ref: "#/components/schemas/SupportedLanguage"
                  description: The language of the voice.
                base_voice_id:
                  $ref: "#/components/schemas/VoiceId"
                  description: >-
                    Optional base voice ID that the cloned voice is derived
                    from.
                  nullable: true
      responses:
        "200":
          description: ""
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/VoiceMetadata"
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
    VoiceId:
      title: VoiceId
      type: string
      description: The ID of the voice.
    VoiceMetadata:
      title: VoiceMetadata
      type: object
      properties:
        id:
          $ref: "#/components/schemas/VoiceId"
        user_id:
          type: string
          description: The ID of the user who owns the voice.
        is_public:
          type: boolean
          description: Whether the voice is publicly accessible.
        name:
          type: string
          description: The name of the voice.
        description:
          type: string
          description: The description of the voice.
        created_at:
          type: string
          format: date-time
          description: The date and time the voice was created.
        language:
          $ref: "#/components/schemas/SupportedLanguage"
      required:
        - id
        - user_id
        - is_public
        - name
        - description
        - created_at
        - language
  securitySchemes:
    APIKeyAuth:
      type: http
      scheme: bearer
      bearerFormat: API Key
      description: >-
        Cartesia API key (`sk_car_...`). Get one at
        [play.cartesia.ai/keys](https://play.cartesia.ai/keys).
```
