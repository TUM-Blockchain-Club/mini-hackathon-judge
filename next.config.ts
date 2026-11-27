import { withWorkflow } from 'workflow/next';
export default withWorkflow({
  async redirects() {
    return [
      { source: '/signup', destination: '/submit#signup', permanent: false },
      { source: '/login', destination: '/submit#login', permanent: false },
      ...['/', '/team', '/rules'].map((source) => ({
        source,
        destination: '/submit',
        permanent: true,
      })),
    ];
  },
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
});
