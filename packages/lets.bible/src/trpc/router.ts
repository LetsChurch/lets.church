import { bibleProcedures } from './procedures/bible';
import { commonProcedures } from './procedures/common';
import { homeProcedures } from './procedures/home';
import { libraryProcedures } from './procedures/library';
import { router } from './trpc';

export const appRouter = router({
  bible: bibleProcedures,
  common: commonProcedures,
  home: homeProcedures,
  library: libraryProcedures,
});

// AppRouter type lives in ./types (re-exported from ./index); see trpc/types.ts.
