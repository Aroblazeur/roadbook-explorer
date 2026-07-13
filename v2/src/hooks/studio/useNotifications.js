import { useCallback, useState } from "react";

export function useNotifications() {
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const clearError = useCallback(() => setError(null), []);
  const clearSuccess = useCallback(() => setSuccess(null), []);
  const clearNotifications = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  return {
    error,
    success,
    setError,
    setSuccess,
    clearError,
    clearSuccess,
    clearNotifications,
  };
}
