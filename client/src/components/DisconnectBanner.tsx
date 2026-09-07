import { handleManualReconnect } from '../utils/reconnector';

export const DisconnectBanner = () => {
  // if (socketConnected.value) return null;

  return (
    <div className="warning-banner">
      Connection lost?
      <button onClick={handleManualReconnect}>Reconnect</button>
    </div>
  );
};
