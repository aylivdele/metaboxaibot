> ## Documentation Index
>
> Fetch the complete documentation index at: https://docs.cartesia.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Delete Voice

## OpenAPI

```yaml /latest.yml DELETE /voices/{id}
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
    delete:
      tags:
        - Voices
      summary: Delete Voice
      operationId: voices_delete
      parameters:
        - $ref: "#/components/parameters/CartesiaVersionHeader"
        - name: id
          in: path
          required: true
          schema:
            $ref: "#/components/schemas/VoiceId"
      responses:
        "204":
          description: ""
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
  securitySchemes:
    APIKeyAuth:
      type: http
      scheme: bearer
      bearerFormat: API Key
      description: >-
        Cartesia API key (`sk_car_...`). Get one at
        [play.cartesia.ai/keys](https://play.cartesia.ai/keys).
```
