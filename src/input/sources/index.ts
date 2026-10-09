import { phoneSources } from './phone';
import type { InputSourceProvider } from './types';

export type { InputSource, InputSourceProvider } from './types';
export { TestSource } from './testSource';

/**
 * Where empty player slots look for a controller when a local race starts (MK-144), in order. A
 * new kind of controller (the paired phone, MK-146) is one file exporting an
 * `InputSourceProvider` plus one line here. A slot nobody claims gets the "Auto" stand-in.
 */
export const inputSourceProviders: InputSourceProvider[] = [phoneSources];
