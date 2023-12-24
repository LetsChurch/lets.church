import { gql } from 'graphql-request';

export const UploadCardFields = gql`
  fragment UploadCardFields on UploadRecord {
    id
    title
    lengthSeconds
    publishedAt
    thumbnailUrl(resize: { width: 512, height: 288 })
    thumbnailLqUrl: thumbnailUrl(
      resize: { width: 512, height: 288 }
      quality: 20
    )
    hasVideo
    hasAudio
    channel {
      id
      name
      avatarUrl(resize: { width: 96, height: 96 })
      defaultThumbnailUrl(resize: { width: 512, height: 288 })
      defaultThumbnailLqUrl: defaultThumbnailUrl(
        resize: { width: 512, height: 288 }
      )
    }
  }
`;
