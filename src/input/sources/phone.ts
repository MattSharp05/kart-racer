import { remoteInput, remoteSlotConnected, takeRemotePause } from '../../remote/desktop';
import type { InputFrame } from '../../sim/types';
import type { InputSource, InputSourceProvider } from './types';

/**
 * A paired phone as a player's controller (MK-147): the phone scanned from player slot `slot`'s
 * QR code drives that player's kart. P1's phone is merged into this device's own controls
 * (`PlayerInput`), so this hands out phones for P2–P4.
 */
export class PhoneSource implements InputSource {
  readonly kind = 'phone';
  readonly label = 'Phone';

  constructor(readonly slot: number) {}

  read(): InputFrame {
    return remoteInput(this.slot);
  }

  takePause(): boolean {
    return takeRemotePause(this.slot);
  }
}

/** Gives a player slot the phone paired to it, when one is connected as the race starts. */
export const phoneSources: InputSourceProvider = {
  id: 'phone',
  claim: (slot) => (slot > 0 && remoteSlotConnected(slot) ? new PhoneSource(slot) : null),
};
