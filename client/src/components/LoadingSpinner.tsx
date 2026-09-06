export const LoadingSpinner = () => {
  return (
    <div className="centered">
      <Spinner />
    </div>
  );
};

export const LoadingState = ({ label }: { label: string }) => (
  <div className="centered">
    <div className="loading-container">
      <Spinner />
      <span className="loading-text">{label}...</span>
    </div>
  </div>
);

const Spinner = () => (
  <div
    className="loading-spinner"
    role="progressbar"
    aria-label="Loading..."
    aria-busy="true"
    aria-live="polite"
  />
);
