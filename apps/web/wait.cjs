require('wait-on')({
  resources: [process.env.GRAPHQL_URL.replace('http://', 'http-get://')],
  headers: { Accept: 'text/html' },
}).then(() => console.log('API ready!'));
