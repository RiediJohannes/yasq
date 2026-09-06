import { signal } from '@preact/signals';
import { Socket } from 'socket.io-client';
import { initializeAppFlow, isInitializing } from '../main';
// import { auth, initializeAppFlow, isInitializing } from '../main'; // Adjust path as necessary
//
// // Hold the socket instance globally
export const socketSignal = signal<Socket | null>(null);
//
// export const handleManualReconnect = async () => {
//   if (isInitializing.value) return;
//
//   // TIER 1: We have our auth token, we just need to restart the socket connection.
//   if (auth.value && socketSignal.value) {
//     console.log("Attempting Soft Socket Reconnect...");
//     const currentSocket = socketSignal.value;
//
//     if (!currentSocket.connected) {
//       currentSocket.connect();
//     } else {
//       currentSocket.disconnect();
//       currentSocket.connect();
//     }
//     return;
//   }
//
//   // TIER 2: Auth is missing. We run the init flow (which now checks sessionStorage).
//   console.log("Retrying setup flow...");
//   await initializeAppFlow();
// };

export const handleManualReconnect = async () => {
  if (isInitializing.value) {
    console.log('Already initializing, ignoring click.');
    return;
  }

  console.log('Manual Reconnect Triggered!');
  await initializeAppFlow(true); // Pass true to trigger the diagnostic probes
};
