export interface AvatarCreateResult {
  /** Provider-specific ID used for polling (e.g. HeyGen group_id). */
  externalId: string;
}

export interface AvatarPollResult {
  status: "ready" | "processing" | "failed";
  /** Preview image URL when status is "ready". */
  previewUrl?: string;
}

export interface AvatarAdapter {
  readonly provider: string;
  /**
   * Upload the image and submit the avatar creation request.
   * Returns an externalId that can be used to poll for completion.
   */
  create(imageBuffer: Buffer, contentType: string): Promise<AvatarCreateResult>;
  /**
   * Check the creation status of an avatar.
   */
  poll(externalId: string): Promise<AvatarPollResult>;
}
