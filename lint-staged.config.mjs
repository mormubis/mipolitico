export default {
  '*': ['prettier --ignore-unknown --write'],
  '*.{js,mjs,cjs,ts,tsx}': ['eslint --fix --max-warnings 0'],
};
