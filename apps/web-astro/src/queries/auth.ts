import { graphql } from '../util/graphql';

export const meQuery = graphql(`
  query Me {
    me {
      id
      role
      avatarUrl(resize: { width: 96, height: 96 })
      canUpload
      username
      fullName
      subscribedToNewsletter
      emails {
        email
      }
    }
  }
`);
