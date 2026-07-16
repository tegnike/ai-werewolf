const colors = ['#ffb454', '#7dd3fc', '#c4b5fd', '#86efac', '#fda4af', '#fde047', '#93c5fd', '#d8b4fe', '#67e8f9'];

export function AgentAvatar({ index, dead }: { index: number; dead: boolean }) {
  const color = colors[index - 1];
  return (
    <svg className="agent-avatar" viewBox="0 0 64 64" role="img" aria-label={`Agent ${index}の抽象AIアバター`}>
      <defs><linearGradient id={`agent-${index}`} x1="0" x2="1"><stop stopColor={color} /><stop offset="1" stopColor="#fff" /></linearGradient></defs>
      <path d="M32 5 55 18v28L32 59 9 46V18Z" fill={dead ? '#4b5563' : `url(#agent-${index})`} opacity=".95" />
      <rect x="18" y="21" width="28" height="23" rx="9" fill="#111827" />
      <circle cx="26" cy="32" r="3" fill={dead ? '#9ca3af' : color} />
      <circle cx="38" cy="32" r="3" fill={dead ? '#9ca3af' : color} />
      <path d="M25 39h14" stroke="#e5e7eb" strokeWidth="2" strokeLinecap="round" />
      <path d="M32 14v7" stroke="#111827" strokeWidth="3" /><circle cx="32" cy="12" r="3" fill="#111827" />
    </svg>
  );
}
