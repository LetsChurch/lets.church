import { gql } from 'graphql-request';
export type {
  MediaPageMetaDataQuery,
  MediaPageMetaDataQueryVariables,
  MediaRouteRecordViewMutation,
  MediaRouteRecordViewMutationVariables,
} from './__generated__/media';

export const mediaPageMetaDataQuery = gql`
  fragment CommentFields on UploadUserComment {
    id
    uploadRecordId
    author {
      username
      avatarUrl(resize: { width: 96, height: 96 })
    }
    createdAt
    updatedAt
    text
    totalLikes
    totalDislikes
    myRating
  }

  query MediaPageMetaData(
    $id: ShortUuid!
    $seriesId: ShortUuid
    $commentsFirst: Int
    $commentsAfter: String
    $commentsLast: Int
    $commentsBefore: String
  ) {
    data: uploadRecordById(id: $id) {
      id
      title
      lengthSeconds
      description
      publishedAt
      totalViews
      channel {
        id
        slug
        name
        avatarUrl(resize: { width: 96, height: 96 })
        defaultThumbnailUrl
        userIsSubscribed
      }
      mediaSource
      audioSource
      thumbnailUrl
      peaksDatUrl
      peaksJsonUrl
      downloadsEnabled
      downloadUrls {
        kind
        label
        url
      }
      series: uploadListById(id: $seriesId) {
        id
        title
        uploads {
          edges {
            node {
              upload {
                id
                title
              }
            }
          }
        }
      }
      transcript {
        start
        text
      }
      userCommentsEnabled
      userComments(
        first: $commentsFirst
        after: $commentsAfter
        last: $commentsLast
        before: $commentsBefore
      ) {
        totalCount
        pageInfo {
          endCursor
          hasNextPage
          hasPreviousPage
          startCursor
        }
        edges {
          node {
            ...CommentFields
            replies {
              totalCount
              edges {
                node {
                  ...CommentFields
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const recordViewMutation = gql`
  mutation MediaRouteRecordView($id: ShortUuid!) {
    recordUploadView(uploadRecordId: $id)
  }
`;
