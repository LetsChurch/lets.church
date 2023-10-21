import { gql } from 'graphql-request';

export const UploadCardFields = gql`
  fragment UploadCardFields on UploadRecord {
    id
    title
    thumbnailBlurhash
    thumbnailUrl(resize: { width: 512, height: 288 })
    channel {
      id
      name
      avatarUrl(resize: { width: 96, height: 96 })
      defaultThumbnailUrl(resize: { width: 512, height: 288 })
      defaultThumbnailBlurhash
    }
  }
`;
