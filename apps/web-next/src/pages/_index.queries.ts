import { gql } from 'graphql-request';
import { UploadCardFields } from '../components/media/upload-card.queries';

export const homepageQuery = gql`
  ${UploadCardFields}

  query HomepageData($loggedIn: Boolean!) {
    subscriptionUploads: mySubscriptionUploadRecords(first: 5)
      @include(if: $loggedIn) {
      pageInfo {
        hasNextPage
        startCursor
        endCursor
      }
      edges {
        cursor
        node {
          ...UploadCardFields
        }
      }
    }

    trendingUploads: uploadRecords(orderBy: trending, first: 60) {
      pageInfo {
        hasNextPage
        startCursor
        endCursor
      }
      edges {
        cursor
        node {
          ...UploadCardFields
        }
      }
    }
  }
`;
