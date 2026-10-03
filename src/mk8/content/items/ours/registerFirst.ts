// Registers MK8 Mode's content before the item tests `../ours.test.ts` imports are collected
// (imports run in order, so this one must come first).
import { registerMk8Content } from '../../../register';

registerMk8Content();
