import envariant from '@knpwrs/envariant';
import waitOn from 'wait-on';

await waitOn({
  resources: [envariant('GRAPHQL_URL').replace('http://', 'http-get://')],
  headers: { Accept: 'text/html' },
});

console.log('API ready!');
