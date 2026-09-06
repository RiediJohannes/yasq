import { handleManualReconnect } from '../utils/reconnector';

export const DisconnectBanner = () => {
  // You could also track socket.connected state in a signal to conditionally show this
  return (
    <div className="warning-banner">
      Connection lost?
      <button onClick={handleManualReconnect}>Reconnect</button>
    </div>
  );
};
