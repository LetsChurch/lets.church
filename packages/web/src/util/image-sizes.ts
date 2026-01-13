import { ResizeType } from './url';

/**
 * Image size constants for thumbnails, covers, and OpenGraph images.
 *
 * All dimensions use ResizeType.FILL to ensure proper cropping to exact dimensions
 * without letterboxing or pillarboxing.
 */

// OpenGraph image dimensions (1.91:1 aspect ratio)
// Used in meta tags for social media sharing
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

// Cover images (16:9 aspect ratio)
export const coverImageFull = {
  type: ResizeType.FILL,
  width: 1920,
  height: 1080,
};

// Thumbnail images
export const thumbnailFeatured = {
  type: ResizeType.FILL,
  width: 1280,
  height: 720,
};

export const thumbnailMedium = {
  type: ResizeType.FILL,
  width: 640,
  height: 360,
};

// Podcast/RSS feed images
export const podcastImage = {
  type: ResizeType.FILL,
  width: 512,
  height: 288,
};

export const rssFeedIcon = {
  type: ResizeType.FILL,
  width: 144,
  height: 144,
};

// Organization/Church avatars
export const organizationAvatarLarge = {
  type: ResizeType.FILL,
  width: 200,
  height: 200,
};

export const organizationAvatarMedium = {
  type: ResizeType.FILL,
  width: 80,
  height: 80,
};

export const organizationAvatarSmall = {
  type: ResizeType.FILL,
  width: 64,
  height: 64,
};

export const organizationAvatarTiny = {
  type: ResizeType.FILL,
  width: 32,
  height: 32,
};
