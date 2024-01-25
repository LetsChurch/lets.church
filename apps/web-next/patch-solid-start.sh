fd --type f --extension tsx --extension ts --exclude '*.d.ts' --full-path node_modules/@solidjs/start --no-ignore -x sed -i '1s/^/\/\/ @ts-nocheck\n\n/'
npx patch-package @solidjs/start
