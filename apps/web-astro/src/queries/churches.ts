import * as z from 'zod';
import { graphql } from '../util/graphql';

export const churchesQuery = graphql(`
  query ChurchesQuery(
    $lon: Float!
    $lat: Float!
    $range: String!
    $denomination: [OrganizationDenomination!]
  ) {
    search(
      focus: ORGANIZATIONS
      query: ""
      geo: { lon: $lon, lat: $lat, range: $range }
      denomination: $denomination
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
  ]),
  denomination: z.array(z.string()).optional(),
});
