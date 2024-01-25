import { FilterXSS } from 'xss';

const xss = new FilterXSS({ whiteList: {} });

export default xss;
