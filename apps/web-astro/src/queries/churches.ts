import * as z from 'zod';
import { graphql, type ResultOf } from '../util/graphql';

export const churchesQuery = graphql(`
  query ChurchesQuery(
    $lon: Float!
    $lat: Float!
    $range: String!
    $organization: ShortUuid
    $tags: [String!]
  ) {
    search(
      focus: ORGANIZATIONS
      query: ""
      geo: { lon: $lon, lat: $lat, range: $range }
      organization: $organization
      tags: $tags
      first: 100
    ) {
      edges {
        node {
          __typename
          ... on OrganizationSearchHit {
            id
            name
            organization {
              id
              type
              addresses(type: MEETING) {
                edges {
                  node {
                    country
                    locality
                    region
                    streetAddress
                    postOfficeBoxNumber
                    postalCode
                    latitude
                    longitude
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`);

export const churchesPayloadSchema = z.object({
  center: z.array(z.number()).length(2),
  range: z.enum([
    '5 mi',
    '10 mi',
    '25 mi',
    '50 mi',
    '100 mi',
    '200 mi',
    '500 mi',
    '1000 mi',
    '25000 mi',
  ]),
  tags: z.array(z.string()).optional(),
  organization: z.string().nullable().optional(),
});

export const ministriesQuery = graphql(`
  query MinistriesQuery($query: String!) {
    search(focus: ORGANIZATIONS, query: $query, orgType: MINISTRY) {
      edges {
        organization: node {
          ... on OrganizationSearchHit {
            id
            name
          }
        }
      }
    }
  }
`);

export const organizationQuery = graphql(`
  query OrganizationById($id: ShortUuid!) {
    organizationById(id: $id) {
      name
    }
  }
`);

export const organizationTagsQuery = graphql(`
  query OrganizationTags {
    organizationTagsConnection(first: 1024) {
      edges {
        node {
          category
          slug
          label
          color
        }
      }
    }
  }
`);

export type OrgTagQueryNode = ResultOf<
  typeof organizationTagsQuery
>['organizationTagsConnection']['edges'][number]['node'];
