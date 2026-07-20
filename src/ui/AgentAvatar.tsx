import Image from 'next/image';

const AGENT_PORTRAIT_REVISION = 'characters-20260720';

export function agentPortraitSrc(index: number): string {
  return `/assets/agents/agent_${index}.png?v=${AGENT_PORTRAIT_REVISION}`;
}

export function AgentAvatar({ index, name, dead, src }: { index: number; name: string; dead: boolean; src?: string }) {
  const portrait = src ?? agentPortraitSrc(index);
  return (
    <div className={`agent-avatar ${dead ? 'dead' : ''}`}>
      <Image src={portrait} width={96} height={96} alt={`${name}の立ち絵`} priority={index <= 3} unoptimized={portrait.startsWith('data:')} />
    </div>
  );
}
