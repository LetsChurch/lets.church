import { gql } from 'graphql-request';
import type { Filters } from './searchbox';
import {
  ChurchesDataQuery,
  ChurchesDataQueryVariables,
} from './__generated__/data';
import { getAuthenticatedClient } from '~/util/gql/server';

export async function getChurchesData(f: Filters) {
  'use server';
  const client = await getAuthenticatedClient();

  try {
    const res = await client.request<
      ChurchesDataQuery,
      ChurchesDataQueryVariables
    >(
      gql`
        query ChurchesData(
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
                id
                ... on OrganizationSearchHit {
                  name
                  organization {
                    id
                    slug
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
      `,
      {
        lon: f.center[0],
        lat: f.center[1],
        range: f.range,
        organization: f.organization ?? null,
        tags: f.tags,
      },
    );

    return res;
  } catch (e) {
    console.log(e);

    return null;
  }
}
