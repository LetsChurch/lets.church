import { gql } from 'graphql-request';
export type {
  AboutPageStatsQuery,
  AboutPageStatsQueryVariables,
} from './__generated__/about';

export const aboutStatsQuery = gql`
  query AboutPageStats {
    stats {
      totalUploadSeconds
      totalUploads
    }
  }
`;
