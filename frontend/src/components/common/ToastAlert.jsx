// Displays temporary bottom notification banners (success, warning, or error).
export default function ToastAlert({ toast }) {
  if (!toast) return null;
  const icon = toast.type === 'ok' ? '✓' : toast.type === 'warn' ? '⚠️' : '✕';
  return (
    <div className={`toast-bar ${toast.type}`} role="status">
      <span>{icon}</span>
      <span>{toast.msg}</span>
    </div>
  );
}
