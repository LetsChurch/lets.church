import { gql } from './server';

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
    }
  }
`;
