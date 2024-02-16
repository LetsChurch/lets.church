import { graphql } from '../util/graphql';

export const churchesQuery = graphql(`
  query MyQuery {
    search(
      focus: ORGANIZATIONS
      query: ""
      geo: { lat: 42.57894, lon: -71.337634, miles: 10000 }
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
