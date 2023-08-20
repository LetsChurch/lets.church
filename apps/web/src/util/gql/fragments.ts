import { gql } from 'graphql-request';

export const UploadCardFields = gql`
  fragment UploadCardFields on UploadRecord {
    id
    title
    thumbnailBlurhash
    thumbnailUrl
    channel {
      id
      name
      avatarUrl
      defaultThumbnailUrl
      defaultThumbnailBlurhash
    }
  }
`;
