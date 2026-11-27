import { withWorkflow } from 'workflow/next';
export default withWorkflow({
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
});
