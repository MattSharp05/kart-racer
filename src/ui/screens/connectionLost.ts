import { registerScreen } from '../router';
import { button, heading, row } from './common';
import './connectionLost.css';

export interface ConnectionLostProps {
  /** What happened, in a line ("The host stopped answering."). */
  message: string;
  /** Back to the room's lobby for the next race (joining the room again if it's gone). */
  onRejoin: () => void;
  /** Out of the room, to the title. */
  onLeave: () => void;
}

declare module '../router' {
  interface ScreenProps {
    connectionLost: ConnectionLostProps;
  }
}

/**
 * Connection lost (MK-70): this device lost the host mid-race, or the host dropped it (a phone in
 * the background too long) and the AI drives its kart. Rejoin goes back to the room for the next
 * race; there's no way back into this one.
 */
registerScreen('connectionLost', (panel, { message, onRejoin, onLeave }) => {
  const text = document.createElement('p');
  text.className = 'connection-lost-message';
  text.setAttribute('role', 'alert');
  text.textContent = message;
  const rejoin = button('Rejoin', onRejoin, 'primary');
  panel.append(
    heading('h2', 'Connection lost'),
    text,
    row('actions', rejoin, button('Leave', onLeave)),
  );
  rejoin.focus();
  return {
    onKey: (e) => {
      if (e.key === 'Escape') onLeave();
    },
  };
});
