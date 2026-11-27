import { withWorkflow } from 'workflow/next';
export default withWorkflow({
  async redirects() {
    return ['/', '/login', '/team', '/rules'].map((source) => ({
      source,
      destination: '/submit',
      permanent: true,
    }));
  },
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
});
