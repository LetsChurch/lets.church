import { promisify } from 'node:util';
import rimraf from 'rimraf';

export default promisify(rimraf);
