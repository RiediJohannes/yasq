import { handleManualReconnect } from '../utils/reconnector';

export const DisconnectBanner = () => {
  return (
    <div className="warning-banner">
      Connection lost?
      <button onClick={handleManualReconnect}>Reconnect</button>
    </div>
  );
};
