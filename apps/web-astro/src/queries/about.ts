import { graphql } from '../util/graphql';

export const aboutStatsQuery = graphql(`
  query AboutPageStats {
    stats {
      totalUploadSeconds
      totalUploads
    }
  }
`);
